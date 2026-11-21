const path = require('path');
const fs = require('fs');
const Report = require('../models/Report');
const FoodListing = require('../models/FoodListing');
const User = require('../models/User');
const { sendPushToUser } = require('../utils/push');
const { EVIDENCE_DIR, storedValueFor, isCloudReference, cloudDeliveryUrl, cleanupUploadedFile } = require('../middleware/upload');

function notify(userId, payload) {
  sendPushToUser(userId, payload).catch(() => {});
}

// Best-effort cleanup for evidence files if report creation fails partway
// through (e.g. the unique-index duplicate-report error) — otherwise a
// rejected upload just orphans files forever (on disk, or on Cloudinary).
function cleanupFiles(files) {
  (files || []).forEach((f) => cleanupUploadedFile(f, { isPrivate: true }));
}

// POST /api/reports  body: { listingId, reason, description }
// Either party on a listing (the donor, or the NGO that claimed it) can
// report the other. This is deliberately scoped to a specific listing —
// you can only report someone you actually transacted with, not any user
// on the platform, which keeps this from becoming a harassment vector.
exports.createReport = async (req, res) => {
  try {
    const { listingId, reason, description } = req.body;
    if (!listingId || !reason || !description?.trim()) {
      cleanupFiles(req.files);
      return res.status(400).json({ message: 'listingId, reason, and description are all required' });
    }
    if (!Report.REASONS.includes(reason)) {
      cleanupFiles(req.files);
      return res.status(400).json({ message: 'Invalid reason' });
    }

    const listing = await FoodListing.findById(listingId);
    if (!listing) {
      cleanupFiles(req.files);
      return res.status(404).json({ message: 'Listing not found' });
    }

    const isDonor = String(listing.donor) === String(req.user._id);
    const isClaimant = listing.claimedBy && String(listing.claimedBy) === String(req.user._id);
    if (!isDonor && !isClaimant) {
      cleanupFiles(req.files);
      return res.status(403).json({ message: 'You can only report a listing you were involved in' });
    }

    const reportedUser = isDonor ? listing.claimedBy : listing.donor;
    if (!reportedUser) {
      cleanupFiles(req.files);
      return res.status(400).json({ message: 'This listing was never claimed — nobody to report' });
    }

    const evidence = (req.files || []).map((f) => storedValueFor(f));

    let report;
    try {
      report = await Report.create({
        listing: listing._id,
        reporter: req.user._id,
        reportedUser,
        reason,
        description: description.trim(),
        evidence,
      });
    } catch (err) {
      cleanupFiles(req.files);
      if (err.code === 11000) {
        return res.status(409).json({ message: "You've already reported this listing — an admin will review it." });
      }
      throw err;
    }

    res.status(201).json({ report });
  } catch (err) {
    cleanupFiles(req.files);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/reports/:id/evidence/:filename — streams one evidence file.
// Gated to the three people who legitimately have a reason to see it: the
// admin reviewing the case, the reporter who submitted it, and the person
// it was submitted about (so they can see what they're accused of, same
// fairness principle as resolutionNotes being visible to them).
exports.getReportEvidence = async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ message: 'Report not found' });

  const isAdmin = req.user.role === 'admin';
  const isReporter = String(report.reporter) === String(req.user._id);
  const isReportedUser = String(report.reportedUser) === String(req.user._id);
  if (!isAdmin && !isReporter && !isReportedUser) {
    return res.status(403).json({ message: 'Not authorized to view this file' });
  }

  // Filename is looked up from the DB record's evidence list rather than
  // trusted from the URL — same anti-path-traversal pattern as
  // verificationDoc in adminController. (The frontend percent-encodes this
  // value since a Cloudinary reference contains slashes; Express decodes it
  // back before it reaches req.params.)
  const filename = isCloudReference(req.params.filename) ? req.params.filename : path.basename(req.params.filename);
  if (!report.evidence.includes(filename)) {
    return res.status(404).json({ message: 'File not found on this report' });
  }

  const cloudUrl = cloudDeliveryUrl(filename, { isPrivate: true });
  if (cloudUrl) return res.redirect(cloudUrl);

  const filePath = path.join(EVIDENCE_DIR, filename);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ message: 'File could not be found' });
    }
  });
};

