/**
 * Integration tests for /api/admin — role gating and the promote-to-admin
 * action specifically (see authController's register test for the matching
 * "public registration can never create an admin" regression test).
 */
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';

jest.mock('../models/User');
jest.mock('../models/FoodListing');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const FoodListing = require('../models/FoodListing');
const { app } = require('../server');

function tokenFor(id, role) {
  return jwt.sign({ id, role }, process.env.JWT_SECRET);
}

function fakeUser(overrides = {}) {
  const obj = {
    _id: '65f000000000000000000201',
    role: 'donor',
    orgName: 'Test Restaurant',
    location: { lat: 28.6, lng: 77.2 },
    verified: true,
    ...overrides,
  };
  // toObject reads the object's *current* properties at call time, so later
  // mutations (e.g. the controller doing `target.role = 'admin'` before
  // calling toObject()) are reflected — matching how a real Mongoose
  // document's toObject() behaves.
  obj.toObject = () => ({ ...obj });
  return obj;
}

afterEach(() => jest.clearAllMocks());

describe('admin route gating', () => {
  test('non-admin roles are rejected with 403', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser({ role: 'donor' })) });
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('65f000000000000000000201', 'donor')}`);
    expect(res.status).toBe(403);
  });

  test('requests with no token are rejected with 401', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/admin/users/:id/promote', () => {
  const adminToken = tokenFor('65f000000000000000000201', 'admin');

  test('an authenticated admin can promote another user', async () => {
    User.findById.mockImplementation((id) => {
      // First call (auth middleware, chained .select) resolves the caller.
      // Second call (controller, awaited directly) resolves the target user.
      if (id === '65f000000000000000000201') {
        return { select: () => Promise.resolve(fakeUser({ role: 'admin' })) };
      }
      const target = fakeUser({ _id: '65f000000000000000000202', role: 'ngo', orgName: 'Some NGO', save: jest.fn() });
      target.save = jest.fn().mockResolvedValue(target);
      return Promise.resolve(target);
    });

    const res = await request(app)
      .patch('/api/admin/users/65f000000000000000000202/promote')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  test('a non-admin cannot reach the promote endpoint at all', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve(fakeUser({ role: 'ngo' })) });
    const res = await request(app)
      .patch('/api/admin/users/65f000000000000000000202/promote')
      .set('Authorization', `Bearer ${tokenFor('65f000000000000000000201', 'ngo')}`);
    expect(res.status).toBe(403);
  });
});
