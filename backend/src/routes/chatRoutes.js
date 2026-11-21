const express = require('express');
const { protect } = require('../middleware/auth');
const { getMessages } = require('../controllers/chatController');

const router = express.Router();

router.get('/:listingId', protect, getMessages);

module.exports = router;
