const mongoose = require('mongoose');

/**
 * A suspended account can't log in to do anything else in the app, so an
 * appeal has to be reachable WITHOUT a JWT — identified by the email on the
 * account instead. Kept separate from Report (which is about one party
 * reporting another) since this is the opposite direction: the *suspended*
 * user asking an admin to reconsider.
 */
const appealSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, required: true, trim: true, lowercase: true },
    message: { type: String, trim: true, maxlength: 1000, required: true },

    status: { type: String, enum: ['open', 'reviewed'], default: 'open' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    // What the admin actually did: reinstated the account, or looked at it
    // and decided the suspension stands.
    outcome: { type: String, enum: ['reinstated', 'upheld'], default: null },
  },
  { timestamps: true }
);

appealSchema.index({ status: 1, createdAt: -1 });
appealSchema.index({ user: 1 });

module.exports = mongoose.model('Appeal', appealSchema);
