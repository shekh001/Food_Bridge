const express = require('express');
const { protect } = require('../middleware/auth');
const { submitReview, getReviewsForUser, myReviewForListing } = require('../controllers/reviewController');

const router = express.Router();

router.post('/', protect, submitReview);
router.get('/user/:userId', getReviewsForUser);
router.get('/listing/:listingId/mine', protect, myReviewForListing);

module.exports = router;
