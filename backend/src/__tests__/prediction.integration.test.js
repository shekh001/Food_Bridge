/**
 * Integration test for GET /api/predictions/hotspots — mocks FoodListing so
 * the suite runs without a live MongoDB instance.
 */
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';

jest.mock('../models/User');
jest.mock('../models/FoodListing');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const FoodListing = require('../models/FoodListing');
const { app } = require('../server');

function tokenFor(id, role) {
  return jwt.sign({ id, role }, process.env.JWT_SECRET);
}

function fakeUser(overrides = {}) {
  const base = {
    _id: '65f000000000000000000101',
    role: 'ngo',
    orgName: 'Test NGO',
    location: { lat: 28.64, lng: 77.21 },
    verified: true,
    ...overrides,
  };
  return { ...base, toObject: () => ({ ...base }) };
}

function mockLean(data) {
  return { populate: () => ({ lean: () => Promise.resolve(data) }) };
}

afterEach(() => jest.clearAllMocks());

describe('GET /api/predictions/hotspots', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/api/predictions/hotspots');
    expect(res.status).toBe(401);
  });

  test('reports insufficient data below the sample-size floor', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser()) });
    FoodListing.find.mockReturnValue({ select: () => mockLean([{ pickupLocation: { lat: 28.63, lng: 77.21 }, quantityKg: 5, createdAt: new Date() }]) });

    const res = await request(app).get('/api/predictions/hotspots').set('Authorization', `Bearer ${tokenFor('65f000000000000000000101', 'ngo')}`);

    expect(res.status).toBe(200);
    expect(res.body.hotspots).toEqual([]);
    expect(res.body.message).toMatch(/not enough/i);
  });

  test('ranks the busiest location+time bucket first', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser()) });

    // Three listings at the same grid cell + same day/hour bucket (the "hot" cell),
    // plus one lone listing elsewhere — the hot cell should rank #1.
    const hotDay = new Date('2026-06-01T12:00:00Z'); // fixed Monday lunch slot
    const listings = [
      { pickupLocation: { lat: 28.6315, lng: 77.2167, address: 'CP' }, quantityKg: 10, createdAt: hotDay, donor: { orgType: 'restaurant' } },
      { pickupLocation: { lat: 28.6316, lng: 77.2168, address: 'CP' }, quantityKg: 12, createdAt: hotDay, donor: { orgType: 'restaurant' } },
      { pickupLocation: { lat: 28.6317, lng: 77.2169, address: 'CP' }, quantityKg: 8, createdAt: hotDay, donor: { orgType: 'hotel' } },
      { pickupLocation: { lat: 28.71, lng: 77.19, address: 'Model Town' }, quantityKg: 5, createdAt: new Date('2026-06-02T20:00:00Z'), donor: { orgType: 'caterer' } },
    ];
    FoodListing.find.mockReturnValue({ select: () => mockLean(listings) });

    const res = await request(app).get('/api/predictions/hotspots').set('Authorization', `Bearer ${tokenFor('65f000000000000000000101', 'ngo')}`);

    expect(res.status).toBe(200);
    expect(res.body.sampleSize).toBe(4);
    expect(res.body.hotspots[0].historicalListings).toBe(3);
    expect(res.body.hotspots[0].avgQuantityKg).toBeCloseTo(10, 0);
  });
});
