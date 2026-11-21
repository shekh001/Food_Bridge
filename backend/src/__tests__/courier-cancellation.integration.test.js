/**
 * Tests for courier-booking cancellation:
 *  1. Auto-cleanup — a paid courier booking must not be left orphaned when
 *     the donor cancels the listing or the NGO releases their claim.
 *  2. PATCH /api/couriers/:id/cancel — the NGO explicitly cancels a booking
 *     it no longer needs (their own transport showed up after all, etc).
 * Both paths attempt a refund and are a no-op ('not_applicable') for
 * demo-mode bookings, since those never moved real money.
 */
process.env.JWT_SECRET = 'test-secret';
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

jest.mock('../models/User');
jest.mock('../models/FoodListing');
jest.mock('../models/CourierBooking');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const FoodListing = require('../models/FoodListing');
const CourierBooking = require('../models/CourierBooking');
const { app } = require('../server');

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
}

const donor = { _id: 'donor-1', role: 'donor', orgName: 'Spice Route', verified: true };
const ngo = { _id: 'ngo-1', role: 'ngo', orgName: 'Umeed Shelter', verified: true };

function mockUser(u) {
  return { select: () => Promise.resolve(u) };
}

beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockImplementation((id) => mockUser(id === donor._id ? donor : ngo));
});

describe('Auto-cleanup: donor cancels a listing with an active courier booking', () => {
  test('the orphaned booking gets cancelled, refund attempted, NGO notified', async () => {
    User.findById.mockReturnValue(mockUser(donor));
    const listingDoc = {
      _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed', foodType: 'Cooked meals',
      save: jest.fn().mockResolvedValue(true),
    };
    FoodListing.findById.mockImplementation(() => Promise.resolve(listingDoc));
    // First call inside updateStatus loads the listing; second call (via
    // cancelActiveBookingForListing's own notify step) looks it up again —
    // findById is mocked to always resolve the same doc either way.

    const activeBooking = {
      _id: 'booking-1', listing: 'listing-1', requestedBy: 'ngo-1', feeInr: 35,
      status: 'assigned', razorpayPaymentId: null,
      save: jest.fn().mockResolvedValue(true),
    };
    CourierBooking.findOne.mockResolvedValue(activeBooking);

    const res = await request(app)
      .patch('/api/listings/listing-1/status')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(activeBooking.status).toBe('cancelled');
    expect(activeBooking.cancelledBy).toBe('system');
    expect(activeBooking.refundStatus).toBe('not_applicable'); // demo-mode booking, no real payment id
    expect(activeBooking.save).toHaveBeenCalled();
  });

  test('cancelling a listing with no active courier booking is a clean no-op', async () => {
    User.findById.mockReturnValue(mockUser(donor));
    const listingDoc = {
      _id: 'listing-1', donor: 'donor-1', claimedBy: null, status: 'posted', foodType: 'Cooked meals',
      save: jest.fn().mockResolvedValue(true),
    };
    FoodListing.findById.mockResolvedValue(listingDoc);
    CourierBooking.findOne.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/listings/listing-1/status')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
  });
});

describe('Auto-cleanup: NGO releases a claim with an active courier booking', () => {
  test('the orphaned booking gets cancelled so a future NGO can book a courier on this listing again', async () => {
    User.findById.mockReturnValue(mockUser(ngo));
    const claimedDoc = { _id: 'listing-1', donor: { _id: 'donor-1', orgName: 'Spice Route' }, foodType: 'Cooked meals' };
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', claimedBy: 'ngo-1', status: 'claimed', expiryAt: new Date(Date.now() + 3600 * 1000),
    });
    FoodListing.findOneAndUpdate.mockReturnValue({ populate: () => Promise.resolve(claimedDoc) });

    const activeBooking = {
      _id: 'booking-1', listing: 'listing-1', requestedBy: 'ngo-1', feeInr: 35, status: 'assigned',
      save: jest.fn().mockResolvedValue(true),
    };
    CourierBooking.findOne.mockResolvedValue(activeBooking);

    const res = await request(app)
      .post('/api/listings/listing-1/release')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send({ reason: 'Vehicle broke down' });

    expect(res.status).toBe(200);
    expect(activeBooking.status).toBe('cancelled');
    expect(activeBooking.cancelledBy).toBe('system');
  });
});

describe('PATCH /api/couriers/:id/cancel — NGO explicitly cancels their own booking', () => {
  test('cancels the booking and notifies the donor', async () => {
    User.findById.mockReturnValue(mockUser(ngo));
    const booking = {
      _id: 'booking-1', requestedBy: 'ngo-1', listing: 'listing-1', feeInr: 35, status: 'assigned',
      save: jest.fn().mockResolvedValue(true),
    };
    CourierBooking.findById.mockResolvedValue(booking);
    FoodListing.findById.mockReturnValue({
      select: () => Promise.resolve({ donor: 'donor-1', claimedBy: 'ngo-1', foodType: 'Cooked meals' }),
    });

    const res = await request(app)
      .patch('/api/couriers/booking-1/cancel')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send({ reason: 'Our own volunteer is on the way after all' });

    expect(res.status).toBe(200);
    expect(booking.status).toBe('cancelled');
    expect(booking.cancelledBy).toBe('ngo');
    expect(res.body.refundMessage).toBeNull();
  });

  test('rejects cancelling someone else\'s booking', async () => {
    const otherNgo = { _id: 'ngo-2', role: 'ngo' };
    User.findById.mockReturnValue(mockUser(otherNgo));
    CourierBooking.findById.mockResolvedValue({ _id: 'booking-1', requestedBy: 'ngo-1', status: 'assigned' });

    const res = await request(app)
      .patch('/api/couriers/booking-1/cancel')
      .set('Authorization', `Bearer ${tokenFor(otherNgo)}`);

    expect(res.status).toBe(403);
  });

  test('rejects cancelling a booking that has already been picked up', async () => {
    User.findById.mockReturnValue(mockUser(ngo));
    CourierBooking.findById.mockResolvedValue({ _id: 'booking-1', requestedBy: 'ngo-1', status: 'picked_up' });

    const res = await request(app)
      .patch('/api/couriers/booking-1/cancel')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`);

    expect(res.status).toBe(409);
  });

  test('rejects cancelling an already-cancelled booking', async () => {
    User.findById.mockReturnValue(mockUser(ngo));
    CourierBooking.findById.mockResolvedValue({ _id: 'booking-1', requestedBy: 'ngo-1', status: 'cancelled' });

    const res = await request(app)
      .patch('/api/couriers/booking-1/cancel')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`);

    expect(res.status).toBe(409);
  });
});
