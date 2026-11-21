const mongoose = require('mongoose');

/**
 * A review is left by one party of a *delivered* listing about the other
 * (donor -> NGO, or NGO -> donor). One review per direction per listing.
 */
const reviewSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodListing', required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

// One review per (listing, from) pair — can't review the same listing twice.
reviewSchema.index({ listing: 1, from: 1 }, { unique: true });
reviewSchema.index({ to: 1 });

module.exports = mongoose.model('Review', reviewSchema);
