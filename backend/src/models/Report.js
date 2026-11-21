const mongoose = require('mongoose');

/**
 * A report is filed by one party about the other, tied to a specific
 * listing they were both involved in (as donor and claimant). This is the
 * "something actually went wrong" channel — unlike the admin dashboard's
 * automatic "stuck past expiry" detection, a report captures WHAT happened
 * in the reporter's own words and puts it in front of an admin as an
 * actionable item, whether or not the listing itself ever technically got
 * "stuck".
 */
const REASONS = ['no_show', 'fraud_or_fake', 'unsafe_or_bad_quality', 'unresponsive', 'other'];

const reportSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodListing', required: true },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: REASONS, required: true },
    description: { type: String, trim: true, maxlength: 1000, required: true },
    // Optional photos/docs the reporter attaches as proof (e.g. a photo of
    // spoiled food, a screenshot of an unanswered chat). Stored as filenames
    // on disk under uploads/report-evidence — never served statically, only
    // through the protected /api/reports/:id/evidence/:filename route.
    evidence: { type: [String], default: [] },

    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNotes: { type: String, trim: true, maxlength: 1000, default: null },
    // What the admin actually did about it — kept for audit/history even
    // after the report is resolved.
    actionTaken: { type: String, enum: ['none', 'warned', 'suspended'], default: 'none' },
  },
  { timestamps: true }
);

// One report per (listing, reporter) — stops the same person spamming
// duplicate reports about the same transaction; they can still describe
// everything in one description field.
reportSchema.index({ listing: 1, reporter: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reportedUser: 1 });

reportSchema.statics.REASONS = REASONS;

module.exports = mongoose.model('Report', reportSchema);
