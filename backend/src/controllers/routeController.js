const FoodListing = require('../models/FoodListing');

const OSRM_BASE = 'https://router.project-osrm.org';

/**
 * GET /api/routes/optimize  (ngo only)
 *
 * Multi-stop route optimization for an NGO's pending pickups (claimed or
 * picked_up, i.e. not yet delivered). Uses OSRM's public "trip" service —
 * free, no API key, solves a small travelling-salesman-style ordering
 * problem starting from the NGO's own location.
 *
 * This is a real optimizer (not a stub): OSRM returns the actual
 * shortest-total-time visiting order plus route geometry, which is exactly
 * what a volunteer would need once there are enough concurrent pickups to
 * make ordering matter (2+ stops).
 */
exports.optimizeRoute = async (req, res) => {
  try {
    const stops = await FoodListing.find({
      claimedBy: req.user._id,
      status: { $in: ['claimed', 'picked_up'] },
    })
      .populate('donor', 'orgName phone')
      .select('foodType quantityKg servingsEstimate pickupLocation status donor expiryAt');

    if (stops.length === 0) {
      return res.json({ stops: [], message: 'No pending pickups to route right now.' });
    }

    if (stops.length === 1) {
      // Nothing to optimize with a single stop — just point straight at it.
      const s = stops[0];
      return res.json({
        stops: [{ order: 1, listing: s }],
        geometry: null,
        distanceKm: null,
        durationMin: null,
        message: 'Only one pending pickup — single direct trip, no ordering needed.',
      });
    }

    if (stops.length > 12) {
      return res.status(400).json({
        message: 'Too many pending pickups to optimize in one trip (max 12) — consider splitting into batches.',
      });
    }

    // OSRM expects "lon,lat" pairs, semicolon-separated, starting with the NGO's own location.
    const coords = [
      `${req.user.location.lng},${req.user.location.lat}`,
      ...stops.map((s) => `${s.pickupLocation.lng},${s.pickupLocation.lat}`),
    ].join(';');

    const url = `${OSRM_BASE}/trip/v1/driving/${coords}?source=first&roundtrip=false&geometries=geojson&overview=full`;
    const osrmRes = await fetch(url);
    if (!osrmRes.ok) throw new Error(`OSRM request failed (${osrmRes.status})`);
    const data = await osrmRes.json();

    if (data.code !== 'Ok') {
      return res.status(502).json({ message: `Route service could not solve this trip: ${data.code}` });
    }

    const trip = data.trips[0];
    // waypoints[0] is always the NGO start; the rest map back to `stops` in input order,
    // each carrying the optimized visiting position ("waypoint_index").
    const ordered = data.waypoints
      .slice(1)
      .map((wp, i) => ({ stopIndex: i, visitOrder: wp.waypoint_index }))
      .sort((a, b) => a.visitOrder - b.visitOrder)
      .map((entry, position) => ({ order: position + 1, listing: stops[entry.stopIndex] }));

    res.json({
      stops: ordered,
      geometry: trip.geometry, // GeoJSON LineString, [lng, lat] pairs
      distanceKm: Math.round((trip.distance / 1000) * 10) / 10,
      durationMin: Math.round(trip.duration / 60),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
