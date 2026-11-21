const Message = require('../models/Message');
const FoodListing = require('../models/FoodListing');

// GET /api/chat/:listingId — message history (donor/claimant only)
exports.getMessages = async (req, res) => {
  try {
    const listing = await FoodListing.findById(req.params.listingId).select('donor claimedBy');
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    const isDonor = String(listing.donor) === String(req.user._id);
    const isClaimant = listing.claimedBy && String(listing.claimedBy) === String(req.user._id);
    if (!isDonor && !isClaimant && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this conversation' });
    }

    const messages = await Message.find({ listing: req.params.listingId })
      .populate('sender', 'orgName role')
      .sort({ createdAt: 1 })
      .limit(200);

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
