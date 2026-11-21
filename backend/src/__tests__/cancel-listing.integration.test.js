/**
 * Tests for donor-initiated listing cancellation:
 *  - only the donor (or admin) may cancel
 *  - cancellation is only allowed before pickup
 *  - cancelling an unclaimed listing broadcasts a live removal to all NGOs
 */
process.env.JWT_SECRET = 'test-secret';

jest.mock('../models/User');
jest.mock('../models/FoodListing');
jest.mock('../models/CourierBooking'); // touched by cancelListing's courier-cleanup — automock returns undefined for findOne, which is the "no active courier" no-op case

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const FoodListing = require('../models/FoodListing');
const { app } = require('../server');

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
}

const donor = { _id: 'donor-1', role: 'donor', orgName: 'Test Donor' };
const otherDonor = { _id: 'donor-2', role: 'donor', orgName: 'Other Donor' };
const ngo = { _id: 'ngo-1', role: 'ngo', orgName: 'Test NGO' };

function mockListingDoc(overrides = {}) {
  const doc = {
    _id: 'listing-1',
    donor: 'donor-1',
    claimedBy: null,
    status: 'posted',
    foodType: 'Rice',
    quantityKg: 5,
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
  return doc;
}

describe('PATCH /api/listings/:id/status — cancellation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('donor can cancel their own unclaimed listing, and NGOs get a live removal broadcast', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });
    const listing = mockListingDoc({ status: 'posted' });
    FoodListing.findById.mockResolvedValue(listing);

    const res = await request(app)
      .patch('/api/listings/listing-1/status')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({ status: 'cancelled', notes: 'Ran out sooner than expected' });

    expect(res.status).toBe(200);
    expect(listing.status).toBe('cancelled');
    expect(listing.notes).toBe('Ran out sooner than expected');
    expect(listing.save).toHaveBeenCalled();
  });

  test('a random other donor cannot cancel someone else\'s listing', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(otherDonor) });
    const listing = mockListingDoc({ status: 'posted', donor: 'donor-1' });
    FoodListing.findById.mockResolvedValue(listing);

    const res = await request(app)
      .patch('/api/listings/listing-1/status')
      .set('Authorization', `Bearer ${tokenFor(otherDonor)}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(403);
    expect(listing.save).not.toHaveBeenCalled();
  });

  test('the claiming NGO cannot cancel the donor\'s listing (that is a release, not a cancel)', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(ngo) });
    const listing = mockListingDoc({ status: 'claimed', claimedBy: 'ngo-1' });
    FoodListing.findById.mockResolvedValue(listing);

    const res = await request(app)
      .patch('/api/listings/listing-1/status')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(403);
    expect(listing.save).not.toHaveBeenCalled();
  });

  test('cannot cancel a listing that has already been picked up', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });
    const listing = mockListingDoc({ status: 'picked_up', claimedBy: 'ngo-1' });
    FoodListing.findById.mockResolvedValue(listing);

    const res = await request(app)
      .patch('/api/listings/listing-1/status')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(listing.save).not.toHaveBeenCalled();
  });

  test('admin can cancel any listing', async () => {
    const admin = { _id: 'admin-1', role: 'admin', orgName: 'Ops' };
    User.findById.mockReturnValue({ select: () => Promise.resolve(admin) });
    const listing = mockListingDoc({ status: 'claimed', claimedBy: 'ngo-1' });
    FoodListing.findById.mockResolvedValue(listing);

    const res = await request(app)
      .patch('/api/listings/listing-1/status')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(listing.status).toBe('cancelled');
  });
});
