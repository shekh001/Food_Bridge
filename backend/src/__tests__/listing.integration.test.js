/**
 * Regression tests for the listing-detail privacy fix: phone numbers, exact
 * home-base GPS coordinates, and the internal matched-candidates ranking
 * must only be visible to the donor, the claiming NGO, or an admin — never
 * to an unrelated logged-in donor/NGO who just opens the listing page.
 */
process.env.JWT_SECRET = 'test-secret';

jest.mock('../models/User');
jest.mock('../models/FoodListing');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const FoodListing = require('../models/FoodListing');
const { app } = require('../server');

function fakeUser(overrides = {}) {
  const base = {
    _id: 'user-1',
    role: 'donor',
    orgName: 'Test Org',
    location: { lat: 28.6, lng: 77.2 },
    verified: true,
    ...overrides,
  };
  return { ...base, toObject: () => ({ ...base }) };
}

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
}

// Mimics Mongoose's chainable .populate().populate() query builder, resolving
// to a document-like object whose .toObject() returns a fresh deep copy each
// call (so mutations the controller makes on one response never leak into
// another test's assertions).
function mockListingQuery(buildDoc) {
  const query = {
    populate: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(buildDoc()).then(resolve, reject),
  };
  return query;
}

function fakeListingDoc({ donorId = 'donor-1', claimantId = 'ngo-1' } = {}) {
  return {
    _id: 'listing-1',
    donor: { _id: donorId, orgName: 'Spice Route', orgType: 'restaurant', rating: 4.8, phone: '9990001111', location: { lat: 28.63, lng: 77.21 } },
    claimedBy: { _id: claimantId, orgName: 'Umeed Shelter', orgType: 'shelter', rating: 4.9, phone: '9990002222', location: { lat: 28.64, lng: 77.22 } },
    foodType: 'Cooked meals',
    quantityKg: 10,
    status: 'claimed',
    matchedCandidates: [{ ngo: claimantId, distanceKm: 1.2, urgencyScore: 30, totalScore: 88 }],
    toObject() {
      // Deep-ish clone so the controller's `delete result.donor.phone` etc.
      // never mutates the fixture shared across tests.
      return JSON.parse(JSON.stringify(this, (k, v) => (k === 'toObject' ? undefined : v)));
    },
  };
}

beforeEach(() => {
  FoodListing.findById.mockImplementation(() => mockListingQuery(() => fakeListingDoc()));
});
afterEach(() => jest.clearAllMocks());

describe('GET /api/listings/:id — PII exposure', () => {
  test('an unrelated logged-in donor does NOT see phone, exact location, or matched candidates', async () => {
    const stranger = fakeUser({ _id: 'stranger-donor', role: 'donor' });
    User.findById.mockReturnValue({ select: () => Promise.resolve(stranger) });

    const res = await request(app)
      .get('/api/listings/listing-1')
      .set('Authorization', `Bearer ${tokenFor(stranger)}`);

    expect(res.status).toBe(200);
    expect(res.body.listing.donor.orgName).toBe('Spice Route'); // public field still present
    expect(res.body.listing.donor.phone).toBeUndefined();
    expect(res.body.listing.donor.location).toBeUndefined();
    expect(res.body.listing.claimedBy.phone).toBeUndefined();
    expect(res.body.listing.claimedBy.location).toBeUndefined();
    expect(res.body.listing.matchedCandidates).toBeUndefined();
  });

  test('the donor who owns the listing DOES see phone and location (needed to coordinate pickup)', async () => {
    const donor = fakeUser({ _id: 'donor-1', role: 'donor' });
    User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });

    const res = await request(app)
      .get('/api/listings/listing-1')
      .set('Authorization', `Bearer ${tokenFor(donor)}`);

    expect(res.status).toBe(200);
    expect(res.body.listing.claimedBy.phone).toBe('9990002222');
    expect(res.body.listing.matchedCandidates).toBeDefined();
  });

  test('the claiming NGO DOES see the donor\u2019s phone and location', async () => {
    const ngo = fakeUser({ _id: 'ngo-1', role: 'ngo' });
    User.findById.mockReturnValue({ select: () => Promise.resolve(ngo) });

    const res = await request(app)
      .get('/api/listings/listing-1')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`);

    expect(res.status).toBe(200);
    expect(res.body.listing.donor.phone).toBe('9990001111');
  });

  test('an admin sees full details on any listing', async () => {
    const admin = fakeUser({ _id: 'admin-1', role: 'admin' });
    User.findById.mockReturnValue({ select: () => Promise.resolve(admin) });

    const res = await request(app)
      .get('/api/listings/listing-1')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.listing.donor.phone).toBe('9990001111');
    expect(res.body.listing.matchedCandidates).toBeDefined();
  });
});
