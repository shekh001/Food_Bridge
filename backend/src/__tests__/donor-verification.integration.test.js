/**
 * Tests for:
 *  - Donors starting out unverified and needing to click an emailed link
 *    (POST /api/auth/verify-email/:token, POST /api/auth/resend-verification)
 *  - Admin's pending-verifications list/verify/document endpoints now
 *    covering donor accounts too, not just NGOs
 */
process.env.JWT_SECRET = 'test-secret';

jest.mock('../models/User');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { app } = require('../server');

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
}

function fakeUser(overrides = {}) {
  const base = {
    _id: 'donor-1', role: 'donor', orgName: 'Test Restaurant', email: 'donor@test.com',
    verified: false, emailVerified: false,
    ...overrides,
  };
  return { ...base, save: jest.fn().mockResolvedValue(true), toObject: () => ({ ...base }) };
}

describe('POST /api/auth/verify-email/:token', () => {
  beforeEach(() => jest.clearAllMocks());

  test('confirms the email (but does NOT by itself grant posting access)', async () => {
    const user = fakeUser();
    User.findOne.mockReturnValue({ select: () => Promise.resolve(user) });

    const res = await request(app).post('/api/auth/verify-email/good-token');

    expect(res.status).toBe(200);
    expect(user.emailVerified).toBe(true);
    // `verified` (posting access) is a SEPARATE, admin-controlled flag —
    // clicking the email link must never flip it.
    expect(user.verified).toBe(false);
    expect(user.save).toHaveBeenCalled();
  });

  test('rejects an invalid or expired token', async () => {
    User.findOne.mockReturnValue({ select: () => Promise.resolve(null) });

    const res = await request(app).post('/api/auth/verify-email/bad-token');

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/resend-verification', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a donor can request a new verification email', async () => {
    const user = fakeUser();
    User.findById.mockReturnValue({ select: () => Promise.resolve(user) });
    // resendVerification's internal issueVerificationEmail() re-fetches the
    // user with a plain (non-chained) findById to mutate + save it.
    User.findById.mockReturnValueOnce({ select: () => Promise.resolve(user) }).mockReturnValueOnce(user);

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
  });

  test('an NGO cannot use the donor email-verification resend endpoint', async () => {
    const ngo = fakeUser({ _id: 'ngo-1', role: 'ngo' });
    User.findById.mockReturnValue({ select: () => Promise.resolve(ngo) });

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', `Bearer ${tokenFor(ngo)}`);

    expect(res.status).toBe(400);
  });

  test('a donor who already confirmed their email gets a clear message instead of a new one', async () => {
    const user = fakeUser({ emailVerified: true });
    User.findById.mockReturnValue({ select: () => Promise.resolve(user) });

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/verifications/pending — includes donors, not just NGOs', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns both unverified donors and unverified NGOs', async () => {
    const admin = fakeUser({ _id: 'admin-1', role: 'admin', verified: true });
    User.findById.mockReturnValue({ select: () => Promise.resolve(admin) });
    User.find.mockReturnValue({
      select: () => Promise.resolve([
        fakeUser({ _id: 'donor-2', role: 'donor' }),
        fakeUser({ _id: 'ngo-2', role: 'ngo', darpanId: 'DL/123' }),
      ]),
    });

    const res = await request(app)
      .get('/api/admin/verifications/pending')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.pending).toHaveLength(2);
    expect(User.find).toHaveBeenCalledWith({ role: { $in: ['ngo', 'donor'] }, verified: false });
  });
});
