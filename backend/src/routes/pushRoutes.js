const express = require('express');
const { protect } = require('../middleware/auth');
const { getPublicKey, subscribe, unsubscribe } = require('../controllers/pushController');

const router = express.Router();

router.get('/public-key', getPublicKey);
router.post('/subscribe', protect, subscribe);
router.post('/unsubscribe', protect, unsubscribe);

module.exports = router;
