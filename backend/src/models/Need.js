const mongoose = require('mongoose');

/**
 * The reverse of a FoodListing: an NGO says what it needs instead of a
 * donor saying what it has. Turns the platform into a genuine two-sided
 * marketplace — donors can see actual demand instead of posting blind and
 * hoping someone claims it.
 *
 * "Fulfilled" is set when a donor creates a listing that explicitly
 * responds to this need (see listingController.createListing's
 * `fulfillsNeedId` handling) — not a separate manual step, so the two
 * sides of the marketplace actually connect rather than existing in
 * parallel.
 */
const needSchema = new mongoose.Schema(
  {
    ngo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    foodType: { type: String, required: true, trim: true },
    quantityKg: { type: Number, required: true, min: 1 },
    neededBy: { type: Date, required: true },
    notes: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: ['open', 'fulfilled', 'cancelled'], default: 'open' },
    fulfilledByListing: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodListing', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Need', needSchema);
