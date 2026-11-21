/**
 * Integration tests for /api/billing — exercises demo mode (no Razorpay keys
 * set), which is what CI and most local dev runs against.
 */
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

jest.mock('../models/User');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { app } = require('../server');

function tokenFor(id, role) {
  return jwt.sign({ id, role }, process.env.JWT_SECRET);
}

function fakeUser(overrides = {}) {
  const base = {
    _id: '65f000000000000000000101',
    role: 'donor',
    orgName: 'Test Restaurant',
    plan: 'free',
    location: { lat: 28.6, lng: 77.2 },
    verified: true,
    ...overrides,
  };
  return { ...base, toObject: () => ({ ...base }) };
}

afterEach(() => jest.clearAllMocks());

describe('GET /api/billing/status', () => {
  test('reports demo mode when no Razorpay keys are configured', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser()) });
    const res = await request(app).get('/api/billing/status').set('Authorization', `Bearer ${tokenFor('65f000000000000000000101', 'donor')}`);
    expect(res.status).toBe(200);
    expect(res.body.liveMode).toBe(false);
    expect(res.body.plan).toBe('free');
  });
});

describe('POST /api/billing/create-order', () => {
  test('rejects non-donor roles', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser({ role: 'ngo' })) });
    const res = await request(app).post('/api/billing/create-order').set('Authorization', `Bearer ${tokenFor('65f000000000000000000101', 'ngo')}`);
    expect(res.status).toBe(403);
  });

  test('rejects if already on Pro', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser({ plan: 'pro' })) });
    const res = await request(app).post('/api/billing/create-order').set('Authorization', `Bearer ${tokenFor('65f000000000000000000101', 'donor')}`);
    expect(res.status).toBe(409);
  });

  test('returns a demo order when no live keys are set', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser()) });
    const res = await request(app).post('/api/billing/create-order').set('Authorization', `Bearer ${tokenFor('65f000000000000000000101', 'donor')}`);
    expect(res.status).toBe(200);
    expect(res.body.demoMode).toBe(true);
  });
});

describe('POST /api/billing/confirm-demo-upgrade', () => {
  test('upgrades the donor to pro in demo mode', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser()) });
    User.findByIdAndUpdate.mockReturnValue({ select: () => Promise.resolve(fakeUser({ plan: 'pro' })) });

    const res = await request(app).post('/api/billing/confirm-demo-upgrade').set('Authorization', `Bearer ${tokenFor('65f000000000000000000101', 'donor')}`);
    expect(res.status).toBe(200);
    expect(res.body.demoMode).toBe(true);
    expect(res.body.user.plan).toBe('pro');
  });

  test('rejects non-donor roles', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser({ role: 'ngo' })) });
    const res = await request(app).post('/api/billing/confirm-demo-upgrade').set('Authorization', `Bearer ${tokenFor('65f000000000000000000101', 'ngo')}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/billing/verify (demo mode)', () => {
  test('rejects — verification only works in live mode', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser()) });
    const res = await request(app).post('/api/billing/verify').set('Authorization', `Bearer ${tokenFor('65f000000000000000000101', 'donor')}`).send({});
    expect(res.status).toBe(400);
  });
});
