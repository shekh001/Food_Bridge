const express = require('express');
const { protect } = require('../middleware/auth');
const { getStatus, createOrder, verifyPayment, confirmDemoUpgrade } = require('../controllers/billingController');

const router = express.Router();

router.get('/status', protect, getStatus);
router.post('/create-order', protect, createOrder);
router.post('/verify', protect, verifyPayment);
router.post('/confirm-demo-upgrade', protect, confirmDemoUpgrade);

module.exports = router;
