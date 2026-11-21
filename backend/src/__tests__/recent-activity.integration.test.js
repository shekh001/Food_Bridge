/**
 * GET /api/impact/recent-activity — public endpoint powering the landing
 * page's live-activity marquee. Only recent deliveries, only safe fields
 * (no phone numbers, no coordinates).
 */
jest.mock('../models/FoodListing');
jest.mock('../models/User');

const request = require('supertest');
const FoodListing = require('../models/FoodListing');
const { app } = require('../server');

function mockDeliveryQuery(docs) {
  const query = {
    sort: jest.fn(() => query),
    limit: jest.fn(() => query),
    populate: jest.fn(() => query),
    select: jest.fn(() => Promise.resolve(docs)),
  };
  return query;
}

afterEach(() => jest.clearAllMocks());

describe('GET /api/impact/recent-activity', () => {
  test('is reachable with no auth token at all (public landing-page data)', async () => {
    FoodListing.find.mockReturnValue(mockDeliveryQuery([]));

    const res = await request(app).get('/api/impact/recent-activity');

    expect(res.status).toBe(200);
    expect(res.body.activity).toEqual([]);
  });

  test('maps deliveries to only the safe, public-facing fields', async () => {
    FoodListing.find.mockReturnValue(mockDeliveryQuery([
      {
        foodType: 'Cooked meals',
        quantityKg: 8,
        deliveredAt: new Date('2026-08-20T10:00:00Z'),
        donor: { orgName: 'Spice Route' },
        claimedBy: { orgName: 'Umeed Shelter' },
      },
    ]));

    const res = await request(app).get('/api/impact/recent-activity');

    expect(res.status).toBe(200);
    expect(res.body.activity).toHaveLength(1);
    expect(res.body.activity[0]).toEqual({
      foodType: 'Cooked meals',
      quantityKg: 8,
      deliveredAt: '2026-08-20T10:00:00.000Z',
      donorOrgName: 'Spice Route',
      ngoOrgName: 'Umeed Shelter',
    });
    // No phone, no location, no user ids leaked into the public payload.
    expect(res.body.activity[0].phone).toBeUndefined();
    expect(res.body.activity[0].donor).toBeUndefined();
  });

  test('falls back to generic labels if org data is somehow missing', async () => {
    FoodListing.find.mockReturnValue(mockDeliveryQuery([
      { foodType: 'Bakery items', quantityKg: 3, deliveredAt: new Date(), donor: null, claimedBy: null },
    ]));

    const res = await request(app).get('/api/impact/recent-activity');

    expect(res.status).toBe(200);
    expect(res.body.activity[0].donorOrgName).toBe('A donor');
    expect(res.body.activity[0].ngoOrgName).toBe('a local NGO');
  });
});
