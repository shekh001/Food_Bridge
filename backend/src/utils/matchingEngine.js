/**
 * FoodBridge Matching Engine
 * Scores donor <-> NGO pairs using three signals:
 *   1. Proximity   - closer NGOs are strongly preferred (pickup logistics)
 *   2. Urgency     - listings closer to expiry must be surfaced first
 *   3. Quantity fit - an NGO's stated demand vs the listing's quantity
 *
 * Score is normalized 0-100 (higher = better match), so it is easy to
 * reason about / display in the UI and easy to extend later.
 */

const EARTH_RADIUS_KM = 6371;
const MAX_MATCH_RADIUS_KM = 25; // beyond this, an NGO is not considered a candidate

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineDistanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

/** 0-40 pts: closer = higher. Linear decay to 0 at MAX_MATCH_RADIUS_KM. */
function proximityScore(distanceKm) {
  const clamped = Math.min(distanceKm, MAX_MATCH_RADIUS_KM);
  return 40 * (1 - clamped / MAX_MATCH_RADIUS_KM);
}

/** 0-40 pts: less time-to-expiry = higher urgency = higher score. */
function urgencyScore(expiryAt, now = new Date()) {
  const hoursLeft = (new Date(expiryAt).getTime() - now.getTime()) / 36e5;
  if (hoursLeft <= 0) return 0; // already expired, matching engine should exclude these
  const URGENCY_WINDOW_HOURS = 12; // inside this window, urgency ramps up sharply
  const clamped = Math.min(hoursLeft, URGENCY_WINDOW_HOURS);
  return 40 * (1 - clamped / URGENCY_WINDOW_HOURS);
}

/**
 * 0-20 pts: how well the listing quantity fits typical NGO daily demand.
 * If ngoDailyCapacityKg isn't set, default to a neutral mid-score.
 */
function quantityFitScore(quantityKg, ngoDailyCapacityKg) {
  if (!ngoDailyCapacityKg) return 12;
  const ratio = quantityKg / ngoDailyCapacityKg;
  // Best fit is when the listing is 40%-100% of what the NGO can use in a day.
  if (ratio >= 0.4 && ratio <= 1) return 20;
  if (ratio < 0.4) return 20 * (ratio / 0.4);
  return Math.max(4, 20 * (1 / ratio));
}

/**
 * Rank a set of NGO users against a single listing.
 * @param {{lat:number,lng:number}} listingLocation
 * @param {Date|string} expiryAt
 * @param {number} quantityKg
 * @param {Array<{_id, location, dailyCapacityKg?}>} ngos
 * @returns {Array<{ngo, distanceKm, urgencyScore, totalScore}>} sorted desc by totalScore
 */
function rankCandidates(listingLocation, expiryAt, quantityKg, ngos) {
  const urgency = urgencyScore(expiryAt);

  return ngos
    .map((ngo) => {
      const distanceKm = haversineDistanceKm(listingLocation, ngo.location);
      if (distanceKm > MAX_MATCH_RADIUS_KM) return null;

      const proximity = proximityScore(distanceKm);
      const fit = quantityFitScore(quantityKg, ngo.dailyCapacityKg);
      const totalScore = Math.round((proximity + urgency + fit) * 10) / 10;

      return {
        ngo: ngo._id,
        distanceKm: Math.round(distanceKm * 10) / 10,
        urgencyScore: Math.round(urgency * 10) / 10,
        totalScore,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.totalScore - a.totalScore);
}

module.exports = {
  haversineDistanceKm,
  proximityScore,
  urgencyScore,
  quantityFitScore,
  rankCandidates,
  MAX_MATCH_RADIUS_KM,
};
