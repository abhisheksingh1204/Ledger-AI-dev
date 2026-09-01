const express = require('express');
const { createSession, getSession, uploadDocuments } = require('../controllers/reconciliation.controller');
const { requireUser } = require('../middleware/user.middleware');
const { run } = require('../controllers/matching.controller');
const { uploadReconciliationDocuments } = require('../middleware/upload.middleware');

const router = express.Router();

router.post('/sessions', requireUser, createSession);
router.get('/:sessionId', requireUser, getSession);
router.post('/:sessionId/documents', uploadReconciliationDocuments, requireUser, uploadDocuments);
router.post('/:sessionId/run', requireUser, run);

module.exports = router;
