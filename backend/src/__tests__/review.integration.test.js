/**
 * Integration tests for POST /api/reviews — mocks Mongoose models so the
 * suite runs without a live MongoDB instance, same pattern as auth tests.
 */
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';

jest.mock('../models/User');
jest.mock('../models/FoodListing');
jest.mock('../models/Review');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const FoodListing = require('../models/FoodListing');
const Review = require('../models/Review');
const { app } = require('../server');

function tokenFor(id, role) {
  return jwt.sign({ id, role }, process.env.JWT_SECRET);
}

function fakeUser(overrides = {}) {
  const base = {
    _id: '65f000000000000000000101',
    role: 'donor',
    orgName: 'Test Restaurant',
    location: { lat: 28.6, lng: 77.2 },
    verified: true,
    ...overrides,
  };
  return { ...base, toObject: () => ({ ...base }) };
}

afterEach(() => jest.clearAllMocks());

describe('POST /api/reviews', () => {
  test('rejects a review before the listing is delivered', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser()) });
    FoodListing.findById.mockResolvedValue({ _id: '65f000000000000000000201', status: 'claimed', donor: '65f000000000000000000101', claimedBy: '65f000000000000000000102' });

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${tokenFor('65f000000000000000000101', 'donor')}`)
      .send({ listingId: '65f000000000000000000201', rating: 5 });

    expect(res.status).toBe(409);
  });

  test('rejects a review from someone not party to the listing', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser({ _id: '65f000000000000000000103' })) });
    FoodListing.findById.mockResolvedValue({ _id: '65f000000000000000000201', status: 'delivered', donor: '65f000000000000000000101', claimedBy: '65f000000000000000000102' });

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${tokenFor('65f000000000000000000103', 'donor')}`)
      .send({ listingId: '65f000000000000000000201', rating: 5 });

    expect(res.status).toBe(403);
  });

  test('rejects an out-of-range rating', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser()) });

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${tokenFor('65f000000000000000000101', 'donor')}`)
      .send({ listingId: '65f000000000000000000201', rating: 9 });

    expect(res.status).toBe(400);
  });

  test('lets the donor review the claiming NGO after delivery', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser()) });
    FoodListing.findById.mockResolvedValue({ _id: '65f000000000000000000201', status: 'delivered', donor: '65f000000000000000000101', claimedBy: '65f000000000000000000102' });
    Review.create.mockResolvedValue({ _id: '65f000000000000000000301', listing: '65f000000000000000000201', from: '65f000000000000000000101', to: '65f000000000000000000102', rating: 5 });
    Review.aggregate.mockResolvedValue([{ _id: '65f000000000000000000102', avg: 5, count: 1 }]);
    User.findByIdAndUpdate.mockResolvedValue({});

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${tokenFor('65f000000000000000000101', 'donor')}`)
      .send({ listingId: '65f000000000000000000201', rating: 5, comment: 'Great coordination!' });

    expect(res.status).toBe(201);
    expect(Review.create).toHaveBeenCalledWith(
      expect.objectContaining({ listing: '65f000000000000000000201', from: '65f000000000000000000101', to: '65f000000000000000000102', rating: 5 })
    );
  });

  test('rejects a duplicate review with a friendly message', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser()) });
    FoodListing.findById.mockResolvedValue({ _id: '65f000000000000000000201', status: 'delivered', donor: '65f000000000000000000101', claimedBy: '65f000000000000000000102' });
    const dupError = new Error('duplicate key');
    dupError.code = 11000;
    Review.create.mockRejectedValue(dupError);

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${tokenFor('65f000000000000000000101', 'donor')}`)
      .send({ listingId: '65f000000000000000000201', rating: 4 });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already reviewed/i);
  });
});
