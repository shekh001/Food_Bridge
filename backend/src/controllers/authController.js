const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../utils/email');
const { UPLOAD_DIR, storedValueFor, isCloudReference, cloudDeliveryUrl, cleanupUploadedFile } = require('../middleware/upload');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// Generates a verification token for `user`, saves its hash on the record,
// and sends (or, in demo mode, returns) the verification link. Shared by
// registration and the "resend" endpoint so both stay in sync.
async function issueVerificationEmail(user) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  user.emailVerificationTokenHash = hashToken(rawToken);
  user.emailVerificationExpires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
  await user.save();

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const verifyUrl = `${clientUrl}/verify-email/${rawToken}`;
  const { sent } = await sendVerificationEmail({ to: user.email, verifyUrl });
  return { sent, verifyUrl };
}

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function sanitize(user) {
  const obj = user.toObject();
  delete obj.passwordHash;
  delete obj.resetPasswordTokenHash;
  delete obj.resetPasswordExpires;
  delete obj.emailVerificationTokenHash;
  delete obj.emailVerificationExpires;
  return obj;
}

exports.register = async (req, res) => {
  try {
    // eslint-disable-next-line prefer-const
    let { name, email, password, role, orgName, orgType, phone, address, location, darpanId, dailyCapacityKg, businessRegNumber, proofType } = req.body;

    // When this request comes in as multipart/form-data (donor/NGO signups
    // with a verification-doc file attached), `location` arrives as a JSON
    // string rather than a nested object, since multipart fields are flat
    // strings.
    if (typeof location === 'string') {
      try {
        location = JSON.parse(location);
      } catch (err) {
        location = null;
      }
    }

    if (!name || !email || !password || !role || !orgName || !location) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // SECURITY: public self-registration can only ever create 'donor' or 'ngo'
    // accounts. 'admin' is deliberately excluded here — even though the
    // frontend UI never shows that option, the API must not trust the
    // client's word for it, or anyone with curl/Postman could hand
    // themselves platform-admin access. Admin accounts are created only via
    // the seed script or directly by an existing admin (see promoteToAdmin
    // below), never through this public endpoint.
    if (!['donor', 'ngo'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // TRUST & SAFETY: signup used to be trust-based for both roles — anyone
    // could type in any name/Darpan ID with nothing to back it up, and a
    // donor was auto-verified outright. Both donor and NGO accounts now
    // require an actual document that an admin reviews before the account
    // is trusted — being able to click an emailed link only proves someone
    // controls that inbox, not that the business (or person) is real.
    //
    // For donors specifically, that document does NOT have to be a formal
    // business licence — a small dhaba, home cook, or someone with surplus
    // food from a family event is just as real and just as welcome, even
    // without FSSAI/GST/shop-licence paperwork. A personal government ID
    // (Aadhaar/Voter ID/driving licence) is an equally valid alternative:
    // it still ties the account to one real, traceable, identifiable
    // person, which is the actual goal — not gatekeeping by paperwork type.
    if (['ngo', 'donor'].includes(role) && !req.file) {
      return res.status(400).json({
        message: 'Please upload a verification document (PDF, JPG, PNG, or WEBP) — a business licence, or for smaller/informal setups, a personal government ID works too.',
      });
    }
    const allowedProofTypes = ['business_licence', 'government_id', 'other'];
    if (role === 'donor' && proofType && !allowedProofTypes.includes(proofType)) {
      return res.status(400).json({ message: 'Invalid proof type' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      // Signup failed after a file was already uploaded — clean it up
      // rather than leaving an orphaned upload behind (works whether it
      // landed on local disk or Cloudinary).
      cleanupUploadedFile(req.file, { isPrivate: true });
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role,
      orgName,
      orgType,
      phone,
      address,
      location,
      darpanId: role === 'ngo' ? darpanId : undefined,
      businessRegNumber: role === 'donor' ? businessRegNumber : undefined,
      proofType: role === 'donor' ? (proofType || 'other') : undefined,
      verificationDoc: req.file ? storedValueFor(req.file) : undefined,
      dailyCapacityKg: role === 'ngo' && dailyCapacityKg ? Number(dailyCapacityKg) : undefined,
    });

    // Donors ALSO need to confirm they control the email they signed up
    // with — a lighter, self-service layer on top of (not instead of) the
    // document an admin reviews. It doesn't grant `verified` by itself
    // anymore; it only flips `emailVerified`, which is necessary but not
    // sufficient to post — see the User schema comment for why.
    let emailSent = false;
    let devVerifyUrl;
    if (role === 'donor') {
      const { sent, verifyUrl } = await issueVerificationEmail(user);
      emailSent = sent;
      if (!sent) devVerifyUrl = verifyUrl; // demo mode — no SMTP configured
    }

    const token = signToken(user);
    res.status(201).json({
      token,
      user: sanitize(user),
      ...(role === 'donor' ? { emailVerificationSent: emailSent, devVerifyUrl } : {}),
    });
  } catch (err) {
    cleanupUploadedFile(req.file, { isPrivate: true });
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/verification-doc — lets an NGO whose account already exists
// (created before this upload flow, or whose earlier doc was rejected) submit
// or replace their proof document without re-registering from scratch.
exports.uploadVerificationDoc = async (req, res) => {
  try {
    if (!['ngo', 'donor'].includes(req.user.role)) {
      cleanupUploadedFile(req.file, { isPrivate: true });
      return res.status(403).json({ message: 'Only donor and NGO accounts need a verification document' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = await User.findById(req.user.id);
    const oldDoc = user.verificationDoc;
    user.verificationDoc = storedValueFor(req.file);
    // A re-submitted document should go back through manual review rather
    // than silently keeping whatever verified status the account had.
    user.verified = false;
    await user.save();

    if (oldDoc) {
      if (isCloudReference(oldDoc)) {
        cleanupUploadedFile({ filename: oldDoc.split(':')[2], resource_type: oldDoc.split(':')[1] }, { isPrivate: true });
      } else {
        fs.unlink(path.join(UPLOAD_DIR, oldDoc), () => {});
      }
    }

    res.json({ user: sanitize(user) });
  } catch (err) {
    cleanupUploadedFile(req.file, { isPrivate: true });
    res.status(500).json({ message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ message: 'Invalid email or password' });

    if (user.suspended) {
      return res.status(403).json({
        suspended: true,
        message: user.suspendedReason
          ? `This account has been suspended: ${user.suspendedReason}`
          : 'This account has been suspended. Contact support if you believe this is a mistake.',
      });
    }

    const token = signToken(user);
    res.json({ token, user: sanitize(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.me = async (req, res) => {
  res.json({ user: req.user });
};

// PATCH /api/auth/me — self-service profile edits. Deliberately a small,
// explicit whitelist rather than accepting the whole body: fields like role,
// verified, or email must never be changeable this way (that's what the
// admin dashboard / re-registration / re-verification flows are for).
exports.updateMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { phone, address, dailyCapacityKg } = req.body;

    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address;

    // dailyCapacityKg feeds the matching engine's quantity-fit score for
    // this NGO — without it, every match silently falls back to a neutral
    // default and "quantity needs" never actually factors into ranking.
    if (dailyCapacityKg !== undefined) {
      if (user.role !== 'ngo') {
        return res.status(400).json({ message: 'Only NGO accounts have a daily capacity' });
      }
      const parsed = dailyCapacityKg === null || dailyCapacityKg === '' ? null : Number(dailyCapacityKg);
      if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
        return res.status(400).json({ message: 'Daily capacity must be a positive number' });
      }
      user.dailyCapacityKg = parsed;
    }

    await user.save();
    res.json({ user: sanitize(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/forgot-password
// Always responds with the same generic message whether or not the email
// matches an account — this stops the endpoint being used to check which
// emails have accounts registered ("email enumeration").
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const genericMessage = "If an account exists for that email, we've sent a link to reset the password.";
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.json({ message: genericMessage });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordTokenHash = hashToken(rawToken);
    user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password/${rawToken}`;

    const { sent } = await sendPasswordResetEmail({ to: user.email, resetUrl });

    if (sent) {
      return res.json({ message: genericMessage });
    }

    // Demo mode — no SMTP configured. Hand the link straight back so the
    // flow is still fully testable without a mail server.
    return res.json({
      message: genericMessage,
      demoMode: true,
      note: 'Email sending is not configured on this server yet, so the reset link is shown here instead.',
      resetUrl,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/reset-password/:token
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const tokenHash = hashToken(token);
    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    }).select('+resetPasswordTokenHash +resetPasswordExpires');

    if (!user) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    const jwtToken = signToken(user);
    res.json({ token: jwtToken, user: sanitize(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/verify-email/:token
// POST /api/auth/verify-email/:token
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const tokenHash = hashToken(token);
    const user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpires: { $gt: new Date() },
    }).select('+emailVerificationTokenHash +emailVerificationExpires');

    if (!user) {
      return res.status(400).json({ message: 'This verification link is invalid or has expired.' });
    }

    // This only confirms control of the inbox — it does NOT grant `verified`
    // (posting access). An admin still needs to review the uploaded
    // registration document; see the User schema comment for why both
    // checks exist.
    user.emailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpires = null;
    await user.save();

    res.json({ user: sanitize(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/resend-verification  (logged in, donor, not yet email-verified)
exports.resendVerification = async (req, res) => {
  try {
    if (req.user.role !== 'donor') {
      return res.status(400).json({ message: 'Only donor accounts need email verification' });
    }
    if (req.user.emailVerified) {
      return res.status(400).json({ message: 'This email is already verified' });
    }

    const user = await User.findById(req.user.id);
    const { sent, verifyUrl } = await issueVerificationEmail(user);

    res.json({
      message: sent ? 'Verification email sent.' : 'Email is not configured on this server yet — use the link below.',
      emailVerificationSent: sent,
      ...(sent ? {} : { devVerifyUrl: verifyUrl }),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
