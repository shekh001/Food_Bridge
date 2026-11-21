const express = require('express');
const {
  createOrder,
  confirmDemoBooking,
  verifyAndBook,
  myBookings,
  getForListing,
  cancelBooking,
} = require('../controllers/courierController');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/:listingId/create-order', requireRole('ngo'), createOrder);
router.post('/:listingId/confirm-demo', requireRole('ngo'), confirmDemoBooking);
router.post('/:listingId/verify', requireRole('ngo'), verifyAndBook);
router.get('/mine', requireRole('ngo'), myBookings);
router.get('/:listingId', getForListing); // donor or ngo party on that listing
router.patch('/:id/cancel', requireRole('ngo'), cancelBooking);

module.exports = router;
