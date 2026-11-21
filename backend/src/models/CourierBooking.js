const mongoose = require('mongoose');

/**
 * A courier booking is the NGO paying a small convenience fee to have a
 * third-party courier handle the physical pickup, instead of relying on
 * their own volunteer/transport. One booking belongs to one listing.
 *
 * There's no real courier network wired up (that would need a live
 * delivery-partner API contract) — same "demo unless real keys are
 * configured" pattern billingController already uses for Razorpay. The
 * *payment* can be real (Razorpay), the *dispatch* is always simulated,
 * clearly labeled as such in the API response and the UI.
 */
const courierBookingSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodListing', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // the NGO
    feeInr: { type: Number, required: true },
    status: {
      type: String,
      enum: ['assigned', 'picked_up', 'cancelled'],
      default: 'assigned',
    },
    courierName: { type: String },
    courierPhone: { type: String },
    etaMinutes: { type: Number },
    // Snapshotted at booking time (not a live reference) — if either party
    // edits their address later, this booking should still show what the
    // courier was actually told to go to.
    pickupAddress: { type: String },
    dropoffAddress: { type: String },
    assignedAt: { type: Date, default: Date.now },
    pickedUpAt: { type: Date },
    // Only set in live-payment mode — needed to issue a real Razorpay
    // refund if the booking later gets cancelled.
    razorpayPaymentId: { type: String },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, enum: ['ngo', 'system'] }, // 'system' = the underlying listing was cancelled/released, not a direct NGO action
    cancelledReason: { type: String },
    refundStatus: {
      type: String,
      enum: ['not_applicable', 'refunded', 'refund_failed'],
      default: 'not_applicable', // demo-mode bookings never move real money, so this is the correct resting state for them
    },
  },
  { timestamps: true }
);

// Only one *active* (non-cancelled) booking per listing — re-booking after a
// cancellation is allowed, simultaneous double-booking is not.
courierBookingSchema.index(
  { listing: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: 'cancelled' } } }
);

module.exports = mongoose.model('CourierBooking', courierBookingSchema);
