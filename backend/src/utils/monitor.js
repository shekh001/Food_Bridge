/**
 * Central place for error reporting so the rest of the codebase doesn't
 * need to know whether Sentry is configured or not.
 *
 * No SENTRY_DSN set -> falls back to structured console logging, which
 * Render/Railway/any host captures in its own log viewer for free. This
 * means glitches are always visible somewhere, even with zero paid setup.
 *
 * SENTRY_DSN set -> also reports to Sentry (free tier: 5k events/month),
 * which adds email/Slack alerts, stack traces grouped by root cause, and a
 * dashboard — worth turning on once this is handling real users.
 */
let Sentry = null;
if (process.env.SENTRY_DSN) {
  try {
    // eslint-disable-next-line global-require
    Sentry = require('@sentry/node');
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'production' });
    console.log('[foodbridge-api] Sentry error monitoring enabled');
  } catch (err) {
    console.warn('[foodbridge-api] SENTRY_DSN is set but @sentry/node failed to load — falling back to console logging.', err.message);
  }
}

function reportError(err, context = {}) {
  console.error(`[foodbridge-api] ERROR ${new Date().toISOString()}`, {
    message: err.message,
    stack: err.stack,
    ...context,
  });
  if (Sentry) Sentry.captureException(err, { extra: context });
}

module.exports = { reportError, Sentry };