// GET /api/reports/mine — reports the logged-in user has filed, so they can
// see the status of something they reported instead of it disappearing
// into a black box.
exports.myReports = async (req, res) => {
  const reports = await Report.find({ reporter: req.user._id })
    .populate('listing', 'foodType status')
    .populate('reportedUser', 'orgName role')
    .sort({ createdAt: -1 });
  res.json({ reports });
};

// GET /api/admin/reports?status=open|resolved
exports.adminListReports = async (req, res) => {
  const filter = {};
  if (['open', 'resolved'].includes(req.query.status)) filter.status = req.query.status;
  const reports = await Report.find(filter)
    .populate('listing', 'foodType status quantityKg')
    .populate('reporter', 'orgName role email')
    .populate('reportedUser', 'orgName role email suspended')
    .sort({ status: 1, createdAt: -1 }); // open first

  // Total report count per reportedUser, so an admin reviewing one report
  // can immediately see "this is the 4th time someone's flagged this
  // account" instead of it looking like an isolated first-time incident.
  const counts = await Report.aggregate([
    { $group: { _id: '$reportedUser', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  const withCounts = reports.map((r) => {
    const obj = r.toObject();
    obj.reportedUserTotalReports = countMap.get(String(r.reportedUser?._id)) || 0;
    return obj;
  });

  res.json({ reports: withCounts });
};

// PATCH /api/admin/reports/:id/resolve  body: { action: 'none'|'warned'|'suspended', notes }
exports.resolveReport = async (req, res) => {
  try {
    const { action, notes } = req.body;
    const allowedActions = ['none', 'warned', 'suspended'];
    if (action && !allowedActions.includes(action)) {
      return res.status(400).json({ message: 'Invalid action' });
    }

    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    report.status = 'resolved';
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
    report.resolutionNotes = notes || null;
    report.actionTaken = action || 'none';
    await report.save();

    if (action === 'suspended') {
      await User.findByIdAndUpdate(report.reportedUser, {
        suspended: true,
        suspendedReason: notes || 'Repeated or serious reports from the platform community.',
      });
      notify(report.reportedUser, {
        title: 'Your account has been suspended',
        body: notes || 'An admin suspended your account after reviewing a report.',
      });
    } else if (action === 'warned') {
      notify(report.reportedUser, {
        title: 'A report was filed against your account',
        body: notes || 'An admin reviewed a report about one of your listings. Please review platform guidelines.',
      });
    }

    // The reporter filed this not knowing what would happen to it — without
    // this, the only way they'd ever find out is by manually checking
    // GET /reports/mine. A closed-loop report needs to tell the person who
    // opened it how it was closed, regardless of what the outcome was.
    const reporterMessages = {
      none: 'An admin reviewed your report and no action was taken.',
      warned: 'An admin reviewed your report and issued a warning to the account.',
      suspended: 'An admin reviewed your report and suspended the account.',
    };
    notify(report.reporter, {
      title: 'Your report has been reviewed',
      body: reporterMessages[report.actionTaken] || reporterMessages.none,
    });

    res.json({ report });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/admin/users/:id/suspend  body: { suspended: boolean, reason }
// A direct lever for admins independent of the report flow — e.g. lifting a
// suspension, or suspending someone before a formal report exists.
exports.setSuspended = async (req, res) => {
  try {
    const { suspended, reason } = req.body;
    if (typeof suspended !== 'boolean') {
      return res.status(400).json({ message: 'suspended (boolean) is required' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Admin accounts cannot be suspended from here' });
    }

    user.suspended = suspended;
    user.suspendedReason = suspended ? (reason || null) : null;
    await user.save();

    res.json({ user: { _id: user._id, orgName: user.orgName, suspended: user.suspended, suspendedReason: user.suspendedReason } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
