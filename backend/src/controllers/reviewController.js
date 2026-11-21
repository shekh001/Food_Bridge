const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
const FoodListing = require('../models/FoodListing');

async function recomputeRating(userId) {
  const [agg] = await Review.aggregate([
    { $match: { to: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: '$to', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await User.findByIdAndUpdate(userId, {
    rating: agg ? Math.round(agg.avg * 10) / 10 : 5,
    reviewCount: agg ? agg.count : 0,
  });
}

// POST /api/reviews  body: { listingId, rating, comment }
exports.submitReview = async (req, res) => {
  try {
    const { listingId, rating, comment } = req.body;
    if (!listingId || !rating) return res.status(400).json({ message: 'listingId and rating are required' });
    if (rating < 1 || rating > 5) return res.status(400).json({ message: 'rating must be between 1 and 5' });

    const listing = await FoodListing.findById(listingId);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    if (listing.status !== 'delivered') {
      return res.status(409).json({ message: 'Can only review a listing after it has been delivered' });
    }

    const isDonor = String(listing.donor) === String(req.user._id);
    const isClaimant = listing.claimedBy && String(listing.claimedBy) === String(req.user._id);
    if (!isDonor && !isClaimant) {
      return res.status(403).json({ message: 'Only the donor or the claiming NGO can review this listing' });
    }

    const to = isDonor ? listing.claimedBy : listing.donor;
    if (!to) return res.status(409).json({ message: 'Nothing to review — this listing has no claimant' });

    const review = await Review.create({ listing: listingId, from: req.user._id, to, rating, comment });
    await recomputeRating(to);

    res.status(201).json({ review });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'You already reviewed this listing' });
    res.status(500).json({ message: err.message });
  }
};

// GET /api/reviews/user/:userId
exports.getReviewsForUser = async (req, res) => {
  try {
    const reviews = await Review.find({ to: req.params.userId })
      .populate('from', 'orgName orgType')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/reviews/listing/:listingId/mine — has the current user already reviewed this listing?
exports.myReviewForListing = async (req, res) => {
  try {
    const review = await Review.findOne({ listing: req.params.listingId, from: req.user._id });
    res.json({ review: review || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
