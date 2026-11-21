const express = require('express');
const { createReport, myReports, getReportEvidence } = require('../controllers/reportController');
const { protect } = require('../middleware/auth');
const { uploadReportEvidence } = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.post('/', uploadReportEvidence.array('evidence', 3), createReport);
router.get('/mine', myReports);
router.get('/:id/evidence/:filename', getReportEvidence);

module.exports = router;
