const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const FoodListing = require('../models/FoodListing');
const Message = require('../models/Message');

/**
 * Each connected client joins:
 *  - user:<id>   -> for targeted, personal notifications (claim, status update)
 *  - role:<role> -> for broadcast feeds (e.g. "new listing near you" for all NGOs)
 *
 * Chat rooms (listing:<id>) are joined on demand via 'chat:join', after
 * verifying the socket's user is actually the donor or claimant on that
 * listing — chat is scoped to a single pickup coordination, not public.
 */
async function isPartyToListing(userId, listingId) {
  const listing = await FoodListing.findById(listingId).select('donor claimedBy');
  if (!listing) return false;
  return String(listing.donor) === String(userId) || String(listing.claimedBy) === String(userId);
}

/**
 * Only the claiming NGO can broadcast their live position, and only while
 * the handoff is actually in progress (claimed = heading to pickup,
 * picked_up = en route to delivery). Once delivered/cancelled, tracking
 * stops making sense, so we deliberately reject it rather than let a stale
 * marker keep moving on someone's screen.
 */
async function canBroadcastLocation(userId, listingId) {
  const listing = await FoodListing.findById(listingId).select('claimedBy status');
  if (!listing) return false;
  if (String(listing.claimedBy) !== String(userId)) return false;
  return ['claimed', 'picked_up'].includes(listing.status);
}

function initSocket(server, clientUrl) {
  const io = new Server(server, {
    cors: { origin: clientUrl, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(); // allow anonymous (read-only) connections for public impact ticker
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch (err) {
      next(); // invalid token -> treat as anonymous rather than hard-fail the socket
    }
  });

  io.on('connection', (socket) => {
    if (socket.userId) socket.join(`user:${socket.userId}`);
    if (socket.userRole) socket.join(`role:${socket.userRole}`);

    socket.on('chat:join', async (listingId) => {
      if (!socket.userId || !listingId) return;
      const allowed = await isPartyToListing(socket.userId, listingId).catch(() => false);
      if (allowed) socket.join(`listing:${listingId}`);
    });

    socket.on('chat:message', async ({ listingId, text } = {}) => {
      if (!socket.userId || !listingId || !text?.trim()) return;
      const allowed = await isPartyToListing(socket.userId, listingId).catch(() => false);
      if (!allowed) return;

      const message = await Message.create({ listing: listingId, sender: socket.userId, text: text.trim() });
      await message.populate('sender', 'orgName role');
      io.to(`listing:${listingId}`).emit('chat:message', message);
    });

    // Rate-limit per socket so a buggy client can't flood the room / DB —
    // one accepted update every 4 seconds is plenty for a walking/riding
    // volunteer's position to feel "live" without hammering Mongo.
    let lastLocationBroadcast = 0;
    socket.on('location:update', async ({ listingId, lat, lng } = {}) => {
      if (!socket.userId || !listingId) return;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;

      const now = Date.now();
      if (now - lastLocationBroadcast < 4000) return;

      const allowed = await canBroadcastLocation(socket.userId, listingId).catch(() => false);
      if (!allowed) return;

      lastLocationBroadcast = now;
      const updatedAt = new Date();
      await FoodListing.findByIdAndUpdate(listingId, {
        liveLocation: { lat, lng, updatedAt },
      });

      io.to(`listing:${listingId}`).emit('location:update', { listingId, lat, lng, updatedAt });
    });

    socket.on('location:stop', async (listingId) => {
      if (!socket.userId || !listingId) return;
      const allowed = await isPartyToListing(socket.userId, listingId).catch(() => false);
      if (!allowed) return;
      io.to(`listing:${listingId}`).emit('location:stopped', { listingId });
    });

    socket.on('disconnect', () => {
      // no-op: rooms are cleaned up automatically by socket.io
    });
  });

  return io;
}

module.exports = { initSocket };
