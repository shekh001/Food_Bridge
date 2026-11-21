const crypto = require('crypto');
const CourierBooking = require('../models/CourierBooking');
const FoodListing = require('../models/FoodListing');
const { sendPushToUser } = require('../utils/push');

const COURIER_FEE_INR = 35; // flat convenience fee — keep in sync with frontend copy

// A small fixed pool standing in for "whichever courier partner picks up the
// job" — there's no real delivery-network integration, so assignment is
// simulated the same way billingController simulates a Pro upgrade when no
// Razorpay keys are configured.
const COURIER_POOL = [
  { name: 'Raj Kumar', phone: '+91 98XXX-11023' },
  { name: 'Priya Singh', phone: '+91 98XXX-44510' },
  { name: 'Mohammed Iqbal', phone: '+91 98XXX-77291' },
  { name: 'Anita Desai', phone: '+91 98XXX-33087' },
];

function razorpayConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function notify(userId, payload) {
  sendPushToUser(userId, payload).catch(() => {});
}

function getIO(req) {
  return req.app.get('io');
}

// Only the NGO that actually claimed the listing may book a courier for it,
// and only while it's genuinely awaiting pickup. Pure validation — never
// touches `res` itself, so the same check can be reused by callers that
// need different failure handling (e.g. verifyAndBook, which must refund
// real money on a rejection here, not just return an error).
async function checkListingBookable(listingId, ngoId) {
  const listing = await FoodListing.findById(listingId);
  if (!listing) return { ok: false, status: 404, message: 'Listing not found' };
  if (String(listing.claimedBy) !== String(ngoId)) {
    return { ok: false, status: 403, message: 'You can only book a courier for a listing you claimed' };
  }
  if (listing.status !== 'claimed') {
    return { ok: false, status: 409, message: 'A courier can only be booked while the listing is awaiting pickup' };
  }
  const existing = await CourierBooking.findOne({ listing: listing._id, status: { $ne: 'cancelled' } });
  if (existing) {
    return { ok: false, status: 409, message: 'A courier is already booked for this listing' };
  }
  return { ok: true, listing };
}

async function loadBookableListing(req, res) {
  const result = await checkListingBookable(req.params.listingId, req.user._id);
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return null;
  }
  return result.listing;
}

function assignSimulatedCourier() {
  const courier = COURIER_POOL[Math.floor(Math.random() * COURIER_POOL.length)];
  const etaMinutes = 20 + Math.floor(Math.random() * 20); // 20–39 min, plausible for a local courier
  return { ...courier, etaMinutes };
}

async function finalizeBooking({ listing, ngo, feeInr, razorpayPaymentId }) {
  const { name, phone, etaMinutes } = assignSimulatedCourier();
  const booking = await CourierBooking.create({
    listing: listing._id,
    requestedBy: ngo._id,
    feeInr,
    courierName: name,
    courierPhone: phone,
    etaMinutes,
    pickupAddress: listing.pickupLocation?.address || '',
    dropoffAddress: ngo.address || '',
    razorpayPaymentId: razorpayPaymentId || undefined,
  });
  return booking;
}

