const express = require('express');
const { platformImpact, myImpact, recentActivity } = require('../controllers/impactController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', platformImpact);
router.get('/recent-activity', recentActivity);
router.get('/mine', protect, myImpact);

module.exports = router;
