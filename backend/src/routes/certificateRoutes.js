const express = require('express');
const { generateCertificate, generateCsrReport } = require('../controllers/certificateController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/csr-report', protect, generateCsrReport); // must come before /:listingId
router.get('/:listingId', protect, generateCertificate);

module.exports = router;
