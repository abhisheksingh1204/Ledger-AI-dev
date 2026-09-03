const express = require('express');
const { createSession, getSession, uploadDocuments } = require('../controllers/reconciliation.controller');
const { requireUser } = require('../middleware/user.middleware');
const { run, invoiceDetail, sessionExceptions } = require('../controllers/matching.controller');
const { list: history, detail: historyDetail, sessionHistory, recheck, compare } = require('../controllers/history.controller');
const { uploadReconciliationDocuments } = require('../middleware/upload.middleware');

const router = express.Router();

router.post('/sessions', requireUser, createSession);
router.get('/history', requireUser, history);
router.get('/history/compare', requireUser, compare);
router.get('/history/:runId', requireUser, historyDetail);
router.post('/history/:runId/recheck', requireUser, recheck);
router.get('/invoice/:invoiceId', requireUser, invoiceDetail);
router.get('/:sessionId/exceptions', requireUser, sessionExceptions);
router.get('/:sessionId/history', requireUser, sessionHistory);
router.get('/:sessionId', requireUser, getSession);
router.post('/:sessionId/documents', uploadReconciliationDocuments, requireUser, uploadDocuments);
router.post('/:sessionId/run', requireUser, run);

module.exports = router;
