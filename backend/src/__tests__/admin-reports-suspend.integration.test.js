/**
 * Tests for the admin side of the dispute system: listing reports,
 * resolving them (optionally suspending the reported account), and
 * suspension actually locking the account out.
 */
process.env.JWT_SECRET = 'test-secret';

jest.mock('../models/User');
jest.mock('../models/Report');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Report = require('../models/Report');
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

describe('GET /api/admin/reports', () => {
  beforeEach(() => jest.clearAllMocks());

  test('admin can list reports, open ones first', async () => {
    User.findById.mockReturnValue(mockFindById(admin));
    const reportDoc = {
      _id: 'report-1', status: 'open', reportedUser: { _id: 'donor-1' },
      toObject: function () { return { ...this }; },
    };
    Report.find.mockReturnValue({
      populate: function () { return this; },
      sort: () => Promise.resolve([reportDoc]),
    });
    // The admin list also aggregates a per-reportedUser report count (for the
    // "reported N times before" flag) — needs its own mock, separate from find().
    Report.aggregate.mockResolvedValue([{ _id: 'donor-1', count: 3 }]);

    const res = await request(app)
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(1);
    expect(res.body.reports[0].reportedUserTotalReports).toBe(3);
  });
});

describe('PATCH /api/admin/reports/:id/resolve', () => {
  beforeEach(() => jest.clearAllMocks());

  test('resolving with action=suspended marks the report resolved AND suspends the reported user', async () => {
    User.findById.mockReturnValue(mockFindById(admin));
    const report = {
      _id: 'report-1', status: 'open', reportedUser: 'donor-1',
      save: jest.fn().mockResolvedValue(true),
    };
    Report.findById.mockResolvedValue(report);
    User.findByIdAndUpdate.mockResolvedValue({});

    const res = await request(app)
      .patch('/api/admin/reports/report-1/resolve')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ action: 'suspended', notes: 'Confirmed fake business after review.' });

    expect(res.status).toBe(200);
    expect(report.status).toBe('resolved');
    expect(report.actionTaken).toBe('suspended');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('donor-1', expect.objectContaining({ suspended: true }));
  });

  test('resolving with action=none just closes the report, no suspension', async () => {
    User.findById.mockReturnValue(mockFindById(admin));
    const report = {
      _id: 'report-1', status: 'open', reportedUser: 'donor-1',
      save: jest.fn().mockResolvedValue(true),
    };
    Report.findById.mockResolvedValue(report);

    const res = await request(app)
      .patch('/api/admin/reports/report-1/resolve')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ action: 'none', notes: 'Looked into it — logistics issue, not fraud.' });

    expect(res.status).toBe(200);
    expect(report.actionTaken).toBe('none');
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/users/:id/suspend', () => {
  beforeEach(() => jest.clearAllMocks());

  test('admin can suspend a user directly', async () => {
    User.findById.mockReturnValueOnce(mockFindById(admin));
    const target = { _id: 'donor-1', role: 'donor', suspended: false, save: jest.fn().mockResolvedValue(true) };
    User.findById.mockReturnValueOnce(target);

    const res = await request(app)
      .patch('/api/admin/users/donor-1/suspend')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ suspended: true, reason: 'Multiple no-show reports' });

    expect(res.status).toBe(200);
    expect(target.suspended).toBe(true);
    expect(target.save).toHaveBeenCalled();
  });

  test('cannot suspend an admin account', async () => {
    User.findById.mockReturnValueOnce(mockFindById(admin));
    const targetAdmin = { _id: 'admin-2', role: 'admin', suspended: false, save: jest.fn() };
    User.findById.mockReturnValueOnce(targetAdmin);

    const res = await request(app)
      .patch('/api/admin/users/admin-2/suspend')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ suspended: true });

    expect(res.status).toBe(400);
    expect(targetAdmin.save).not.toHaveBeenCalled();
  });
});

describe('Suspended accounts are locked out', () => {
  beforeEach(() => jest.clearAllMocks());

  test('login rejects a suspended account even with the correct password', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('password123', 4);
    User.findOne.mockResolvedValue({
      _id: 'donor-1', role: 'donor', email: 'donor@test.com', passwordHash: hash,
      suspended: true, suspendedReason: 'Fraud confirmed',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'donor@test.com', password: 'password123' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/suspended/i);
  });

  test('an already-issued token stops working the moment the account is suspended', async () => {
    const suspendedUser = { _id: 'donor-1', role: 'donor', suspended: true, suspendedReason: 'x' };
    User.findById.mockReturnValue({ select: () => Promise.resolve(suspendedUser) });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenFor(suspendedUser)}`);

    expect(res.status).toBe(403);
  });
});
