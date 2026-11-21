const path = require('path');
const fs = require('fs');
const FoodListing = require('../models/FoodListing');
const User = require('../models/User');
const { rankCandidates } = require('../utils/matchingEngine');
const { sendPushToUser } = require('../utils/push');
const { LISTING_PHOTO_DIR, storedValueFor, isCloudReference, cloudDeliveryUrl, cleanupUploadedFile } = require('../middleware/upload');
const { cancelActiveBookingForListing, markBookingPickedUpForListing } = require('./courierController');
const { fulfillNeed } = require('./needController');

// Fire-and-forget wrapper — a push failure must never break the API request that triggered it.
function notify(userId, payload) {
  sendPushToUser(userId, payload).catch(() => {});
}

function getIO(req) {
  return req.app.get('io');
}

// POST /api/listings  (donor)
exports.createListing = async (req, res) => {
  try {
    if (!req.user.verified) {
      return res.status(403).json({
        message: req.user.emailVerified
          ? "Your registration document is still awaiting admin review — you'll be able to post as soon as it's approved."
          : 'Please verify your email and wait for your registration document to be approved before posting listings.',
      });
    }

    // pickupLocation arrives as a JSON string when the request is
    // multipart/form-data (a photo was attached) instead of plain JSON.
    let { foodType, description, quantityKg, expiryAt, pickupLocation, fulfillsNeedId } = req.body;
    if (typeof pickupLocation === 'string') {
      try { pickupLocation = JSON.parse(pickupLocation); } catch { pickupLocation = null; }
    }
    if (!foodType || !quantityKg || !expiryAt || !pickupLocation) {
      if (req.file) cleanupUploadedFile(req.file, { isPrivate: false });
      return res.status(400).json({ message: 'Missing required listing fields' });
    }

    const listing = await FoodListing.create({
      donor: req.user._id,
      foodType,
      description,
      quantityKg,
      expiryAt,
      pickupLocation,
      photo: req.file ? storedValueFor(req.file) : null,
    });

    // Run the matching engine against verified NGOs
    const ngos = await User.find({ role: 'ngo', verified: true }).select('location dailyCapacityKg');
    const ranked = rankCandidates(pickupLocation, expiryAt, quantityKg, ngos);
    listing.matchedCandidates = ranked.slice(0, 10).map((r) => ({
      ngo: r.ngo,
      distanceKm: r.distanceKm,
      urgencyScore: r.urgencyScore,
      totalScore: r.totalScore,
    }));
    await listing.save();

    const populated = await listing.populate('donor', 'orgName orgType location');

    // Real-time notify top-matched NGOs
    const io = getIO(req);
    if (io) {
      ranked.slice(0, 10).forEach((r) => {
        io.to(`user:${r.ngo}`).emit('listing:new_match', {
          listing: populated,
          distanceKm: r.distanceKm,
          totalScore: r.totalScore,
        });
      });
      io.to('role:ngo').emit('feed:new_listing', populated); // general live feed
    }
    ranked.slice(0, 10).forEach((r) => {
      notify(r.ngo, {
        title: `New surplus food nearby (${r.distanceKm.toFixed(1)} km)`,
        body: `${foodType} · ${quantityKg}kg from ${populated.donor.orgName}`,
        url: `/listings/${listing._id}`,
      });
    });

    // If this listing was posted in direct response to an open Need on the
    // board, close the loop: mark it fulfilled and let the NGO know a
    // donor actually answered instead of it sitting there unanswered.
    if (fulfillsNeedId) {
      await fulfillNeed(fulfillsNeedId, populated, io).catch(() => {});
    }

    res.status(201).json({ listing: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/listings  (ngo browse - ranked by match score against this NGO)
exports.browseListings = async (req, res) => {
  try {
    const { status = 'posted' } = req.query;
    const listings = await FoodListing.find({ status, expiryAt: { $gt: new Date() } })
      .populate('donor', 'orgName orgType rating')
      .sort({ createdAt: -1 })
      .lean();

    if (req.user.role === 'ngo') {
      const me = { lat: req.user.location.lat, lng: req.user.location.lng };
      const { rankCandidates: rank } = require('../utils/matchingEngine');
      listings.forEach((l) => {
        const [scored] = rank(l.pickupLocation, l.expiryAt, l.quantityKg, [
          { _id: req.user._id, location: me },
        ]);
        l.myMatchScore = scored ? scored.totalScore : 0;
        l.myDistanceKm = scored ? scored.distanceKm : null;
      });
      listings.sort((a, b) => b.myMatchScore - a.myMatchScore);
    }

    res.json({ listings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/listings/mine  (donor's own listings)
exports.myListings = async (req, res) => {
  try {
    const listings = await FoodListing.find({ donor: req.user._id })
      .populate('claimedBy', 'orgName orgType')
      .sort({ createdAt: -1 });
    res.json({ listings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/listings/my-claims  (NGO's own claimed listings — active pickups
// plus recent history). Without this, an NGO's only way to find a listing
// they'd already claimed was to still have the original browser tab open —
// there was nowhere in the dashboard to come back to it, see a donor's
// cancellation, or mark it picked up/delivered later.
exports.myClaims = async (req, res) => {
  try {
    const listings = await FoodListing.find({ claimedBy: req.user._id })
      .populate('donor', 'orgName orgType phone')
      .sort({ claimedAt: -1 })
      .limit(50);
    res.json({ listings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/listings/:id
// Phone numbers, exact home-base GPS coordinates, and the internal matched-candidates
// ranking are sensitive — they're only useful to (and only shown to) the donor, the
// claiming NGO, or an admin. Everyone else (any other logged-in donor/NGO browsing)
// gets the safe public view: org name, type, rating, and the listing's own pickup
// point (which is meant to be public — that's how matching/browsing works at all).
exports.getListing = async (req, res) => {
  try {
    const listing = await FoodListing.findById(req.params.id)
      .populate('donor', 'orgName orgType location phone rating')
      .populate('claimedBy', 'orgName orgType location phone rating');
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    const isDonor = String(listing.donor._id) === String(req.user._id);
    const isClaimant = listing.claimedBy && String(listing.claimedBy._id) === String(req.user._id);
    const isParty = isDonor || isClaimant || req.user.role === 'admin';

    const result = listing.toObject();
    if (!isParty) {
      // Strip PII that only matters for actually coordinating this specific pickup.
      delete result.donor.phone;
      delete result.donor.location;
      if (result.claimedBy) {
        delete result.claimedBy.phone;
        delete result.claimedBy.location;
      }
      delete result.matchedCandidates; // internal ranking — not other NGOs' business
    }

    res.json({ listing: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/listings/:id/photo/:filename — streams a listing's photo.
// Not sensitive the way verification docs or report evidence are (a photo
// of surplus food isn't PII), so any logged-in user can view it — the only
// gate here is "you have to be authenticated at all", same as every other
// /api/listings route.
exports.getListingPhoto = async (req, res) => {
  const listing = await FoodListing.findById(req.params.id).select('photo');
  if (!listing || !listing.photo) return res.status(404).json({ message: 'No photo on this listing' });

  // Filename is looked up from the DB record rather than trusted from the
  // URL — same anti-path-traversal pattern used for verification docs and
  // report evidence. (The frontend percent-encodes this value since a
  // Cloudinary reference contains slashes; Express decodes it back before
  // it reaches req.params.)
  const filename = isCloudReference(req.params.filename) ? req.params.filename : path.basename(req.params.filename);
  if (listing.photo !== filename) {
    return res.status(404).json({ message: 'Photo not found on this listing' });
  }

  const cloudUrl = cloudDeliveryUrl(filename, { isPrivate: false });
  if (cloudUrl) return res.redirect(cloudUrl);

  const filePath = path.join(LISTING_PHOTO_DIR, filename);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ message: 'File could not be found' });
    }
  });
};

// POST /api/listings/:id/claim  (ngo)
// CONCURRENCY: uses one atomic findOneAndUpdate instead of "read status, then
// write" — the database itself only lets the update through if status is
// still 'posted' at the moment it writes. If two NGOs tap "claim" on the
// same listing within the same second, only one update can match and
// succeed; the second gets back null and a clean "already claimed" error,
// instead of both silently overwriting each other.
exports.claimListing = async (req, res) => {
  try {
    // Defense in depth: the NGO dashboard already hides the claim UI from
    // unverified accounts, but the API itself must not rely on the frontend
    // to enforce this — anyone could call this endpoint directly.
    if (!req.user.verified) {
      return res.status(403).json({
        message: "Your account isn't verified yet — an admin needs to approve your registration document before you can claim listings.",
      });
    }

    const listing = await FoodListing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    if (new Date(listing.expiryAt) <= new Date() && listing.status === 'posted') {
      listing.status = 'expired';
      await listing.save();
      return res.status(410).json({ message: 'This listing has expired' });
    }

    const claimed = await FoodListing.findOneAndUpdate(
      { _id: req.params.id, status: 'posted' },
      { status: 'claimed', claimedBy: req.user._id, claimedAt: new Date() },
      { new: true },
    );

    if (!claimed) {
      // Someone else's claim (or an expiry) landed first between our read
      // above and this write — re-check to give an accurate message.
      const current = await FoodListing.findById(req.params.id);
      const reason = current ? `already ${current.status}` : 'no longer available';
      return res.status(409).json({ message: `Listing ${reason}` });
    }

    const io = getIO(req);
    if (io) {
      io.to(`user:${claimed.donor}`).emit('listing:claimed', {
        listingId: claimed._id,
        claimedBy: { id: req.user._id, orgName: req.user.orgName },
      });
      // Tell every other NGO's live feed to drop this listing right now —
      // without this, an NGO only finds out it's gone when THEY try to claim
      // it and get a 409. Broadcasting removes the "several NGOs staring at
      // the same listing" confusion instead of relying on a failed click.
      io.to('role:ngo').emit('listing:removed', { listingId: claimed._id });
    }
    notify(claimed.donor, {
      title: 'Your listing was claimed!',
      body: `${req.user.orgName} is picking up your ${claimed.foodType}`,
      url: `/listings/${claimed._id}`,
    });

    res.json({ listing: claimed });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/listings/:id/release  (ngo — must be the current claimant)
// Lets an NGO back out of a claim it can no longer fulfil (vehicle broke
// down, volunteer fell through, etc.) instead of the listing staying stuck
// as "claimed" forever with nobody coming to pick it up — which was
// strictly worse for food-waste than never having been claimed at all.
exports.releaseClaim = async (req, res) => {
  try {
    const { reason } = req.body;
    const listing = await FoodListing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    if (!listing.claimedBy || String(listing.claimedBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only release a listing you claimed' });
    }
    if (listing.status !== 'claimed') {
      return res.status(409).json({
        message: listing.status === 'picked_up'
          ? 'This has already been picked up — coordinate directly with the donor instead of releasing it.'
          : `Cannot release a listing that is ${listing.status}`,
      });
    }

    const stillFresh = new Date(listing.expiryAt) > new Date();
    // Atomic, same reasoning as claimListing: only succeeds if this NGO is
    // still the claimant and it's still in 'claimed' state at write time.
    const released = await FoodListing.findOneAndUpdate(
      { _id: req.params.id, claimedBy: req.user._id, status: 'claimed' },
      { status: stillFresh ? 'posted' : 'expired', claimedBy: null, claimedAt: null },
      { new: true },
    ).populate('donor', 'orgName orgType location');

    if (!released) {
      return res.status(409).json({ message: 'Could not release this listing — it may have already changed.' });
    }

    const io = getIO(req);
    // Same reasoning as the donor-cancel path: a booked-and-paid courier
    // shouldn't be left orphaned when the claim backing it out disappears.
    await cancelActiveBookingForListing(released._id, { io, reason: 'NGO released the claim' });
    if (io) {
      io.to(`user:${released.donor._id}`).emit('listing:status_update', {
        listingId: released._id,
        status: stillFresh ? 'released' : 'expired',
      });
      if (stillFresh) {
        // Give every NGO's live feed the listing back, the same way a brand
        // new posting appears — it's genuinely available again.
        io.to('role:ngo').emit('feed:new_listing', released);
      }
    }
    notify(released.donor._id, {
      title: stillFresh ? 'A claim was released' : 'Claimed listing expired',
      body: stillFresh
        ? `${req.user.orgName} could not pick up your ${released.foodType}${reason ? `: ${reason}` : '.'} It's back on the live feed.`
        : `${released.foodType} expired before ${req.user.orgName} could pick it up.`,
      url: `/listings/${released._id}`,
    });

    res.json({ listing: released });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/listings/:id/release  (ngo — releases a claim they can no
// longer follow through on, e.g. vehicle broke down, emergency came up).
// Without this, a claimed-but-abandoned listing was stuck forever: nobody
// else could claim it, and the food that was supposed to be rescued just
// sat there until it expired — exactly the outcome the whole platform
// exists to prevent.
// PATCH /api/listings/:id/status   body: { status: 'picked_up' | 'delivered' | 'cancelled' }
exports.updateStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const allowed = ['picked_up', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status transition' });

    const listing = await FoodListing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    const isDonor = String(listing.donor) === String(req.user._id);
    const isClaimant = listing.claimedBy && String(listing.claimedBy) === String(req.user._id);
    if (!isDonor && !isClaimant && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this listing' });
    }

    // CANCELLATION RULES:
    //  - Only the donor (or an admin) can cancel — the claiming NGO backing
    //    out is a different action (releasing the claim) that shouldn't
    //    delete the donor's listing outright.
    //  - Only makes sense before pickup. Once food has actually left the
    //    donor's premises, "cancelled" is a lie about what happened — at
    //    that point donor/NGO should coordinate directly (chat) instead.
    if (status === 'cancelled') {
      if (!isDonor && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Only the donor can cancel this listing' });
      }
      if (!['posted', 'claimed'].includes(listing.status)) {
        return res.status(409).json({ message: `Cannot cancel a listing that is already ${listing.status}` });
      }
    }

    const wasUnclaimedListing = listing.status === 'posted';
    listing.status = status;
    if (status === 'picked_up') listing.pickedUpAt = new Date();
    if (status === 'delivered') {
      listing.deliveredAt = new Date();
      await User.findByIdAndUpdate(listing.donor, { $inc: { totalDonationsKg: listing.quantityKg } });
      if (listing.claimedBy) {
        await User.findByIdAndUpdate(listing.claimedBy, { $inc: { totalReceivedKg: listing.quantityKg } });
      }
    }
    if (notes) listing.notes = notes;
    await listing.save();

    const io = getIO(req);

    // A courier that was booked (and paid for) for this pickup shouldn't be
    // left dangling once the listing it belonged to is cancelled — refund
    // it and free up the listing for a future courier booking too.
    if (status === 'cancelled') {
      await cancelActiveBookingForListing(listing._id, { io, reason: 'Listing was cancelled by the donor' });
    }
    // Whoever is marking pickup already confirmed it happened — carry that
    // same confirmation onto any courier booking, instead of leaving it
    // stuck on 'assigned' forever with no second step to sync it.
    if (status === 'picked_up') {
      await markBookingPickedUpForListing(listing._id);
    }

    if (io) {
      io.to(`user:${listing.donor}`).emit('listing:status_update', { listingId: listing._id, status });
      if (listing.claimedBy) {
        io.to(`user:${listing.claimedBy}`).emit('listing:status_update', { listingId: listing._id, status });
      }
      // A listing cancelled while still unclaimed was visible in every NGO's
      // live feed — tell them all it's gone the same way a successful claim
      // does, instead of leaving a dead entry that 404s or errors on click.
      if (status === 'cancelled' && wasUnclaimedListing) {
        io.to('role:ngo').emit('listing:removed', { listingId: listing._id });
      }
    }
    const statusLabel = { picked_up: 'picked up', delivered: 'delivered', cancelled: 'cancelled' }[status] || status;
    [listing.donor, listing.claimedBy].filter(Boolean).forEach((uid) => {
      if (String(uid) === String(req.user._id)) return; // don't notify the person who made the change
      notify(uid, {
        title: `Listing ${statusLabel}`,
        body: status === 'cancelled'
          ? `The donor cancelled the ${listing.foodType} donation${notes ? `: ${notes}` : '.'}`
          : `${listing.foodType} is now ${statusLabel}`,
        url: `/listings/${listing._id}`,
      });
    });

    res.json({ listing });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
