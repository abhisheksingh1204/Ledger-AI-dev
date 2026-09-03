const { asyncHandler, AppError } = require('../utils/api');
const { askInvoice, analyzeReconciliation } = require('../services/aiFinance.service');
const { createReconciliationSession, persistUploadedInvoiceDocument, markSessionFailed } = require('../services/document.service');
const { uploadDocument, deleteDocumentAsset } = require('../services/cloudinary.service');
const { processSingleDocument } = require('../services/documentProcessing.service');

const uploadInvoice = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('INVOICE_REQUIRED', 'An invoice PDF, PNG or JPEG is required.', 400);
  const userId = req.currentUserId;
  const session = await createReconciliationSession({ userId });
  let asset;
  try {
    asset = await uploadDocument({ buffer: req.file.buffer, documentType: 'INVOICE', userId, sessionId: session.session_id, originalFilename: req.file.originalname });
    const saved = await persistUploadedInvoiceDocument({ session, userId, invoiceUpload: asset, invoiceFile: req.file });
    const processed = await processSingleDocument(saved.document.document_id, userId);
    const invoice = await require('../db/knex')('invoices').where({ document_id: saved.document.id, user_id: userId }).first();
    if (!invoice) throw new AppError('INVOICE_PERSISTENCE_FAILED', 'Processed invoice was not saved.', 502);
    return res.status(201).json({ success: true, data: { sessionId: session.session_id, document_id: processed.documentId, invoice_id: invoice.invoice_id, processing_status: processed.processingStatus } });
  } catch (error) {
    if (asset) await deleteDocumentAsset({ publicId: asset.public_id, resourceType: asset.resource_type, deliveryType: 'authenticated' });
    await markSessionFailed(session.id).catch(() => {});
    throw error;
  }
});

const question = asyncHandler(async (req, res) => {
  const text = String(req.body?.question || '').trim();
  if (!text) throw new AppError('QUESTION_REQUIRED', 'Question is required.', 400);
  res.json({ success: true, ...(await askInvoice({ invoiceId: req.params.invoiceId, userId: req.currentUserId, question: text, conversationId: req.body?.conversationId })) });
});
const analyze = asyncHandler(async (req, res) => {
  res.json({ success: true, analysis: await analyzeReconciliation({ invoiceId: req.params.invoiceId, userId: req.currentUserId, question: req.body?.question }) });
});
module.exports = { question, analyze, uploadInvoice };
