/**
 * Tests for the appeal system: a suspended user has no valid token, so
 * POST /api/appeals is intentionally public (identified by email, not JWT).
 * Covers submitting an appeal, the admin queue, and resolving one —
 * including that 'reinstated' actually lifts the suspension.
 */
process.env.JWT_SECRET = 'test-secret';

jest.mock('../models/User');
jest.mock('../models/Appeal');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Appeal = require('../models/Appeal');
const { app } = require('../server');

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
}

const admin = { _id: 'admin-1', role: 'admin', orgName: 'Ops', verified: true };

function mockFindById(user) {
  const promise = Promise.resolve(user);
  promise.select = () => Promise.resolve(user);
  return promise;
}

describe('POST /api/appeals', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a suspended user can submit an appeal with no auth token at all', async () => {
    User.findOne.mockResolvedValue({ _id: 'donor-1', email: 'donor@test.com', suspended: true });
    Appeal.create.mockResolvedValue({ _id: 'appeal-1', createdAt: new Date() });

    const res = await request(app)
      .post('/api/appeals')
      // deliberately no Authorization header — this is the whole point of the route
      .send({ email: 'donor@test.com', message: 'This was a misunderstanding, please review.' });

    expect(res.status).toBe(201);
    expect(Appeal.create).toHaveBeenCalledWith(expect.objectContaining({
      user: 'donor-1', email: 'donor@test.com', message: expect.any(String),
    }));
  });

  test('still records the appeal even if the email does not match any account (no enumeration leak)', async () => {
    User.findOne.mockResolvedValue(null);
    Appeal.create.mockResolvedValue({ _id: 'appeal-2', createdAt: new Date() });

    const res = await request(app)
      .post('/api/appeals')
      .send({ email: 'unknown@test.com', message: 'Please look into my account.' });

    expect(res.status).toBe(201);
    expect(Appeal.create).toHaveBeenCalledWith(expect.objectContaining({ user: null }));
  });

  test('rejects a missing message', async () => {
    const res = await request(app)
      .post('/api/appeals')
      .send({ email: 'donor@test.com', message: '  ' });

    expect(res.status).toBe(400);
    expect(Appeal.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/appeals', () => {
  beforeEach(() => jest.clearAllMocks());

  test('admin can list appeals, open ones first', async () => {
    User.findById.mockReturnValue(mockFindById(admin));
    Appeal.find.mockReturnValue({
      populate: function () { return this; },
      sort: () => Promise.resolve([{ _id: 'appeal-1', status: 'open' }]),
    });

    const res = await request(app)
      .get('/api/admin/appeals')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.appeals).toHaveLength(1);
  });

  test('a non-admin cannot list appeals', async () => {
    const donor = { _id: 'donor-1', role: 'donor' };
    User.findById.mockReturnValue(mockFindById(donor));

    const res = await request(app)
      .get('/api/admin/appeals')
      .set('Authorization', `Bearer ${tokenFor(donor)}`);

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/appeals/:id/resolve', () => {
  beforeEach(() => jest.clearAllMocks());

  test('outcome=reinstated marks the appeal reviewed AND lifts the suspension', async () => {
    User.findById.mockReturnValue(mockFindById(admin));
    const appeal = {
      _id: 'appeal-1', status: 'open', user: 'donor-1',
      save: jest.fn().mockResolvedValue(true),
    };
    Appeal.findById.mockResolvedValue(appeal);
    User.findByIdAndUpdate.mockResolvedValue({});

    const res = await request(app)
      .patch('/api/admin/appeals/appeal-1/resolve')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ outcome: 'reinstated' });

    expect(res.status).toBe(200);
    expect(appeal.status).toBe('reviewed');
    expect(appeal.outcome).toBe('reinstated');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('donor-1', expect.objectContaining({ suspended: false }));
  });

  test('outcome=upheld marks the appeal reviewed but does NOT touch the account', async () => {
    User.findById.mockReturnValue(mockFindById(admin));
    const appeal = {
      _id: 'appeal-1', status: 'open', user: 'donor-1',
      save: jest.fn().mockResolvedValue(true),
    };
    Appeal.findById.mockResolvedValue(appeal);

    const res = await request(app)
      .patch('/api/admin/appeals/appeal-1/resolve')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ outcome: 'upheld' });

    expect(res.status).toBe(200);
    expect(appeal.outcome).toBe('upheld');
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects an invalid outcome', async () => {
    User.findById.mockReturnValue(mockFindById(admin));

    const res = await request(app)
      .patch('/api/admin/appeals/appeal-1/resolve')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ outcome: 'maybe' });

    expect(res.status).toBe(400);
    expect(Appeal.findById).not.toHaveBeenCalled();
  });
});
