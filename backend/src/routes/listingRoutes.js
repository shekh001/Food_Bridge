const express = require('express');
const {
  createListing,
  browseListings,
  myListings,
  myClaims,
  getListing,
  getListingPhoto,
  claimListing,
  releaseClaim,
  updateStatus,
} = require('../controllers/listingController');
const { protect, requireRole } = require('../middleware/auth');
const { uploadListingPhoto } = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.post('/', requireRole('donor'), uploadListingPhoto.single('photo'), createListing);
router.get('/', browseListings);
router.get('/mine', requireRole('donor'), myListings);
router.get('/my-claims', requireRole('ngo'), myClaims);
router.get('/:id', getListing);
router.get('/:id/photo/:filename', getListingPhoto);
router.post('/:id/claim', requireRole('ngo'), claimListing);
router.post('/:id/release', requireRole('ngo'), releaseClaim);
router.patch('/:id/status', updateStatus);

module.exports = router;
