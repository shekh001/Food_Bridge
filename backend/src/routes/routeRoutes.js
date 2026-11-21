const express = require('express');
const { protect, requireRole } = require('../middleware/auth');
const { optimizeRoute } = require('../controllers/routeController');

const router = express.Router();

router.get('/optimize', protect, requireRole('ngo'), optimizeRoute);

module.exports = router;
