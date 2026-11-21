/**
 * Two more courier fixes:
 *  1. Live Razorpay mode: if the listing became unbookable in the few
 *     seconds between the NGO opening checkout and this request landing,
 *     the payment (which already succeeded on Razorpay's side) must be
 *     refunded automatically instead of just rejecting the request.
 *  2. Marking a listing "picked up" now also flips its courier booking's
 *     own status to 'picked_up' — no separate manual step required.
 */
process.env.JWT_SECRET = 'test-secret';

jest.mock('../models/User');
jest.mock('../models/FoodListing');
jest.mock('../models/CourierBooking');
const mockRefund = jest.fn().mockResolvedValue({ id: 'rfnd_test' });
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  payments: { refund: mockRefund },
})));

const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const FoodListing = require('../models/FoodListing');
const CourierBooking = require('../models/CourierBooking');
const { app } = require('../server');

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
}

function mockUser(u) {
  return { select: () => Promise.resolve(u) };
}

const ngo = { _id: 'ngo-1', role: 'ngo', orgName: 'Umeed Shelter', verified: true };

function signedPayload(secret) {
  const razorpay_order_id = 'order_abc';
  const razorpay_payment_id = 'pay_xyz';
  const razorpay_signature = crypto
    .createHmac('sha256', secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  return { razorpay_order_id, razorpay_payment_id, razorpay_signature };
}

describe('POST /api/couriers/:listingId/verify — live mode race condition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
    User.findById.mockReturnValue(mockUser(ngo));
  });

  afterAll(() => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
  });

  test('valid signature + still-bookable listing creates the booking normally', async () => {
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed',
      foodType: 'Cooked meals', pickupLocation: { address: '12 MG Road' },
    });
    CourierBooking.findOne.mockResolvedValue(null);
    CourierBooking.create.mockResolvedValue({ _id: 'booking-1', courierName: 'Raj Kumar' });

    const res = await request(app)
      .post('/api/couriers/listing-1/verify')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send(signedPayload('rzp_test_secret'));

    expect(res.status).toBe(201);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('a bad signature is rejected before any refund logic even runs', async () => {
    const res = await request(app)
      .post('/api/couriers/listing-1/verify')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send({ razorpay_order_id: 'order_abc', razorpay_payment_id: 'pay_xyz', razorpay_signature: 'not-the-real-signature' });

    expect(res.status).toBe(400);
    expect(FoodListing.findById).not.toHaveBeenCalled();
  });

  test('listing became unbookable after payment succeeded — refunds automatically', async () => {
    // Donor cancelled the listing in the seconds between checkout opening
    // and this request landing.
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'cancelled',
    });

    const res = await request(app)
      .post('/api/couriers/listing-1/verify')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send(signedPayload('rzp_test_secret'));

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/refunded/i);
    expect(mockRefund).toHaveBeenCalledWith('pay_xyz', { amount: 3500 });
    expect(CourierBooking.create).not.toHaveBeenCalled();
  });

  test('someone else already booked a courier in the meantime — refunds automatically', async () => {
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed',
    });
    CourierBooking.findOne.mockResolvedValue({ _id: 'already-exists' });

    const res = await request(app)
      .post('/api/couriers/listing-1/verify')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send(signedPayload('rzp_test_secret'));

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/refunded/i);
    expect(mockRefund).toHaveBeenCalled();
  });
});

describe('Marking a listing picked up syncs its courier booking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
  });

  test('an assigned courier booking flips to picked_up when the listing does', async () => {
    const donor = { _id: 'donor-1', role: 'donor', verified: true };
    User.findById.mockReturnValue(mockUser({ ...ngo, role: 'ngo' }));
    const listingDoc = {
      _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed',
      save: jest.fn().mockResolvedValue(true),
    };
    FoodListing.findById.mockResolvedValue(listingDoc);

    const activeBooking = {
      _id: 'booking-1', listing: 'listing-1', status: 'assigned',
      save: jest.fn().mockResolvedValue(true),
    };
    CourierBooking.findOne.mockResolvedValue(activeBooking);

    const res = await request(app)
      .patch('/api/listings/listing-1/status')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send({ status: 'picked_up' });

    expect(res.status).toBe(200);
    expect(activeBooking.status).toBe('picked_up');
    expect(activeBooking.pickedUpAt).toBeInstanceOf(Date);
    expect(activeBooking.save).toHaveBeenCalled();
  });

  test('marking pickup with no courier booked is a clean no-op', async () => {
    User.findById.mockReturnValue(mockUser(ngo));
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed',
      save: jest.fn().mockResolvedValue(true),
    });
    CourierBooking.findOne.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/listings/listing-1/status')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send({ status: 'picked_up' });

    expect(res.status).toBe(200);
  });
});
