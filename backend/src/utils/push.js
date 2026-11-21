const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false; // push simply disabled if keys aren't set
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@foodbridge.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

/**
 * Best-effort browser push to every device a user has subscribed on.
 * Never throws — a failed/expired push subscription is cleaned up silently
 * and must never break the request that triggered it (e.g. claiming a listing).
 */
async function sendPushToUser(userId, { title, body, url }) {
  if (!ensureConfigured()) return;
  const subs = await PushSubscription.find({ user: userId });
  const payload = JSON.stringify({ title, body, url: url || '/' });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          payload
        );
      } catch (err) {
        // 404/410 = subscription expired or the user revoked permission — remove it
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        }
      }
    })
  );
}

module.exports = { sendPushToUser, ensureConfigured };
