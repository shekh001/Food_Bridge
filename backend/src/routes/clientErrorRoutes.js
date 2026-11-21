const express = require('express');
const { reportError } = require('../utils/monitor');

const router = express.Router();

// POST /api/client-error — the frontend's ErrorBoundary beacons here on crash.
// Public (no auth) since a broken login state shouldn't block error reporting;
// intentionally tiny payload, no PII beyond what the browser sends anyway.
router.post('/', (req, res) => {
  const { message, stack, url, userAgent } = req.body || {};
  reportError(new Error(message || 'Unknown frontend error'), {
    source: 'frontend',
    stack,
    url,
    userAgent,
  });
  res.status(204).end();
});

module.exports = router;
