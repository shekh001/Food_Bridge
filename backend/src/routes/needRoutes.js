const express = require('express');
const { createNeed, listOpenNeeds, myNeeds, cancelNeed } = require('../controllers/needController');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', requireRole('ngo'), createNeed);
router.get('/', listOpenNeeds); // any logged-in user (donors browse, NGOs can see the whole board too)
router.get('/mine', requireRole('ngo'), myNeeds);
router.patch('/:id/cancel', requireRole('ngo'), cancelNeed);

module.exports = router;
