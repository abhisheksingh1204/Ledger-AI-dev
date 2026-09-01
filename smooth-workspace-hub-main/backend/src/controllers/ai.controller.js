const { asyncHandler, AppError } = require('../utils/api');
const { askInvoice, analyzeReconciliation } = require('../services/aiFinance.service');

const question = asyncHandler(async (req, res) => {
  const text = String(req.body?.question || '').trim();
  if (!text) throw new AppError('QUESTION_REQUIRED', 'Question is required.', 400);
  res.json({ success: true, ...(await askInvoice({ invoiceId: req.params.invoiceId, userId: req.currentUserId, question: text, conversationId: req.body?.conversationId })) });
});
const analyze = asyncHandler(async (req, res) => {
  res.json({ success: true, analysis: await analyzeReconciliation({ invoiceId: req.params.invoiceId, userId: req.currentUserId, question: req.body?.question }) });
});
module.exports = { question, analyze };
