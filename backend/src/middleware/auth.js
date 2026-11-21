const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;
    if (!token) return res.status(401).json({ message: 'Not authorized, no token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user) return res.status(401).json({ message: 'User no longer exists' });
    // Defense in depth: a token issued before an admin suspends the account
    // stays cryptographically valid until it expires — this check is what
    // actually cuts off access the moment suspension happens, not just at
    // the next login.
    if (user.suspended) {
      return res.status(403).json({
        suspended: true,
        message: user.suspendedReason
          ? `This account has been suspended: ${user.suspendedReason}`
          : 'This account has been suspended.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: `This action requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

module.exports = { protect, requireRole };
