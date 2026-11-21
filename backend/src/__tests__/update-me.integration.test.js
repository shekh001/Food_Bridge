/**
 * PATCH /api/auth/me — lets an NGO set/update its daily capacity (kg), which
 * the matching engine uses for quantity-fit scoring. Without any way to set
 * this, that part of "smart matching" silently always used a neutral
 * default and never reflected a real NGO's actual capacity.
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
  const base = { _id: 'ngo-1', role: 'ngo', orgName: 'Test NGO', dailyCapacityKg: null, ...overrides };
  return { ...base, save: jest.fn().mockResolvedValue(true), toObject: () => ({ ...base }) };
}

// The `protect` middleware does `User.findById(id).select(...)`, while the
// controller itself does a plain `await User.findById(id)`. Both go through
// the same mocked `findById`, so the mock return value needs to work both
// as a directly-awaitable promise AND expose a chainable `.select()`.
function mockFindById(user) {
  const promise = Promise.resolve(user);
  promise.select = () => Promise.resolve(user);
  return promise;
}

describe('PATCH /api/auth/me', () => {
  beforeEach(() => jest.clearAllMocks());

  test('an NGO can set its daily capacity', async () => {
    const user = fakeUser();
    User.findById.mockReturnValue(mockFindById(user));

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ dailyCapacityKg: 40 });

    expect(res.status).toBe(200);
    expect(user.dailyCapacityKg).toBe(40);
    expect(user.save).toHaveBeenCalled();
  });

  test('rejects a non-positive capacity value', async () => {
    const user = fakeUser();
    User.findById.mockReturnValue(mockFindById(user));

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ dailyCapacityKg: -5 });

    expect(res.status).toBe(400);
    expect(user.save).not.toHaveBeenCalled();
  });

  test('a donor cannot set a daily capacity (NGO-only field)', async () => {
    const donor = fakeUser({ _id: 'donor-1', role: 'donor', dailyCapacityKg: undefined });
    User.findById.mockReturnValue(mockFindById(donor));

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${tokenFor(donor)}`)
      .send({ dailyCapacityKg: 40 });

    expect(res.status).toBe(400);
    expect(donor.save).not.toHaveBeenCalled();
  });

  test('can update phone/address without touching capacity', async () => {
    const user = fakeUser({ dailyCapacityKg: 25 });
    User.findById.mockReturnValue(mockFindById(user));

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ phone: '9999999999' });

    expect(res.status).toBe(200);
    expect(user.phone).toBe('9999999999');
    expect(user.dailyCapacityKg).toBe(25); // untouched
  });
});
