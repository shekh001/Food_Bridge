/**
 * Tests for POST /api/reports — filing a complaint about the other party on
 * a specific listing (e.g. "NGO never showed up", "donor turned out fake").
 */
process.env.JWT_SECRET = 'test-secret';

jest.mock('../models/User');
jest.mock('../models/FoodListing');
jest.mock('../models/Report');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const FoodListing = require('../models/FoodListing');
const Report = require('../models/Report');
const { app } = require('../server');

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
}

const donor = { _id: 'donor-1', role: 'donor', orgName: 'Test Donor', verified: true };
const ngo = { _id: 'ngo-1', role: 'ngo', orgName: 'Test NGO', verified: true };
const otherNgo = { _id: 'ngo-2', role: 'ngo', orgName: 'Other NGO', verified: true };

describe('POST /api/reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Report.REASONS = ['no_show', 'fraud_or_fake', 'unsafe_or_bad_quality', 'unresponsive', 'other'];
  });

  test('donor can report the NGO that claimed their listing', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed',
    });
    Report.create.mockResolvedValue({ _id: 'report-1', reason: 'no_show' });

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({ listingId: 'listing-1', reason: 'no_show', description: 'Nobody came to pick it up.' });

    expect(res.status).toBe(201);
    expect(Report.create).toHaveBeenCalledWith(expect.objectContaining({
      listing: 'listing-1', reporter: 'donor-1', reportedUser: 'ngo-1', reason: 'no_show',
    }));
  });

  test('NGO can report the donor on a listing they claimed', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(ngo) });
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed',
    });
    Report.create.mockResolvedValue({ _id: 'report-1' });

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`)
      .send({ listingId: 'listing-1', reason: 'fraud_or_fake', description: 'Address did not exist.' });

    expect(res.status).toBe(201);
    expect(Report.create).toHaveBeenCalledWith(expect.objectContaining({ reportedUser: 'donor-1' }));
  });

  test('an uninvolved NGO cannot report a listing they never claimed', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(otherNgo) });
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed',
    });

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${tokenFor(otherNgo)}`)
      .send({ listingId: 'listing-1', reason: 'other', description: 'x' });

    expect(res.status).toBe(403);
    expect(Report.create).not.toHaveBeenCalled();
  });

  test('rejects an invalid reason', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed',
    });

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({ listingId: 'listing-1', reason: 'made_up_reason', description: 'x' });

    expect(res.status).toBe(400);
  });

  test('cannot report a listing that was never claimed', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', donor: 'donor-1', claimedBy: null, status: 'posted',
    });

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({ listingId: 'listing-1', reason: 'other', description: 'x' });

    expect(res.status).toBe(400);
  });

  test('filing the same report twice returns a clean conflict, not a 500', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed',
    });
    const dupErr = new Error('duplicate key');
    dupErr.code = 11000;
    Report.create.mockRejectedValue(dupErr);

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({ listingId: 'listing-1', reason: 'no_show', description: 'x' });

    expect(res.status).toBe(409);
  });

  test('a suspended user cannot even reach this endpoint', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve({ ...donor, suspended: true, suspendedReason: 'Fraud confirmed' }) });

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({ listingId: 'listing-1', reason: 'other', description: 'x' });

    expect(res.status).toBe(403);
    expect(FoodListing.findById).not.toHaveBeenCalled();
  });

  test('accepts an optional evidence photo and stores its filename on the report', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });
    FoodListing.findById.mockResolvedValue({
      _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'claimed',
    });
    Report.create.mockResolvedValue({ _id: 'report-1', reason: 'unsafe_or_bad_quality' });

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .field('listingId', 'listing-1')
      .field('reason', 'unsafe_or_bad_quality')
      .field('description', 'Food looked spoiled on arrival.')
      .attach('evidence', Buffer.from('fake-image-bytes'), { filename: 'proof.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(Report.create).toHaveBeenCalledWith(expect.objectContaining({
      evidence: expect.arrayContaining([expect.stringMatching(/\.jpg$/)]),
    }));
  });

  test('rejects a disallowed file type as evidence', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .field('listingId', 'listing-1')
      .field('reason', 'other')
      .field('description', 'x')
      .attach('evidence', Buffer.from('not-really-an-exe'), { filename: 'virus.exe', contentType: 'application/octet-stream' });

    expect(res.status).toBe(400);
    expect(Report.create).not.toHaveBeenCalled();
  });
});
