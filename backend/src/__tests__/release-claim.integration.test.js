/**
 * Tests for POST /api/listings/:id/release — an NGO backing out of a claim
 * it can no longer fulfil. The listing should reopen for other NGOs
 * (status back to 'posted') rather than staying permanently stuck as
 * 'claimed' with nobody coming to pick it up.
 */
process.env.JWT_SECRET = 'test-secret';

jest.mock('../models/User');
jest.mock('../models/FoodListing');
jest.mock('../models/CourierBooking'); // touched by releaseClaim's courier-cleanup — automock returns undefined for findOne, which is the "no active courier" no-op case

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const FoodListing = require('../models/FoodListing');
const { app } = require('../server');

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
}

const ngo = { _id: 'ngo-1', role: 'ngo', orgName: 'Test NGO' };
const otherNgo = { _id: 'ngo-2', role: 'ngo', orgName: 'Other NGO' };

function mockPopulatedUpdate(result) {
  return { populate: jest.fn(() => Promise.resolve(result)) };
}

describe('POST /api/listings/:id/release', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockReturnValue({ select: () => Promise.resolve(ngo) });
  });

  test('releases a still-fresh claim back to posted, and broadcasts it to NGOs again', async () => {
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', claimedBy: 'ngo-1', status: 'claimed', expiryAt: new Date(Date.now() + 3600_000),
    });
    FoodListing.findOneAndUpdate.mockReturnValue(mockPopulatedUpdate({
      _id: 'listing-1', status: 'posted', foodType: 'Rice', donor: { _id: 'donor-1', orgName: 'Test Donor' },
    }));

    const res = await request(app)
      .post('/api/listings/listing-1/release')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send({ reason: 'Vehicle broke down' });

    expect(res.status).toBe(200);
    expect(FoodListing.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'listing-1', claimedBy: 'ngo-1', status: 'claimed' },
      expect.objectContaining({ status: 'posted', claimedBy: null, claimedAt: null }),
      expect.anything(),
    );
  });

  test('an NGO cannot release a listing it did not claim', async () => {
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', claimedBy: 'ngo-1', status: 'claimed', expiryAt: new Date(Date.now() + 3600_000),
    });
    User.findById.mockReturnValue({ select: () => Promise.resolve(otherNgo) });

    const res = await request(app)
      .post('/api/listings/listing-1/release')
      .set('Authorization', `Bearer ${tokenFor(otherNgo)}`)
      .send({});

    expect(res.status).toBe(403);
    expect(FoodListing.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('cannot release a listing that has already been picked up', async () => {
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', claimedBy: 'ngo-1', status: 'picked_up', expiryAt: new Date(Date.now() + 3600_000),
    });

    const res = await request(app)
      .post('/api/listings/listing-1/release')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send({});

    expect(res.status).toBe(409);
    expect(FoodListing.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('releasing a claim past its expiry marks it expired, not posted', async () => {
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', claimedBy: 'ngo-1', status: 'claimed', expiryAt: new Date(Date.now() - 1000),
    });
    FoodListing.findOneAndUpdate.mockReturnValue(mockPopulatedUpdate({
      _id: 'listing-1', status: 'expired', foodType: 'Rice', donor: { _id: 'donor-1', orgName: 'Test Donor' },
    }));

    const res = await request(app)
      .post('/api/listings/listing-1/release')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send({});

    expect(res.status).toBe(200);
    expect(FoodListing.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'expired' }),
      expect.anything(),
    );
  });
});
