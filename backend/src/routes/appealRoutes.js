const express = require('express');
const rateLimit = require('express-rate-limit');
const { submitAppeal } = require('../controllers/appealController');

const router = express.Router();

// Public + unauthenticated, so it needs its own abuse guard — same shape as
// the auth rate limiter, just scoped to this one route.
const appealLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many appeal submissions — please wait a few minutes and try again.' },
});

router.post('/', appealLimiter, submitAppeal);

module.exports = router;
