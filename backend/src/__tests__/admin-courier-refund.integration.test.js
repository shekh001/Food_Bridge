/**
 * Tests for the admin side of courier refunds: a Razorpay refund can fail
 * (network blip, etc), and until this the ONLY trace of that was a push
 * notification promising "our team will follow up" with no actual way for
 * anyone to follow up. This gives admin a queue and a retry action.
 */
process.env.JWT_SECRET = 'test-secret';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'dummy_secret';

jest.mock('../models/User');
jest.mock('../models/CourierBooking');
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  payments: { refund: jest.fn() },
})));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const User = require('../models/User');
const CourierBooking = require('../models/CourierBooking');
const { app } = require('../server');

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
}

const admin = { _id: 'admin-1', role: 'admin', orgName: 'Ops', verified: true };

function mockFindById(user) {
  return { select: () => Promise.resolve(user) };
}

afterAll(() => {
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockReturnValue(mockFindById(admin));
});

describe('GET /api/admin/couriers', () => {
  test('admin can list all courier bookings, refund_failed sorted first', async () => {
    const bookings = [
      { _id: 'b1', refundStatus: 'not_applicable', toObject: function () { return this; } },
      { _id: 'b2', refundStatus: 'refund_failed', toObject: function () { return this; } },
      { _id: 'b3', refundStatus: 'refunded', toObject: function () { return this; } },
    ];
    CourierBooking.find.mockReturnValue({
      sort: function () { return this; },
      populate: function () { return this; },
      then: (resolve) => resolve(bookings), // acts like an awaitable query
    });

    const res = await request(app)
      .get('/api/admin/couriers')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.bookings[0].refundStatus).toBe('refund_failed');
  });

  test('a non-admin cannot list courier bookings', async () => {
    const donor = { _id: 'donor-1', role: 'donor' };
    User.findById.mockReturnValue(mockFindById(donor));

    const res = await request(app)
      .get('/api/admin/couriers')
      .set('Authorization', `Bearer ${tokenFor(donor)}`);

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/couriers/:id/retry-refund', () => {
  test('successfully retries and updates refundStatus to refunded', async () => {
    const booking = {
      _id: 'booking-1', refundStatus: 'refund_failed', razorpayPaymentId: 'pay_123', feeInr: 35,
      requestedBy: 'ngo-1', save: jest.fn().mockResolvedValue(true),
    };
    CourierBooking.findById.mockResolvedValue(booking);
    Razorpay.mockImplementation(() => ({
      payments: { refund: jest.fn().mockResolvedValue({}) },
    }));

    const res = await request(app)
      .patch('/api/admin/couriers/booking-1/retry-refund')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(200);
    expect(booking.refundStatus).toBe('refunded');
    expect(booking.save).toHaveBeenCalled();
  });

  test('rejects retrying a booking that is not in refund_failed state', async () => {
    CourierBooking.findById.mockResolvedValue({ _id: 'booking-1', refundStatus: 'refunded' });

    const res = await request(app)
      .patch('/api/admin/couriers/booking-1/retry-refund')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(409);
  });

  test('404s for a booking that does not exist', async () => {
    CourierBooking.findById.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/admin/couriers/nope/retry-refund')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(404);
  });
});
