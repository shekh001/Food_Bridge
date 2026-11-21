require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const connectDB = require('./config/db');
const { initSocket } = require('./sockets/socketHandler');
const { reportError, Sentry } = require('./utils/monitor');

const authRoutes = require('./routes/authRoutes');
const listingRoutes = require('./routes/listingRoutes');
const adminRoutes = require('./routes/adminRoutes');
const impactRoutes = require('./routes/impactRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const chatRoutes = require('./routes/chatRoutes');
const pushRoutes = require('./routes/pushRoutes');
const routeRoutes = require('./routes/routeRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const billingRoutes = require('./routes/billingRoutes');
const clientErrorRoutes = require('./routes/clientErrorRoutes');
const reportRoutes = require('./routes/reportRoutes');
const appealRoutes = require('./routes/appealRoutes');
const courierRoutes = require('./routes/courierRoutes');
const needRoutes = require('./routes/needRoutes');

// A crash here would otherwise kill the whole Node process silently on some
// hosts. Log it clearly (and report it, if Sentry is configured) before the
// process exits, so "the server just stopped" never happens without a trace.
process.on('uncaughtException', (err) => {
  reportError(err, { fatal: true, type: 'uncaughtException' });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  reportError(reason instanceof Error ? reason : new Error(String(reason)), { fatal: true, type: 'unhandledRejection' });
});

const app = express();
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Render (and most PaaS hosts) put the app behind a reverse proxy, so every
// request arrives from that proxy's internal IP with the real client IP
// only in the X-Forwarded-For header. Without this, express-rate-limit
// either can't tell users apart (everyone shares the proxy's IP, so one
// busy period trips the limiter for ALL users at once) or throws on every
// request in newer versions that validate this setting. `1` = trust exactly
// one hop, matching Render's single load-balancer layer — not a wildcard,
// so a spoofed X-Forwarded-For from a real client still can't be trusted
// past that one legitimate hop.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// Loose global limit (protects against accidental infinite-loop calls / basic abuse)
// plus a stricter one on auth specifically (protects against brute-force login attempts).
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { message: 'Too many attempts — please wait a few minutes and try again.' } });

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'foodbridge-api', time: new Date().toISOString() });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/impact', impactRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/client-error', clientErrorRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/appeals', appealRoutes);
app.use('/api/couriers', courierRoutes);
app.use('/api/needs', needRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  reportError(err, { method: req.method, path: req.originalUrl });
  // Multer file-upload errors (bad type, too large, etc.) are client mistakes,
  // not server failures — surface them as 400 rather than a generic 500.
  const status = err.status || (err.name === 'MulterError' ? 400 : 500);
  res.status(status).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = initSocket(server, CLIENT_URL);
app.set('io', io);

async function start() {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`[foodbridge-api] listening on port ${PORT}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { app, server };
