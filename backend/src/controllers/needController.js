const Need = require('../models/Need');
const { sendPushToUser } = require('../utils/push');

function notify(userId, payload) {
  sendPushToUser(userId, payload).catch(() => {});
}

function getIO(req) {
  return req.app.get('io');
}

// POST /api/needs  (ngo)
exports.createNeed = async (req, res) => {
  try {
    // Same trust bar as posting a listing — an NGO whose registration
    // hasn't been approved yet shouldn't be able to publicly solicit food
    // from donors any more than an unverified donor should be able to post
    // a listing.
    if (!req.user.verified) {
      return res.status(403).json({ message: 'Your account must be verified before posting to the needs board' });
    }

    const { foodType, quantityKg, neededBy, notes } = req.body;
    if (!foodType || !quantityKg || !neededBy) {
      return res.status(400).json({ message: 'foodType, quantityKg, and neededBy are required' });
    }
    if (new Date(neededBy).getTime() <= Date.now()) {
      return res.status(400).json({ message: 'neededBy must be a future date' });
    }

    const need = await Need.create({
      ngo: req.user._id,
      foodType,
      quantityKg,
      neededBy,
      notes,
    });

    // Broadcast to every donor currently online — the whole point of the
    // board is that donors see real demand instead of posting blind.
    const io = getIO(req);
    if (io) {
      io.to('role:donor').emit('need:posted', {
        _id: need._id,
        foodType: need.foodType,
        quantityKg: need.quantityKg,
        neededBy: need.neededBy,
        ngoOrgName: req.user.orgName,
      });
    }

    res.status(201).json({ need });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/needs  (donor-facing browse — any logged-in user can view)
// Open needs only, deadline not yet passed, soonest deadline first — a
// need nobody can fulfil in time shouldn't clutter the board.
exports.listOpenNeeds = async (req, res) => {
  try {
    const needs = await Need.find({ status: 'open', neededBy: { $gt: new Date() } })
      .sort({ neededBy: 1 })
      .populate('ngo', 'orgName orgType location');
    res.json({ needs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/needs/mine  (ngo) — including cancelled/fulfilled/expired-while-open,
// so an NGO can see the full history of what it's asked for.
exports.myNeeds = async (req, res) => {
  try {
    const needs = await Need.find({ ngo: req.user._id })
      .sort({ createdAt: -1 })
      .populate('fulfilledByListing', 'foodType quantityKg donor status');
    res.json({ needs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/needs/:id/cancel  (ngo, owner only)
exports.cancelNeed = async (req, res) => {
  try {
    const need = await Need.findById(req.params.id);
    if (!need) return res.status(404).json({ message: 'Need not found' });
    if (String(need.ngo) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not your need' });
    }
    if (need.status !== 'open') {
      return res.status(409).json({ message: `Cannot cancel a need that is already ${need.status}` });
    }
    need.status = 'cancelled';
    await need.save();
    res.json({ need });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Not an HTTP route — called from listingController.createListing when a
// donor's new listing carries a `fulfillsNeedId`. Marks the need fulfilled,
// links the listing, and tells the NGO a donor actually responded instead
// of their request just sitting there unanswered.
exports.fulfillNeed = async function fulfillNeed(needId, listing, io) {
  const need = await Need.findById(needId);
  if (!need || need.status !== 'open') return null; // stale/expired/already-handled request — silently ignore, don't fail the listing creation over it

  need.status = 'fulfilled';
  need.fulfilledByListing = listing._id;
  await need.save();

  notify(need.ngo, {
    title: 'A donor responded to your need',
    body: `${listing.foodType} (${listing.quantityKg}kg) was just listed to fulfil your request.`,
    url: `/listings/${listing._id}`,
  });
  if (io) io.to(`user:${need.ngo}`).emit('need:fulfilled', { needId: need._id, listingId: listing._id });

  return need;
};
