/**
 * GET /api/listings/my-claims — an NGO's own claimed listings (active
 * pickups + recent history). Before this endpoint existed, an NGO had no
 * way to come back to something they'd claimed except by keeping the
 * original browser tab open.
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

const ngo = { _id: 'ngo-1', role: 'ngo', orgName: 'Test NGO' };
const donor = { _id: 'donor-1', role: 'donor', orgName: 'Test Donor' };

function mockQuery(result) {
  const query = {
    populate: jest.fn(() => query),
    sort: jest.fn(() => query),
    limit: jest.fn(() => Promise.resolve(result)),
  };
  return query;
}

describe('GET /api/listings/my-claims', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns listings claimed by the logged-in NGO', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(ngo) });
    FoodListing.find.mockReturnValue(mockQuery([
      { _id: 'listing-1', foodType: 'Rice', status: 'claimed', claimedBy: 'ngo-1' },
    ]));

    const res = await request(app)
      .get('/api/listings/my-claims')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`);

    expect(res.status).toBe(200);
    expect(res.body.listings).toHaveLength(1);
    expect(FoodListing.find).toHaveBeenCalledWith({ claimedBy: 'ngo-1' });
  });

  test('donors cannot access another role\'s claim history', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });

    const res = await request(app)
      .get('/api/listings/my-claims')
      .set('Authorization', `Bearer ${tokenFor(donor)}`);

    expect(res.status).toBe(403);
  });
});
