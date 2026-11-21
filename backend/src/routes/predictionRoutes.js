const express = require('express');
const { protect } = require('../middleware/auth');
const { getHotspots } = require('../controllers/predictionController');

const router = express.Router();

router.get('/hotspots', protect, getHotspots);

module.exports = router;
