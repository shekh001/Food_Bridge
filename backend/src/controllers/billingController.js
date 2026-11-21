const crypto = require('crypto');
const User = require('../models/User');

const PRO_PRICE_INR = 999; // per month, shown to the user — keep in sync with frontend copy

function razorpayConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

// GET /api/billing/status
exports.getStatus = async (req, res) => {
  res.json({
    plan: req.user.plan,
    planUpgradedAt: req.user.planUpgradedAt,
    priceInr: PRO_PRICE_INR,
    liveMode: razorpayConfigured(), // false = demo/simulated upgrade, no real charge happens
  });
};

// POST /api/billing/create-order  (donor only)
// Real mode: creates an actual Razorpay order (test-mode keys still don't move real money).
// Demo mode (no keys set): returns a fake order id — the frontend shows this is a simulated
// payment, and /confirm-demo-upgrade below flips the plan without any gateway involved at all.
exports.createOrder = async (req, res) => {
  try {
    if (req.user.role !== 'donor') return res.status(403).json({ message: 'Only donor accounts can upgrade' });
    if (req.user.plan === 'pro') return res.status(409).json({ message: 'Already on the Pro plan' });

    if (!razorpayConfigured()) {
      return res.json({ demoMode: true, amountInr: PRO_PRICE_INR });
    }

    // eslint-disable-next-line global-require
    const Razorpay = require('razorpay');
    const instance = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const order = await instance.orders.create({
      amount: PRO_PRICE_INR * 100, // paise
      currency: 'INR',
      receipt: `pro-upgrade-${req.user._id}`,
    });

    res.json({ demoMode: false, order, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/billing/verify  body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Only reachable in live mode — verifies Razorpay's HMAC signature before granting Pro.
exports.verifyPayment = async (req, res) => {
  try {
    if (!razorpayConfigured()) return res.status(400).json({ message: 'Not in live payment mode' });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification failed — signature mismatch' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { plan: 'pro', planUpgradedAt: new Date() },
      { new: true }
    ).select('-passwordHash');

    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/billing/confirm-demo-upgrade  (only works when Razorpay keys are NOT set)
// Explicitly simulated — exists so the paid-tier flow is demoable without a live merchant
// account. Clearly labeled as such in the API response and the frontend UI.
exports.confirmDemoUpgrade = async (req, res) => {
  try {
    if (razorpayConfigured()) return res.status(400).json({ message: 'Live payments are configured — use the real checkout flow' });
    if (req.user.role !== 'donor') return res.status(403).json({ message: 'Only donor accounts can upgrade' });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { plan: 'pro', planUpgradedAt: new Date() },
      { new: true }
    ).select('-passwordHash');

    res.json({ user, demoMode: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
