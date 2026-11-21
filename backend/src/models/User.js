const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['donor', 'ngo', 'admin'], required: true },

    // Org-level info (restaurant/hotel/caterer for donors, shelter/NGO for recipients).
    // For an 'individual' donor (household surplus, home cooks, family-event
    // leftovers), orgName is auto-filled from `name` on the client — there's
    // no separate organization, but the field stays required/non-null so
    // every other query and admin view that reads orgName keeps working
    // unchanged for this category too.
    orgName: { type: String, required: true, trim: true },
    orgType: {
      type: String,
      enum: ['restaurant', 'hotel', 'caterer', 'grocery_store', 'individual', 'shelter', 'ngo', 'community_kitchen', 'other'],
      default: 'other',
    },
    phone: { type: String, trim: true },

    address: { type: String, trim: true },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },

    // Both donor and NGO accounts start unverified.
    //  - `verified` is the ONE gate that actually unlocks posting/claiming —
    //    it's only ever set true by an admin approving the uploaded
    //    registration document (verificationDoc), for BOTH roles now. A
    //    business claiming to be "Hotel Sunrise" needs a human to glance at
    //    real proof (FSSAI licence, GST certificate, shop licence, etc.)
    //    before the platform trusts them, same as an NGO's Darpan proof.
    //  - `emailVerified` is a separate, lighter, self-service check — proves
    //    the donor controls the email they signed up with. It's necessary
    //    but NOT sufficient on its own: it stops zero-effort throwaway
    //    accounts, but a determined bad actor can still fake an email, so it
    //    is layered on top of (not instead of) document review, not a
    //    substitute for it.
    // Admin accounts, created only via the controlled create-admin script
    // rather than public signup, are the only role verified by default.
    verified: { type: Boolean, default: function () { return this.role === 'admin'; } },
    emailVerified: { type: Boolean, default: function () { return this.role !== 'donor'; } },
    verificationDoc: { type: String, default: null }, // optional url/reference to registration proof

    // NGO Darpan registration ID (NITI Aayog NGO-Darpan) — a stronger, checkable
    // trust signal than admin-eyeballed docs. Presence doesn't auto-verify;
    // admins still confirm it during manual verification, but it's shown to
    // donors and recorded for audit.
    darpanId: { type: String, trim: true, default: null },

    // Donor-only equivalent of darpanId — an FSSAI licence, GST number, or
    // shop/establishment registration number. Same role: a checkable trust
    // signal shown alongside the document, not something that auto-verifies
    // on its own.
    businessRegNumber: { type: String, trim: true, default: null },

    // What kind of document a donor uploaded. Formal businesses (a hotel,
    // a registered restaurant) will have an FSSAI/GST/shop licence — but
    // plenty of genuine small/informal donors (a home cook, a small dhaba,
    // someone with surplus food from a family event) never have any of
    // that paperwork despite being completely real. Rather than shutting
    // them out, a personal government ID (Aadhaar/Voter ID/driving
    // licence) is an equally valid alternative: it still ties the account
    // to one real, traceable, legally-identifiable person, which is the
    // actual thing verification is trying to establish — "is a real
    // person accountable for this account" — not "is this specifically a
    // registered business."
    proofType: { type: String, enum: ['business_licence', 'government_id', 'other'], default: null },

    // NGO-only: rough daily intake capacity, used by the matching engine's quantity-fit score
    dailyCapacityKg: { type: Number, default: null },

    // Set by an admin resolving a report against this account (see Report
    // model). A suspended account keeps its data and history but can't log
    // in, post, claim, or release anything until an admin lifts it — the
    // actual consequence side of the report/dispute system, not just a
    // label.
    suspended: { type: Boolean, default: false },
    suspendedReason: { type: String, trim: true, default: null },

    // Password reset: only a SHA-256 hash of the raw token is ever stored, so a
    // database read alone can't be used to reset someone's password (same
    // reasoning as storing passwordHash instead of the password itself). The
    // raw token only ever exists in the emailed/returned link, never at rest.
    resetPasswordTokenHash: { type: String, default: null, select: false },
    resetPasswordExpires: { type: Date, default: null, select: false },

    // Donor email verification (same hashed-token pattern as password reset
    // — see authController for why we never store the raw token).
    emailVerificationTokenHash: { type: String, default: null, select: false },
    emailVerificationExpires: { type: Date, default: null, select: false },

    // Donor-only subscription tier. 'pro' unlocks consolidated/bulk CSR reports
    // (single-donation certificates stay free for everyone — see certificateController).
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
    planUpgradedAt: { type: Date, default: null },

    // Reputation, built from Review documents rather than a single mutable field.
    // Starts at 5 (no reviews yet) and becomes a true average once reviews exist.
    rating: { type: Number, default: 5, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    totalDonationsKg: { type: Number, default: 0 }, // donors
    totalReceivedKg: { type: Number, default: 0 }, // ngos
  },
  { timestamps: true }
);

userSchema.index({ 'location.lat': 1, 'location.lng': 1 });

module.exports = mongoose.model('User', userSchema);
