/**
 * Regression test for the double-claim race condition: claiming a listing
 * must be one atomic "only update if still posted" database operation, not a
 * separate read-then-write, so two NGOs tapping "claim" at the same moment
 * can't both succeed on the same listing.
 */
process.env.JWT_SECRET = 'test-secret';

jest.mock('../models/User');
jest.mock('../models/FoodListing');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const FoodListing = require('../models/FoodListing');
const { app } = require('../server');

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
}

const ngo = { _id: 'ngo-1', role: 'ngo', orgName: 'Test NGO', verified: true };

describe('POST /api/listings/:id/claim — atomic claim', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The `protect` auth middleware looks the user up on every request.
    User.findById.mockReturnValue({ select: () => Promise.resolve(ngo) });
  });

  test('uses one atomic update conditioned on status still being "posted"', async () => {
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', status: 'posted', expiryAt: new Date(Date.now() + 3600_000),
    });
    FoodListing.findOneAndUpdate.mockResolvedValue({
      _id: 'listing-1', status: 'claimed', donor: 'donor-1', foodType: 'Rice', claimedBy: 'ngo-1',
    });

    const res = await request(app)
      .post('/api/listings/listing-1/claim')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`);

    expect(res.status).toBe(200);
    // The critical part of the fix: the filter must require status:'posted'
    // at write time, not just at an earlier read.
    expect(FoodListing.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'listing-1', status: 'posted' }),
      expect.objectContaining({ status: 'claimed', claimedBy: 'ngo-1' }),
      expect.anything(),
    );
  });

  test('a second, near-simultaneous claim on the same listing is rejected, not silently overwritten', async () => {
    // First read still shows it as posted (this is the racy window the old
    // code was vulnerable in) — but by the time the atomic update runs,
    // another request has already claimed it, so the conditional update
    // matches nothing and returns null.
    FoodListing.findById
      .mockResolvedValueOnce({ _id: 'listing-1', status: 'posted', expiryAt: new Date(Date.now() + 3600_000) })
      .mockResolvedValueOnce({ _id: 'listing-1', status: 'claimed' });
    FoodListing.findOneAndUpdate.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/listings/listing-1/claim')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already claimed/i);
  });
});
