const Appeal = require('../models/Appeal');
const User = require('../models/User');

// POST /api/appeals  body: { email, message }
// Deliberately NOT behind `protect` — a suspended account has no way to get
// a usable token, so this has to be reachable by email alone. We look the
// user up (if they exist) so the admin sees full context, but we don't
// require it to match anything to avoid leaking whether an email is
// registered — the appeal is just recorded either way.
exports.submitAppeal = async (req, res) => {
  try {
    const { email, message } = req.body;
    if (!email?.trim() || !message?.trim()) {
      return res.status(400).json({ message: 'Email and a short message are both required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    const appeal = await Appeal.create({
      user: user?._id || null,
      email: normalizedEmail,
      message: message.trim(),
    });

    res.status(201).json({
      message: "Appeal submitted — an admin will review it. You'll be able to log in again if it's approved.",
      appeal: { _id: appeal._id, createdAt: appeal.createdAt },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/appeals?status=open|reviewed
exports.adminListAppeals = async (req, res) => {
  const filter = {};
  if (['open', 'reviewed'].includes(req.query.status)) filter.status = req.query.status;
  const appeals = await Appeal.find(filter)
    .populate('user', 'orgName role email suspended suspendedReason')
    .sort({ status: 1, createdAt: -1 }); // open first
  res.json({ appeals });
};

// PATCH /api/admin/appeals/:id/resolve  body: { outcome: 'reinstated'|'upheld' }
exports.resolveAppeal = async (req, res) => {
  try {
    const { outcome } = req.body;
    if (!['reinstated', 'upheld'].includes(outcome)) {
      return res.status(400).json({ message: "outcome must be 'reinstated' or 'upheld'" });
    }

    const appeal = await Appeal.findById(req.params.id);
    if (!appeal) return res.status(404).json({ message: 'Appeal not found' });

    appeal.status = 'reviewed';
    appeal.reviewedBy = req.user._id;
    appeal.reviewedAt = new Date();
    appeal.outcome = outcome;
    await appeal.save();

    // Reinstating here is the one place an appeal actually changes account
    // state — lifts the suspension the same way the admin's direct
    // "lift suspension" lever does, just reached from the appeal queue.
    if (outcome === 'reinstated' && appeal.user) {
      await User.findByIdAndUpdate(appeal.user, { suspended: false, suspendedReason: null });
    }

    res.json({ appeal });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
