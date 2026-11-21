const express = require('express');
const { pendingVerifications, verifyUser, disputes, allUsers, promoteToAdmin, verificationDoc } = require('../controllers/adminController');
const { adminListReports, resolveReport, setSuspended } = require('../controllers/reportController');
const { adminListAppeals, resolveAppeal } = require('../controllers/appealController');
const { adminListBookings, adminRetryRefund } = require('../controllers/courierController');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(protect, requireRole('admin'));

router.get('/verifications/pending', pendingVerifications);
router.get('/verifications/:id/document', verificationDoc);
router.patch('/verifications/:id/verify', verifyUser);
router.get('/disputes', disputes);
router.get('/reports', adminListReports);
router.patch('/reports/:id/resolve', resolveReport);
router.get('/appeals', adminListAppeals);
router.patch('/appeals/:id/resolve', resolveAppeal);
router.get('/couriers', adminListBookings);
router.patch('/couriers/:id/retry-refund', adminRetryRefund);
router.get('/users', allUsers);
router.patch('/users/:id/promote', promoteToAdmin);
router.patch('/users/:id/suspend', setSuspended);

module.exports = router;
