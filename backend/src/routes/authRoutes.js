const express = require('express');
const {
  register,
  login,
  me,
  updateMe,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  uploadVerificationDoc,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { uploadVerificationDoc: uploadVerificationDocMiddleware } = require('../middleware/upload');

const router = express.Router();

// multer's single-file middleware only engages for multipart/form-data
// requests (NGO signups sending a proof document); plain JSON requests
// (donor signups) pass straight through untouched.
router.post('/register', uploadVerificationDocMiddleware.single('verificationDoc'), register);
router.post('/login', login);
router.get('/me', protect, me);
router.patch('/me', protect, updateMe);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/verify-email/:token', verifyEmail);
router.post('/resend-verification', protect, resendVerification);
router.post('/verification-doc', protect, uploadVerificationDocMiddleware.single('verificationDoc'), uploadVerificationDoc);

module.exports = router;
