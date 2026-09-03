const express = require('express');
const { requireUser } = require('../middleware/user.middleware');
const { question, analyze, uploadInvoice } = require('../controllers/ai.controller');
const { uploadInvoice: uploadInvoiceMiddleware } = require('../middleware/upload.middleware');
const router = express.Router();
router.post('/invoices/upload', requireUser, uploadInvoiceMiddleware, uploadInvoice);
router.post('/invoice/:invoiceId/question', requireUser, question);
router.post('/reconciliation/:invoiceId/analyze', requireUser, analyze);
module.exports = router;
