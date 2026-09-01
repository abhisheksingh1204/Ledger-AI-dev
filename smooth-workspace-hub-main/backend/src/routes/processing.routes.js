const express = require('express');
const { requireUser } = require('../middleware/user.middleware');
const { processDocument, processSession } = require('../controllers/processing.controller');

const router = express.Router();

router.post('/process-document', requireUser, processDocument);
router.post('/process-session/:sessionId', requireUser, processSession);

module.exports = router;
