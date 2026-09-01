const express = require('express');
const { requireUser } = require('../middleware/user.middleware');
const { question, analyze } = require('../controllers/ai.controller');
const router = express.Router();
router.post('/invoice/:invoiceId/question', requireUser, question);
router.post('/reconciliation/:invoiceId/analyze', requireUser, analyze);
module.exports = router;
