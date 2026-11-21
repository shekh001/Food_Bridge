const path = require('path');
const User = require('../models/User');
const FoodListing = require('../models/FoodListing');
const { UPLOAD_DIR, cloudDeliveryUrl } = require('../middleware/upload');

// GET /api/admin/verifications/pending
// Donors and NGOs both need a human to check their proof document before
// they're trusted on the platform — a donor claiming to be "Taj Hotel" with
// zero verification could waste NGOs' time (or worse, send them to a fake
// pickup address), so this now covers both roles, not just NGOs.
exports.pendingVerifications = async (req, res) => {
  const pending = await User.find({ role: { $in: ['ngo', 'donor'] }, verified: false }).select('-passwordHash');
  res.json({ pending });
};

// PATCH /api/admin/verifications/:id/verify
exports.verifyUser = async (req, res) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: { $in: ['ngo', 'donor'] } },
    { verified: true },
    { new: true }
  ).select('-passwordHash');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user });
};

// GET /api/admin/verifications/:id/document — streams the donor's or NGO's
// uploaded proof document. Gated behind protect + requireRole('admin') at
// the router level, and the filename is looked up from the DB record rather
// than trusted from the URL, so this can't be used to read arbitrary files
// off disk.
exports.verificationDoc = async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: { $in: ['ngo', 'donor'] } });
  if (!user || !user.verificationDoc) {
    return res.status(404).json({ message: 'No verification document on file for this account' });
  }

  const cloudUrl = cloudDeliveryUrl(user.verificationDoc, { isPrivate: true });
  if (cloudUrl) return res.redirect(cloudUrl);

  const filePath = path.join(UPLOAD_DIR, user.verificationDoc);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ message: 'Document file could not be found' });
    }
  });
};

// GET /api/admin/disputes  -> cancelled listings or listings stuck in claimed/picked_up past expiry
exports.disputes = async (req, res) => {
  const stuck = await FoodListing.find({
    status: { $in: ['claimed', 'picked_up'] },
    expiryAt: { $lt: new Date() },
  })
    .populate('donor', 'orgName')
    .populate('claimedBy', 'orgName');

  const cancelled = await FoodListing.find({ status: 'cancelled' })
    .populate('donor', 'orgName')
    .populate('claimedBy', 'orgName');

  res.json({ stuck, cancelled });
};

// GET /api/admin/users
exports.allUsers = async (req, res) => {
  const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
  res.json({ users });
};

// PATCH /api/admin/users/:id/promote
// The only way a second/third admin account gets created after the initial
// seeded one — requires an existing admin's token (route is already gated
// by requireRole('admin')), so it can't be reached by a plain donor/NGO
// account or an unauthenticated request. Use this to add trusted ops staff,
// not as a general-purpose role editor.
exports.promoteToAdmin = async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'User not found' });
  if (target.role === 'admin') return res.status(409).json({ message: 'User is already an admin' });

  target.role = 'admin';
  target.verified = true;
  await target.save();

  const user = target.toObject();
  delete user.passwordHash;
  res.json({ user });
};
