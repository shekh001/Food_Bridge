/**
 * Tests for the "book a pickup courier" feature: an NGO pays a small
 * convenience fee to have a (simulated) courier collect a claimed listing.
 * Same demo/live payment split as billing — only the payment can be real,
 * the courier dispatch itself is always simulated.
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

const ngo = { _id: 'ngo-1', role: 'ngo', orgName: 'Umeed Shelter', verified: true };
const otherNgo = { _id: 'ngo-2', role: 'ngo', orgName: 'Other NGO', verified: true };
const donor = { _id: 'donor-1', role: 'donor', orgName: 'Spice Route', verified: true };

function mockUser(u) {
  return { select: () => Promise.resolve(u) };
}

beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockImplementation((id) => {
    if (id === ngo._id) return mockUser(ngo);
    if (id === otherNgo._id) return mockUser(otherNgo);
    return mockUser(donor);
  });
});

describe('POST /api/couriers/:listingId/create-order — demo mode (no Razorpay keys)', () => {
  test('returns a demo-mode quote without creating a booking yet', async () => {
    User.findById.mockReturnValue(mockUser(ngo));
    FoodListing.findById.mockResolvedValue({ _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed' });
    CourierBooking.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/couriers/listing-1/create-order')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`);

    expect(res.status).toBe(200);
    expect(res.body.demoMode).toBe(true);
    expect(res.body.amountInr).toBe(35);
    expect(CourierBooking.create).not.toHaveBeenCalled();
  });

  test('rejects a courier request from an NGO that did not claim the listing', async () => {
    User.findById.mockReturnValue(mockUser(otherNgo));
    FoodListing.findById.mockResolvedValue({ _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed' });

    const res = await request(app)
      .post('/api/couriers/listing-1/create-order')
      .set('Authorization', `Bearer ${tokenFor(otherNgo)}`);

    expect(res.status).toBe(403);
  });

  test('rejects once the listing has already been picked up', async () => {
    User.findById.mockReturnValue(mockUser(ngo));
    FoodListing.findById.mockResolvedValue({ _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'picked_up' });

    const res = await request(app)
      .post('/api/couriers/listing-1/create-order')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`);

    expect(res.status).toBe(409);
  });

  test('rejects a second booking on the same listing', async () => {
    User.findById.mockReturnValue(mockUser(ngo));
    FoodListing.findById.mockResolvedValue({ _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed' });
    CourierBooking.findOne.mockResolvedValue({ _id: 'existing-booking' });

    const res = await request(app)
      .post('/api/couriers/listing-1/create-order')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`);

    expect(res.status).toBe(409);
  });
});

describe('POST /api/couriers/:listingId/confirm-demo', () => {
  test('creates a booking with a simulated courier assignment and notifies the donor', async () => {
    User.findById.mockReturnValue(mockUser({ ...ngo, address: '45 Ashram Road, Umeed Shelter' }));
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed', foodType: 'Cooked meals',
      pickupLocation: { address: '12 MG Road, Spice Route Restaurant' },
    });
    CourierBooking.findOne.mockResolvedValue(null);
    let createdWith;
    CourierBooking.create.mockImplementation((data) => {
      createdWith = data;
      return Promise.resolve({ ...data, _id: 'booking-1' });
    });

    const res = await request(app)
      .post('/api/couriers/listing-1/confirm-demo')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`);

    expect(res.status).toBe(201);
    expect(createdWith.feeInr).toBe(35);
    expect(createdWith.courierName).toBeTruthy();
    expect(createdWith.etaMinutes).toBeGreaterThanOrEqual(20);
    expect(createdWith.pickupAddress).toBe('12 MG Road, Spice Route Restaurant');
    expect(createdWith.dropoffAddress).toBe('45 Ashram Road, Umeed Shelter');
    expect(res.body.booking.courierName).toBe(createdWith.courierName);
  });
});

describe('GET /api/couriers/:listingId — donor read-only visibility', () => {
  test('the donor of the listing can see the courier that was booked for it', async () => {
    User.findById.mockReturnValue(mockUser(donor));
    FoodListing.findById.mockReturnValue({ select: () => Promise.resolve({ donor: 'donor-1', claimedBy: 'ngo-1' }) });
    CourierBooking.findOne.mockResolvedValue({ courierName: 'Raj Kumar', etaMinutes: 25, status: 'assigned' });

    const res = await request(app)
      .get('/api/couriers/listing-1')
      .set('Authorization', `Bearer ${tokenFor(donor)}`);

    expect(res.status).toBe(200);
    expect(res.body.booking.courierName).toBe('Raj Kumar');
  });

  test('an unrelated user cannot see the courier booking', async () => {
    User.findById.mockReturnValue(mockUser(otherNgo));
    FoodListing.findById.mockReturnValue({ select: () => Promise.resolve({ donor: 'donor-1', claimedBy: 'ngo-1' }) });

    const res = await request(app)
      .get('/api/couriers/listing-1')
      .set('Authorization', `Bearer ${tokenFor(otherNgo)}`);

    expect(res.status).toBe(403);
  });
});
