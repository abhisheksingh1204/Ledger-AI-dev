const express = require('express');
const { requireUser } = require('../middleware/user.middleware');
const { uploadBatchDocuments } = require('../middleware/upload.middleware');
const { batchStatus, createBatchSession, uploadBatchDocuments: upload } = require('../controllers/batchReconciliation.controller');

const router = express.Router();
router.post('/sessions', requireUser, createBatchSession);
router.post('/:sessionId/documents', uploadBatchDocuments, requireUser, upload);
router.get('/:sessionId/status', requireUser, batchStatus);
module.exports = router;
