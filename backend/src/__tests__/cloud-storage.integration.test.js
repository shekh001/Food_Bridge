/**
 * These tests run with CLOUDINARY_* env vars SET, which flips
 * middleware/upload.js from local-disk storage to Cloudinary storage for
 * this file only (Jest gives each test file its own fresh module registry,
 * so this doesn't affect any other test file's local-disk behavior).
 *
 * The `cloudinary` SDK is mocked — this isn't testing Cloudinary's actual
 * API, just that FoodBridge (a) stores the right self-describing reference
 * after an upload, and (b) serves it back as a redirect to the right kind
 * of delivery URL (public for listing photos, signed/authenticated for
 * verification docs and report evidence).
 */
process.env.JWT_SECRET = 'test-secret';
process.env.CLOUDINARY_CLOUD_NAME = 'demo';
process.env.CLOUDINARY_API_KEY = 'key123';
process.env.CLOUDINARY_API_SECRET = 'secret123';

jest.mock('cloudinary', () => {
  // eslint-disable-next-line global-require
  const { Writable: WritableStream } = require('stream');
  return {
    v2: {
      config: jest.fn(),
      uploader: {
        destroy: jest.fn().mockResolvedValue({}),
        // Mirrors the real upload_stream signature: returns a writable the
        // caller pipes the incoming file into, and invokes the callback once
        // that writable finishes — same as a real (fake, here) upload
        // completing and Cloudinary responding.
        upload_stream: jest.fn((options, callback) => {
          const w = new WritableStream({ write(chunk, enc, cb) { cb(); } });
          w.on('finish', () => {
            callback(null, {
              public_id: options.public_id,
              secure_url: `https://res.cloudinary.com/demo/${options.resource_type}/upload/${options.public_id}`,
              resource_type: options.resource_type,
              bytes: 999,
            });
          });
          return w;
        }),
      },
      url: jest.fn((publicId, opts) =>
        `https://res.cloudinary.com/demo/${opts.resource_type}/${opts.type}/${opts.sign_url ? 's--signed--/' : ''}${publicId}`),
    },
  };
});

jest.mock('../models/User');
jest.mock('../models/FoodListing');
jest.mock('../models/Report');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const FoodListing = require('../models/FoodListing');
const Report = require('../models/Report');
const { app } = require('../server');

// Automock replaces Report's real static REASONS array with an empty one —
// restore it so the controller's `Report.REASONS.includes(reason)` check
// behaves like it does against the real model.
Report.REASONS = ['no_show', 'fraud_or_fake', 'unsafe_or_bad_quality', 'unresponsive', 'other'];

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
}

const donor = { _id: 'donor-1', role: 'donor', orgName: 'Spice Route', verified: true, emailVerified: true };
const ngo = { _id: 'ngo-1', role: 'ngo', orgName: 'Umeed Shelter', verified: true };
const admin = { _id: 'admin-1', role: 'admin', orgName: 'Ops', verified: true };

afterAll(() => {
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
});

describe('Listing photos on Cloudinary (public delivery)', () => {
  test('upload stores a self-describing cloudinary: reference, not a local filename', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });
    User.find.mockReturnValue({ select: () => Promise.resolve([]) }); // matching engine's candidate lookup
    let createdWith;
    FoodListing.create.mockImplementation((data) => {
      createdWith = data;
      return Promise.resolve({
        _id: 'listing-1', ...data, matchedCandidates: [],
        save: jest.fn().mockResolvedValue(true),
        populate: jest.fn().mockResolvedValue({ _id: 'listing-1' }),
      });
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
    expect(createdWith.photo).toMatch(/^cloudinary:image:foodbridge\/listing-photos\//);
  });

  test('serving redirects to a PUBLIC (unsigned) delivery URL', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });
    const photoRef = 'cloudinary:image:foodbridge/listing-photos/donor-1-abc123';
    FoodListing.findById.mockReturnValue({ select: () => Promise.resolve({ photo: photoRef }) });

    const res = await request(app)
      .get(`/api/listings/listing-1/photo/${encodeURIComponent(photoRef)}`)
      .set('Authorization', `Bearer ${tokenFor(donor)}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/image/upload/'); // 'upload' = public, not 'authenticated'
    expect(res.headers.location).not.toContain('s--signed--');
  });
});

describe('Report evidence on Cloudinary (private/signed delivery)', () => {
  test('upload stores a self-describing reference and serving redirects to a SIGNED delivery URL', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(donor) });
    FoodListing.findById.mockResolvedValue({ _id: 'listing-1', donor: 'donor-1', claimedBy: 'ngo-1', status: 'delivered' });
    let createdWith;
    Report.create.mockImplementation((data) => { createdWith = data; return Promise.resolve({ _id: 'report-1', ...data }); });

    const createRes = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .field('listingId', 'listing-1')
      .field('reason', 'unsafe_or_bad_quality')
      .field('description', 'Food looked spoiled on arrival.')
      .attach('evidence', Buffer.from('fake-image-bytes'), { filename: 'proof.jpg', contentType: 'image/jpeg' });

    expect(createRes.status).toBe(201);
    const evidenceRef = createdWith.evidence[0];
    expect(evidenceRef).toMatch(/^cloudinary:image:foodbridge\/report-evidence\//);

    Report.findById.mockResolvedValue({ _id: 'report-1', reporter: 'donor-1', reportedUser: 'ngo-1', evidence: [evidenceRef] });

    const serveRes = await request(app)
      .get(`/api/reports/report-1/evidence/${encodeURIComponent(evidenceRef)}`)
      .set('Authorization', `Bearer ${tokenFor(donor)}`);

    expect(serveRes.status).toBe(302);
    expect(serveRes.headers.location).toContain('/authenticated/');
    expect(serveRes.headers.location).toContain('s--signed--');
  });
});

describe('Verification docs on Cloudinary (private/signed delivery)', () => {
  test('admin download redirects to a SIGNED delivery URL', async () => {
    User.findById.mockImplementation((id) => ({
      select: () => Promise.resolve(id === admin._id ? admin : ngo),
    }));
    User.findOne.mockResolvedValue({
      _id: 'ngo-1', role: 'ngo',
      verificationDoc: 'cloudinary:raw:foodbridge/verification-docs/ngo-1-xyz789',
    });

    const res = await request(app)
      .get('/api/admin/verifications/ngo-1/document')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/raw/authenticated/');
    expect(res.headers.location).toContain('s--signed--');
  });
});
