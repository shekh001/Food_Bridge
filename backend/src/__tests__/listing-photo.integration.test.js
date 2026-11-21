/**
 * Tests for the optional listing-photo feature: a donor can attach one
 * photo when posting surplus food, and it's retrievable afterward through
 * the protected /photo/:filename route.
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

const donor = { _id: 'donor-1', role: 'donor', orgName: 'Spice Route', verified: true, emailVerified: true };

function fakeCreatedListing(overrides = {}) {
  const doc = {
    _id: 'listing-1',
    donor: 'donor-1',
    foodType: 'Cooked meals',
    quantityKg: 10,
    matchedCandidates: [],
    save: jest.fn().mockResolvedValue(true),
    populate: jest.fn().mockResolvedValue({
      _id: 'listing-1', donor: { orgName: 'Spice Route' }, foodType: 'Cooked meals',
    }),
    ...overrides,
  };
  return doc;
}

beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });
  User.find.mockReturnValue({ select: () => Promise.resolve([]) });
});

describe('POST /api/listings — with a photo', () => {
  test('a donor can attach a photo when posting a listing, and it is stored on the record', async () => {
    let createdWith;
    FoodListing.create.mockImplementation((data) => {
      createdWith = data;
      return Promise.resolve(fakeCreatedListing());
    });

    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .field('foodType', 'Cooked meals')
      .field('quantityKg', '10')
      .field('expiryAt', new Date(Date.now() + 3600 * 1000).toISOString())
      .field('pickupLocation', JSON.stringify({ address: '12 MG Road', lat: 28.6, lng: 77.2 }))
      .attach('photo', Buffer.from('fake-image-bytes'), { filename: 'meal.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(createdWith.photo).toMatch(/\.jpg$/);
  });

  test('posting without a photo still works exactly as before (photo stays null)', async () => {
    let createdWith;
    FoodListing.create.mockImplementation((data) => {
      createdWith = data;
      return Promise.resolve(fakeCreatedListing());
    });

    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({
        foodType: 'Cooked meals',
        quantityKg: 10,
        expiryAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        pickupLocation: { address: '12 MG Road', lat: 28.6, lng: 77.2 },
      });

    expect(res.status).toBe(201);
    expect(createdWith.photo).toBeNull();
  });

  test('rejects a non-image file as a listing photo', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .field('foodType', 'Cooked meals')
      .field('quantityKg', '10')
      .field('expiryAt', new Date(Date.now() + 3600 * 1000).toISOString())
      .field('pickupLocation', JSON.stringify({ address: '12 MG Road', lat: 28.6, lng: 77.2 }))
      .attach('photo', Buffer.from('not-an-image'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(FoodListing.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/listings/:id/photo/:filename', () => {
  test('404s cleanly when the listing has no photo', async () => {
    FoodListing.findById.mockReturnValue({ select: () => Promise.resolve({ photo: null }) });

    const res = await request(app)
      .get('/api/listings/listing-1/photo/whatever.jpg')
      .set('Authorization', `Bearer ${tokenFor(donor)}`);

    expect(res.status).toBe(404);
  });

  test('404s when the requested filename does not match the one on record (no path-traversal / guessing)', async () => {
    FoodListing.findById.mockReturnValue({ select: () => Promise.resolve({ photo: 'real-photo.jpg' }) });

    const res = await request(app)
      .get('/api/listings/listing-1/photo/not-the-real-one.jpg')
      .set('Authorization', `Bearer ${tokenFor(donor)}`);

    expect(res.status).toBe(404);
  });
});