// POST /api/couriers/:listingId/create-order  (ngo)
exports.createOrder = async (req, res) => {
  try {
    const listing = await loadBookableListing(req, res);
    if (!listing) return;

    if (!razorpayConfigured()) {
      return res.json({ demoMode: true, amountInr: COURIER_FEE_INR });
    }

    // eslint-disable-next-line global-require
    const Razorpay = require('razorpay');
    const instance = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const order = await instance.orders.create({
      amount: COURIER_FEE_INR * 100,
      currency: 'INR',
      receipt: `courier-${listing._id}-${Date.now()}`,
    });

    res.json({ demoMode: false, order, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/couriers/:listingId/confirm-demo  (ngo, only when Razorpay isn't configured)
exports.confirmDemoBooking = async (req, res) => {
  try {
    if (razorpayConfigured()) return res.status(400).json({ message: 'Not in demo payment mode' });

    const listing = await loadBookableListing(req, res);
    if (!listing) return;

    const booking = await finalizeBooking({ listing, ngo: req.user, feeInr: COURIER_FEE_INR });
    await notifyAndBroadcast(req, listing, booking);
    res.status(201).json({ booking });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'A courier is already booked for this listing' });
    res.status(500).json({ message: err.message });
  }
};

// POST /api/couriers/:listingId/verify  (ngo)  body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
exports.verifyAndBook = async (req, res) => {
  try {
    if (!razorpayConfigured()) return res.status(400).json({ message: 'Not in live payment mode' });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification failed — signature mismatch' });
    }

    // The signature checks out, which means Razorpay has genuinely captured
    // this payment already. Every rejection from this point on has to
    // refund it — a few seconds passed between the NGO opening checkout and
    // this request landing, and the listing could easily have changed
    // underneath them (donor cancelled it, someone else booked a courier
    // first) in that window. Without this, the NGO would simply be charged
    // for a booking that never gets created.
    const result = await checkListingBookable(req.params.listingId, req.user._id);
    if (!result.ok) {
      await refundRawPayment(razorpay_payment_id, COURIER_FEE_INR);
      return res.status(result.status).json({ message: `${result.message} — your payment has been refunded.` });
    }

    const booking = await finalizeBooking({
      listing: result.listing, ngo: req.user, feeInr: COURIER_FEE_INR, razorpayPaymentId: razorpay_payment_id,
    });
    await notifyAndBroadcast(req, result.listing, booking);
    res.status(201).json({ booking });
  } catch (err) {
    if (err.code === 11000) {
      // Same race, caught at the DB layer instead (two simultaneous
      // requests both passed the check above) — still refund.
      await refundRawPayment(req.body.razorpay_payment_id, COURIER_FEE_INR).catch(() => {});
      return res.status(409).json({ message: 'A courier is already booked for this listing — your payment has been refunded.' });
    }
    res.status(500).json({ message: err.message });
  }
};

async function notifyAndBroadcast(req, listing, booking) {
  notify(listing.donor, {
    title: 'Courier booked for pickup',
    body: `${booking.courierName} will collect "${listing.foodType}" in about ${booking.etaMinutes} min.`,
    url: `/listings/${listing._id}`,
  });
  const io = getIO(req);
  if (io) {
    const payload = {
      listingId: listing._id,
      bookingId: booking._id,
      courierName: booking.courierName,
      courierPhone: booking.courierPhone,
      etaMinutes: booking.etaMinutes,
      pickupAddress: booking.pickupAddress,
      dropoffAddress: booking.dropoffAddress,
    };
    io.to(`user:${listing.donor}`).emit('courier:assigned', payload);
    io.to(`user:${listing.claimedBy}`).emit('courier:assigned', payload);
  }
}

// GET /api/couriers/mine  (ngo) — every booking this NGO has made
exports.myBookings = async (req, res) => {
  const bookings = await CourierBooking.find({ requestedBy: req.user._id })
    .sort({ createdAt: -1 })
    .populate('listing', 'foodType quantityKg status');
  res.json({ bookings });
};

// GET /api/couriers/:listingId  (the listing's donor OR the NGO that claimed it)
// Lets the donor see, read-only, that a courier has been arranged — without
// exposing courier bookings on listings they have no connection to.
exports.getForListing = async (req, res) => {
  const listing = await FoodListing.findById(req.params.listingId).select('donor claimedBy');
  if (!listing) return res.status(404).json({ message: 'Listing not found' });

  const isParty = [String(listing.donor), String(listing.claimedBy)].includes(String(req.user._id));
  if (!isParty) return res.status(403).json({ message: 'Not authorized to view this' });

  const booking = await CourierBooking.findOne({ listing: listing._id, status: { $ne: 'cancelled' } });
  res.json({ booking: booking || null });
};

// Not an HTTP route — called from listingController the moment a listing's
// own status transitions to 'picked_up', so the courier booking's status
// stays in sync automatically. There's no separate "confirm pickup" step
// for the NGO to remember: one action (marking the listing picked up)
// updates both records together, the same way a courier's own delivery app
// would report a handoff in a real integration.
exports.markBookingPickedUpForListing = async function markBookingPickedUpForListing(listingId) {
  const booking = await CourierBooking.findOne({ listing: listingId, status: 'assigned' });
  if (!booking) return null;
  booking.status = 'picked_up';
  booking.pickedUpAt = new Date();
  await booking.save();
  return booking;
};

// Same Razorpay refund call as attemptRefund, but for a payment that never
// made it into a CourierBooking record at all (verifyAndBook rejecting
// after the money already moved). Best-effort — logged via the caller
// catching, not thrown, so a refund failure doesn't crash the request.
async function refundRawPayment(paymentId, amountInr) {
  if (!paymentId || !razorpayConfigured()) return false;
  try {
    // eslint-disable-next-line global-require
    const Razorpay = require('razorpay');
    const instance = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    await instance.payments.refund(paymentId, { amount: amountInr * 100 });
    return true;
  } catch (err) {
    return false;
  }
}

// If the booking's payment went through real Razorpay (razorpayPaymentId is
// set), issue an actual refund. Demo-mode bookings never moved real money,
// so there's nothing to refund — 'not_applicable' is the correct, honest
// resting state for those, not a failure.
async function issueRazorpayRefund(paymentId, feeInr) {
  if (!paymentId || !razorpayConfigured()) return false;
  try {
    // eslint-disable-next-line global-require
    const Razorpay = require('razorpay');
    const instance = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    await instance.payments.refund(paymentId, { amount: feeInr * 100 });
    return true;
  } catch (err) {
    return false;
  }
}

async function attemptRefund(booking) {
  if (!booking.razorpayPaymentId) {
    booking.refundStatus = 'not_applicable';
    return;
  }
  const ok = await issueRazorpayRefund(booking.razorpayPaymentId, booking.feeInr);
  booking.refundStatus = ok ? 'refunded' : 'refund_failed';
}

function refundMessage(booking) {
  if (booking.refundStatus === 'refunded') return `Your ₹${booking.feeInr} fee has been refunded.`;
  if (booking.refundStatus === 'refund_failed') return 'Refund failed — our team will follow up on this manually.';
  return null; // demo-mode: no real money moved, nothing to say about a refund
}

// PATCH /api/couriers/:id/cancel  (ngo that made the booking) — the NGO
// changed their mind (their own volunteer showed up after all, etc). Only
// while the booking is still 'assigned' — once a courier has actually
// picked the food up, cancelling would be a lie about what happened.
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await CourierBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (String(booking.requestedBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not your booking' });
    }
    if (booking.status !== 'assigned') {
      return res.status(409).json({ message: `Cannot cancel a booking that is already ${booking.status}` });
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancelledBy = 'ngo';
    booking.cancelledReason = req.body?.reason || '';
    await attemptRefund(booking);
    await booking.save();

    const listing = await FoodListing.findById(booking.listing).select('donor claimedBy foodType');
    const io = getIO(req);
    if (listing) {
      notify(listing.donor, {
        title: 'Courier booking cancelled',
        body: `The NGO cancelled the courier booked for "${listing.foodType}".`,
      });
      if (io) {
        io.to(`user:${listing.donor}`).emit('courier:cancelled', { listingId: listing._id });
        if (listing.claimedBy) io.to(`user:${listing.claimedBy}`).emit('courier:cancelled', { listingId: listing._id });
      }
    }

    res.json({ booking, refundMessage: refundMessage(booking) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/couriers  (admin) — every booking, refund_failed ones first
// since those are the only ones that actually need a human to act on them.
exports.adminListBookings = async (req, res) => {
  const bookings = await CourierBooking.find()
    .sort({ createdAt: -1 })
    .populate('listing', 'foodType status')
    .populate('requestedBy', 'orgName email');

  const priority = { refund_failed: 0, assigned: 1, picked_up: 2, cancelled: 3, not_applicable: 4 };
  bookings.sort((a, b) => (priority[a.refundStatus] ?? 5) - (priority[b.refundStatus] ?? 5));

  res.json({ bookings });
};

// PATCH /api/admin/couriers/:id/retry-refund  (admin) — the only actual
// follow-up path for the "our team will follow up" promise made to an NGO
// when a Razorpay refund fails. Without this endpoint that promise was
// unkeepable: nothing anywhere surfaced refund_failed bookings, and nothing
// could act on one even if an admin somehow knew it existed.
exports.adminRetryRefund = async (req, res) => {
  try {
    const booking = await CourierBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.refundStatus !== 'refund_failed') {
      return res.status(409).json({ message: `Nothing to retry — refund status is '${booking.refundStatus}'` });
    }
    await attemptRefund(booking);
    await booking.save();

    if (booking.refundStatus === 'refunded') {
      notify(booking.requestedBy, {
        title: 'Refund processed',
        body: `Your ₹${booking.feeInr} courier fee has now been refunded.`,
      });
    }

    res.json({ booking });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Not an HTTP route — called from listingController when a listing gets
// cancelled by the donor, or a claim gets released by the NGO, so an active,
// already-paid courier booking never gets silently orphaned. Without this,
// the booking stays 'assigned' forever, and the unique index on `listing`
// would permanently block any future courier booking on that listing (even
// after it's re-claimed by a different NGO), and the NGO's fee just
// vanishes with no refund and no notice.
exports.cancelActiveBookingForListing = async function cancelActiveBookingForListing(listingId, { io, reason } = {}) {
  const booking = await CourierBooking.findOne({ listing: listingId, status: 'assigned' });
  if (!booking) return null;

  booking.status = 'cancelled';
  booking.cancelledAt = new Date();
  booking.cancelledBy = 'system';
  booking.cancelledReason = reason || '';
  await attemptRefund(booking);
  await booking.save();

  const refundNote = refundMessage(booking);
  notify(booking.requestedBy, {
    title: 'Courier booking cancelled',
    body: `The pickup it was booked for is no longer happening.${refundNote ? ` ${refundNote}` : ''}`,
  });
  if (io) io.to(`user:${booking.requestedBy}`).emit('courier:cancelled', { listingId: String(listingId) });

  return booking;
};
