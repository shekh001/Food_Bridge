// Minimal email sender for account-recovery mail.
//
// Follows the same pattern as razorpay/web-push elsewhere in this codebase:
// if the SMTP env vars aren't set, we don't crash or silently pretend to send
// mail — we run in "demo mode" and hand the link straight back in the API
// response so the flow is still fully testable end to end. Once real SMTP
// creds are added to .env, sendPasswordResetEmail switches to actually
// emailing the user with zero code changes elsewhere.
let nodemailer;
try {
  // Optional dependency — only required if EMAIL_HOST etc. are configured.
  // eslint-disable-next-line global-require
  nodemailer = require('nodemailer');
} catch (err) {
  nodemailer = null;
}

function isEmailConfigured() {
  return !!(nodemailer && process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

let transporter = null;
function getTransporter() {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: Number(process.env.EMAIL_PORT) === 465,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  return transporter;
}

/**
 * Sends (or, in demo mode, prepares) a password-reset email.
 * Returns { sent: boolean } — sent=false means the caller should fall back
 * to returning the reset link directly in the API response (demo mode).
 */
async function sendPasswordResetEmail({ to, resetUrl }) {
  const t = getTransporter();
  if (!t) return { sent: false };

  await t.sendMail({
    from: process.env.EMAIL_FROM || 'FoodBridge <no-reply@foodbridge.app>',
    to,
    subject: 'Reset your FoodBridge password',
    text: `We received a request to reset your FoodBridge password.\n\n` +
      `Reset it here (valid for 1 hour): ${resetUrl}\n\n` +
      `If you didn't request this, you can safely ignore this email.`,
    html: `<p>We received a request to reset your FoodBridge password.</p>` +
      `<p><a href="${resetUrl}">Click here to choose a new password</a> (link valid for 1 hour).</p>` +
      `<p>If you didn't request this, you can safely ignore this email.</p>`,
  });
  return { sent: true };
}

/**
 * Sends (or, in demo mode, prepares) a donor email-verification message.
 * Same demo-mode fallback pattern as the password reset email above.
 */
async function sendVerificationEmail({ to, verifyUrl }) {
  const t = getTransporter();
  if (!t) return { sent: false };

  await t.sendMail({
    from: process.env.EMAIL_FROM || 'FoodBridge <no-reply@foodbridge.app>',
    to,
    subject: 'Verify your FoodBridge account',
    text: `Welcome to FoodBridge! Please verify your email to activate your account and start posting surplus food.\n\n` +
      `Verify here (valid for 24 hours): ${verifyUrl}\n\n` +
      `If you didn't create this account, you can safely ignore this email.`,
    html: `<p>Welcome to FoodBridge! Please verify your email to activate your account and start posting surplus food.</p>` +
      `<p><a href="${verifyUrl}">Click here to verify your account</a> (link valid for 24 hours).</p>` +
      `<p>If you didn't create this account, you can safely ignore this email.</p>`,
  });
  return { sent: true };
}

module.exports = { isEmailConfigured, sendPasswordResetEmail, sendVerificationEmail };
