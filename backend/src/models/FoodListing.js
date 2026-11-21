const mongoose = require('mongoose');

const STATUS_FLOW = ['posted', 'claimed', 'picked_up', 'delivered'];

const foodListingSchema = new mongoose.Schema(
  {
    donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    foodType: { type: String, required: true, trim: true }, // e.g. "Cooked meals", "Packaged bread"
    description: { type: String, trim: true },
    // Optional photo of the food itself. Stored as a filename on disk under
    // uploads/listing-photos — never served statically, only through the
    // /api/listings/:id/photo/:filename route (same "logged-in users only"
    // gate as the rest of the listings API, not a privacy concern like
    // verification docs or report evidence, just kept consistent).
    photo: { type: String, default: null },
    quantityKg: { type: Number, required: true, min: 0.1 },
    servingsEstimate: { type: Number }, // auto-computed from quantityKg

    expiryAt: { type: Date, required: true }, // time-to-expiry drives urgency
    pickupLocation: {
      address: { type: String, required: true },
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },

    status: {
      type: String,
      enum: ['posted', 'claimed', 'picked_up', 'delivered', 'expired', 'cancelled'],
      default: 'posted',
    },

    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    claimedAt: { type: Date, default: null },
    pickedUpAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },

    // Live GPS position of whoever is carrying the food (the claiming NGO /
    // volunteer), broadcast over the socket while status is claimed or
    // picked_up. Persisted too, so a page refresh still shows the last
    // known position instead of an empty map.
    liveLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },

    // Snapshot of matched candidate NGOs at post-time, ranked by score (for transparency/audit)
    matchedCandidates: [
      {
        ngo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        distanceKm: Number,
        urgencyScore: Number,
        totalScore: Number,
      },
    ],

    notes: { type: String, trim: true }, // dispute / cancellation reason etc.
  },
  { timestamps: true }
);

foodListingSchema.index({ status: 1, expiryAt: 1 });
foodListingSchema.index({ 'pickupLocation.lat': 1, 'pickupLocation.lng': 1 });

// Rough conversion: 1kg of surplus food ~ 2.5 meals (standard food-bank estimate)
foodListingSchema.pre('save', function (next) {
  if (this.isModified('quantityKg')) {
    this.servingsEstimate = Math.round(this.quantityKg * 2.5);
  }
  next();
});

foodListingSchema.statics.STATUS_FLOW = STATUS_FLOW;

module.exports = mongoose.model('FoodListing', foodListingSchema);
