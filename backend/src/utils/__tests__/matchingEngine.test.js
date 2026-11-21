const {
  haversineDistanceKm,
  proximityScore,
  urgencyScore,
  quantityFitScore,
  rankCandidates,
  MAX_MATCH_RADIUS_KM,
} = require('../matchingEngine');

describe('haversineDistanceKm', () => {
  test('distance between the same point is ~0', () => {
    const point = { lat: 28.6139, lng: 77.209 };
    expect(haversineDistanceKm(point, point)).toBeCloseTo(0, 5);
  });

  test('matches a known real-world distance (Delhi -> Gurgaon, ~25-30km)', () => {
    const delhi = { lat: 28.6139, lng: 77.209 };
    const gurgaon = { lat: 28.4595, lng: 77.0266 };
    const km = haversineDistanceKm(delhi, gurgaon);
    expect(km).toBeGreaterThan(20);
    expect(km).toBeLessThan(35);
  });

  test('is symmetric: distance(a,b) === distance(b,a)', () => {
    const a = { lat: 12.9716, lng: 77.5946 };
    const b = { lat: 19.076, lng: 72.8777 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 8);
  });
});

describe('proximityScore', () => {
  test('is maximum (40) at zero distance', () => {
    expect(proximityScore(0)).toBe(40);
  });

  test('is zero at or beyond MAX_MATCH_RADIUS_KM', () => {
    expect(proximityScore(MAX_MATCH_RADIUS_KM)).toBe(0);
  });

  test('decreases monotonically as distance increases', () => {
    const near = proximityScore(2);
    const mid = proximityScore(10);
    const far = proximityScore(20);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
  });
});

describe('urgencyScore', () => {
  const now = new Date('2026-01-01T12:00:00Z');

  test('is zero once the listing has already expired', () => {
    const expiryInThePast = new Date('2026-01-01T10:00:00Z');
    expect(urgencyScore(expiryInThePast, now)).toBe(0);
  });

  test('is highest when expiry is imminent', () => {
    const soon = new Date('2026-01-01T12:05:00Z'); // 5 minutes left
    const later = new Date('2026-01-01T20:00:00Z'); // 8 hours left
    expect(urgencyScore(soon, now)).toBeGreaterThan(urgencyScore(later, now));
  });

  test('caps out (does not exceed 40) far outside the urgency window', () => {
    const farFuture = new Date('2026-01-05T12:00:00Z'); // 4 days left
    expect(urgencyScore(farFuture, now)).toBeGreaterThanOrEqual(0);
    expect(urgencyScore(farFuture, now)).toBeLessThanOrEqual(40);
  });
});

describe('quantityFitScore', () => {
  test('returns a neutral mid-score when the NGO has no stated capacity', () => {
    expect(quantityFitScore(10, null)).toBe(12);
    expect(quantityFitScore(10, undefined)).toBe(12);
  });

  test('scores highest (20) when quantity is 40-100% of NGO daily capacity', () => {
    expect(quantityFitScore(40, 100)).toBe(20); // exactly 40%
    expect(quantityFitScore(80, 100)).toBe(20); // 80%
    expect(quantityFitScore(100, 100)).toBe(20); // exactly 100%
  });

  test('scores lower when the donation is far too small for the NGO', () => {
    const small = quantityFitScore(5, 100); // 5% of capacity
    expect(small).toBeLessThan(20);
    expect(small).toBeGreaterThanOrEqual(0);
  });

  test('scores lower (but not zero) when the donation far exceeds daily capacity', () => {
    const oversized = quantityFitScore(500, 100); // 5x capacity
    expect(oversized).toBeLessThan(20);
    expect(oversized).toBeGreaterThanOrEqual(4); // floor guard in the implementation
  });
});

describe('rankCandidates', () => {
  const listingLocation = { lat: 28.6139, lng: 77.209 }; // Delhi
  const expiryAt = new Date(Date.now() + 2 * 3600 * 1000); // 2 hours from now

  const nearNGO = { _id: 'ngo-near', location: { lat: 28.62, lng: 77.21 }, dailyCapacityKg: 50 };
  const farNGO = { _id: 'ngo-far', location: { lat: 12.9716, lng: 77.5946 }, dailyCapacityKg: 50 }; // Bangalore
  const midNGO = { _id: 'ngo-mid', location: { lat: 28.4595, lng: 77.0266 }, dailyCapacityKg: 50 }; // Gurgaon

  test('excludes NGOs outside MAX_MATCH_RADIUS_KM', () => {
    const results = rankCandidates(listingLocation, expiryAt, 20, [nearNGO, farNGO]);
    const ids = results.map((r) => r.ngo);
    expect(ids).toContain('ngo-near');
    expect(ids).not.toContain('ngo-far');
  });

  test('ranks closer NGOs above farther ones, sorted descending by score', () => {
    const results = rankCandidates(listingLocation, expiryAt, 20, [midNGO, nearNGO]);
    expect(results[0].ngo).toBe('ngo-near');
    expect(results[0].totalScore).toBeGreaterThanOrEqual(results[1].totalScore);
  });

  test('returns an empty array when no NGOs are within range', () => {
    const results = rankCandidates(listingLocation, expiryAt, 20, [farNGO]);
    expect(results).toEqual([]);
  });
});
