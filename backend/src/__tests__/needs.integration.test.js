/**
 * Tests for the NGO "Needs board" — an NGO posts what it needs, donors
 * browse open needs, and a donor's new listing can explicitly fulfil one.
 */
process.env.JWT_SECRET = 'test-secret';

jest.mock('../models/User');
jest.mock('../models/Need');
jest.mock('../models/FoodListing');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Need = require('../models/Need');
const FoodListing = require('../models/FoodListing');
const { app } = require('../server');

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
}

const ngo = { _id: 'ngo-1', role: 'ngo', orgName: 'Umeed Shelter', verified: true };
const otherNgo = { _id: 'ngo-2', role: 'ngo', orgName: 'Other NGO', verified: true };
const donor = { _id: 'donor-1', role: 'donor', orgName: 'Spice Route', verified: true, emailVerified: true };

function mockUser(u) {
  return { select: () => Promise.resolve(u) };
}

beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockImplementation((id) => mockUser(id === donor._id ? donor : ngo));
});

describe('POST /api/needs', () => {
  test('an NGO can post a need', async () => {
    User.findById.mockReturnValue(mockUser(ngo));
    let createdWith;
    Need.create.mockImplementation((data) => {
      createdWith = data;
      return Promise.resolve({ _id: 'need-1', ...data });
    });

    const res = await request(app)
      .post('/api/needs')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send({ foodType: 'Rice', quantityKg: 50, neededBy: new Date(Date.now() + 86400000).toISOString() });

    expect(res.status).toBe(201);
    expect(createdWith.ngo).toBe('ngo-1');
    expect(createdWith.foodType).toBe('Rice');
  });

  test('rejects a deadline in the past', async () => {
    User.findById.mockReturnValue(mockUser(ngo));

    const res = await request(app)
      .post('/api/needs')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send({ foodType: 'Rice', quantityKg: 50, neededBy: new Date(Date.now() - 86400000).toISOString() });

    expect(res.status).toBe(400);
    expect(Need.create).not.toHaveBeenCalled();
  });

  test('a donor cannot post a need', async () => {
    User.findById.mockReturnValue(mockUser(donor));

    const res = await request(app)
      .post('/api/needs')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({ foodType: 'Rice', quantityKg: 50, neededBy: new Date(Date.now() + 86400000).toISOString() });

    expect(res.status).toBe(403);
  });

  test('an unverified NGO cannot post to the needs board', async () => {
    User.findById.mockReturnValue(mockUser({ ...ngo, verified: false }));

    const res = await request(app)
      .post('/api/needs')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send({ foodType: 'Rice', quantityKg: 50, neededBy: new Date(Date.now() + 86400000).toISOString() });

    expect(res.status).toBe(403);
    expect(Need.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/needs', () => {
  test('a donor can browse open needs', async () => {
    User.findById.mockReturnValue(mockUser(donor));
    Need.find.mockReturnValue({
      sort: function () { return this; },
      populate: () => Promise.resolve([{ _id: 'need-1', foodType: 'Rice', status: 'open' }]),
    });

    const res = await request(app)
      .get('/api/needs')
      .set('Authorization', `Bearer ${tokenFor(donor)}`);

    expect(res.status).toBe(200);
    expect(res.body.needs).toHaveLength(1);
  });
});

describe('PATCH /api/needs/:id/cancel', () => {
  test('the owning NGO can cancel its own open need', async () => {
    User.findById.mockReturnValue(mockUser(ngo));
    const need = { _id: 'need-1', ngo: 'ngo-1', status: 'open', save: jest.fn().mockResolvedValue(true) };
    Need.findById.mockResolvedValue(need);

    const res = await request(app)
      .patch('/api/needs/need-1/cancel')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`);

    expect(res.status).toBe(200);
    expect(need.status).toBe('cancelled');
  });

  test('a different NGO cannot cancel someone else\'s need', async () => {
    User.findById.mockReturnValue(mockUser(otherNgo));
    Need.findById.mockResolvedValue({ _id: 'need-1', ngo: 'ngo-1', status: 'open' });

    const res = await request(app)
      .patch('/api/needs/need-1/cancel')
      .set('Authorization', `Bearer ${tokenFor(otherNgo)}`);

    expect(res.status).toBe(403);
  });

  test('rejects cancelling an already-fulfilled need', async () => {
    User.findById.mockReturnValue(mockUser(ngo));
    Need.findById.mockResolvedValue({ _id: 'need-1', ngo: 'ngo-1', status: 'fulfilled' });

    const res = await request(app)
      .patch('/api/needs/need-1/cancel')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`);

    expect(res.status).toBe(409);
  });
});

describe('POST /api/listings — fulfilling a need', () => {
  test('a listing created with fulfillsNeedId marks that need fulfilled and notifies the NGO', async () => {
    User.findById.mockImplementation((id) => mockUser(id === donor._id ? donor : ngo));
    User.find.mockReturnValue({ select: () => Promise.resolve([]) });
    FoodListing.create.mockImplementation((data) => Promise.resolve({
      _id: 'listing-1', ...data, matchedCandidates: [],
      save: jest.fn().mockResolvedValue(true),
      populate: jest.fn().mockResolvedValue({ _id: 'listing-1', foodType: 'Rice', quantityKg: 50, donor: { orgName: 'Spice Route' } }),
    }));

    const need = { _id: 'need-1', ngo: 'ngo-1', status: 'open', save: jest.fn().mockResolvedValue(true) };
    Need.findById.mockResolvedValue(need);

    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({
        foodType: 'Rice', quantityKg: 50,
        expiryAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        pickupLocation: { address: '12 MG Road', lat: 28.6, lng: 77.2 },
        fulfillsNeedId: 'need-1',
      });

    expect(res.status).toBe(201);
    expect(need.status).toBe('fulfilled');
    expect(need.fulfilledByListing).toBe('listing-1');
  });

  test('an invalid/stale fulfillsNeedId does not break listing creation', async () => {
    User.findById.mockImplementation((id) => mockUser(id === donor._id ? donor : ngo));
    User.find.mockReturnValue({ select: () => Promise.resolve([]) });
    FoodListing.create.mockImplementation((data) => Promise.resolve({
      _id: 'listing-2', ...data, matchedCandidates: [],
      save: jest.fn().mockResolvedValue(true),
      populate: jest.fn().mockResolvedValue({ _id: 'listing-2', foodType: 'Rice', quantityKg: 50, donor: { orgName: 'Spice Route' } }),
    }));
    Need.findById.mockResolvedValue(null); // already cancelled/expired/deleted

    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({
        foodType: 'Rice', quantityKg: 50,
        expiryAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        pickupLocation: { address: '12 MG Road', lat: 28.6, lng: 77.2 },
        fulfillsNeedId: 'stale-need-id',
      });

    expect(res.status).toBe(201);
  });
});
