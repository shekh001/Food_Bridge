const FoodListing = require('../models/FoodListing');

const HOUR_BUCKETS = [
  { label: 'Late night (12–6am)', from: 0, to: 6 },
  { label: 'Morning (6–11am)', from: 6, to: 11 },
  { label: 'Lunch (11am–3pm)', from: 11, to: 15 },
  { label: 'Afternoon (3–7pm)', from: 15, to: 19 },
  { label: 'Dinner/night (7pm–12am)', from: 19, to: 24 },
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function hourBucketLabel(hour) {
  return HOUR_BUCKETS.find((b) => hour >= b.from && hour < b.to)?.label || 'Unknown';
}

// Rounds to ~1.1km grid cells at Delhi's latitude (2 decimal places) — coarse enough
// that a handful of historical listings still fall into shared cells.
function gridCell(lat, lng) {
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

/**
 * GET /api/predictions/hotspots
 *
 * NOT a trained ML model — a transparent heuristic: bucket every past
 * listing by (rough location, day-of-week, time-of-day) and rank the
 * buckets that show up most often / with the most volume. This is exactly
 * as sophisticated as the data supports right now (a handful of demo
 * listings); it's designed to get meaningfully better as real usage
 * accumulates, without needing a training pipeline to stand up first.
 */
exports.getHotspots = async (req, res) => {
  try {
    const listings = await FoodListing.find({})
      .select('pickupLocation quantityKg foodType createdAt donor')
      .populate('donor', 'orgType')
      .lean();

    if (listings.length < 3) {
      return res.json({
        hotspots: [],
        sampleSize: listings.length,
        message: 'Not enough historical listings yet to predict patterns — check back after more donations are posted.',
      });
    }

    const buckets = new Map();
    for (const l of listings) {
      const d = new Date(l.createdAt);
      const cell = gridCell(l.pickupLocation.lat, l.pickupLocation.lng);
      const key = `${cell.lat},${cell.lng}|${d.getDay()}|${hourBucketLabel(d.getHours())}`;

      if (!buckets.has(key)) {
        buckets.set(key, {
          lat: cell.lat,
          lng: cell.lng,
          dayOfWeek: DAY_NAMES[d.getDay()],
          timeWindow: hourBucketLabel(d.getHours()),
          count: 0,
          totalKg: 0,
          sampleAddress: l.pickupLocation.address,
          orgTypes: new Set(),
        });
      }
      const b = buckets.get(key);
      b.count += 1;
      b.totalKg += l.quantityKg;
      if (l.donor?.orgType) b.orgTypes.add(l.donor.orgType);
    }

    const hotspots = [...buckets.values()]
      .map((b) => ({
        lat: b.lat,
        lng: b.lng,
        dayOfWeek: b.dayOfWeek,
        timeWindow: b.timeWindow,
        historicalListings: b.count,
        avgQuantityKg: Math.round((b.totalKg / b.count) * 10) / 10,
        likelySource: [...b.orgTypes].join(', ') || 'mixed',
        approxLocation: b.sampleAddress,
      }))
      .sort((a, b) => b.historicalListings - a.historicalListings || b.avgQuantityKg - a.avgQuantityKg)
      .slice(0, 10);

    res.json({ hotspots, sampleSize: listings.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
