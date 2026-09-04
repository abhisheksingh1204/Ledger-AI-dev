const { asyncHandler, AppError } = require('../utils/api');
const { createReconciliationSession, mapCloudinaryResultToDocumentData, insertDocuments, requireSessionForUser, updateSessionStatusById } = require('../services/document.service');
const { uploadDocument } = require('../services/cloudinary.service');

const MAX_INVOICES = Number(process.env.BATCH_MAX_INVOICES || 100);
const db = require('../db/knex');

const createBatchSession = asyncHandler(async (req, res) => {
  const session = await createReconciliationSession({ userId: req.currentUserId, mode: 'BATCH' });
  return res.status(201).json({ success: true, session: { sessionId: session.session_id, mode: 'BATCH', status: session.status } });
});

const uploadBatchDocuments = asyncHandler(async (req, res) => {
  const session = await requireSessionForUser({ sessionId: req.params.sessionId, userId: req.currentUserId });
  if (session.mode !== 'BATCH') throw new AppError('INVALID_BATCH_SESSION', 'The session is not a batch session.', 400);
  const invoices = req.files?.invoices || [];
  const bank = req.files?.bankStatement?.[0];
  if (!invoices.length) throw new AppError('INVOICES_REQUIRED', 'At least one invoice file is required.', 400);
  if (invoices.length > MAX_INVOICES) throw new AppError('TOO_MANY_INVOICES', `A batch may contain at most ${MAX_INVOICES} invoices.`, 400);
  if (!bank) throw new AppError('BANK_STATEMENT_REQUIRED', 'One bank statement file is required.', 400);
  await updateSessionStatusById({ sessionDbId: session.id, status: 'UPLOADING' });
  const uploaded = [];
  try {
    for (const file of invoices) {
      const asset = await uploadDocument({ buffer: file.buffer, documentType: 'INVOICE', userId: req.currentUserId, sessionId: session.session_id, originalFilename: file.originalname });
      uploaded.push(mapCloudinaryResultToDocumentData({ uploadResult: asset, documentType: 'INVOICE', userId: req.currentUserId, sessionDbId: session.id, originalFilename: file.originalname, mimeType: file.mimetype, fileSize: file.size }));
    }
    const bankAsset = await uploadDocument({ buffer: bank.buffer, documentType: 'BANK_STATEMENT', userId: req.currentUserId, sessionId: session.session_id, originalFilename: bank.originalname });
    uploaded.push(mapCloudinaryResultToDocumentData({ uploadResult: bankAsset, documentType: 'BANK_STATEMENT', userId: req.currentUserId, sessionDbId: session.id, originalFilename: bank.originalname, mimeType: bank.mimetype, fileSize: bank.size }));
    const documents = await insertDocuments(uploaded);
    const [updated] = await require('../db/knex')('reconciliation_sessions').where({ id: session.id }).update({ status: 'UPLOADED', invoice_document_count: invoices.length, bank_document_count: 1, updated_at: require('../db/knex').fn.now() }, '*');
    return res.status(201).json({ success: true, data: { sessionId: updated.session_id, mode: updated.mode, status: updated.status, invoiceCount: invoices.length, bankCount: 1, documents: documents.map((item) => ({ documentId: item.document_id, documentType: item.document_type, processingStatus: item.processing_status })) } });
  } catch (error) {
    throw error;
  }
});

const batchStatus = asyncHandler(async (req, res) => {
  const session = await requireSessionForUser({ sessionId: req.params.sessionId, userId: req.currentUserId });
  const documents = await db('documents').where({ session_id: session.id, user_id: req.currentUserId });
  const invoiceDocuments = documents.filter((item) => item.document_type === 'INVOICE');
  const completed = invoiceDocuments.filter((item) => ['COMPLETED', 'PROCESSED', 'EXTRACTED'].includes(String(item.processing_status).toUpperCase())).length;
  const failed = invoiceDocuments.filter((item) => String(item.processing_status).toUpperCase() === 'FAILED').length;
  return res.json({ success: true, data: { sessionId: session.session_id, status: session.status, current_stage: session.status === 'RECONCILED' ? 'COMPLETED' : 'PROCESSING_DOCUMENTS', total_documents: documents.length, uploaded_documents: documents.filter((item) => item.upload_status === 'UPLOADED').length, processing_total: invoiceDocuments.length, processing_completed: completed, processing_failed: failed, remaining: Math.max(0, invoiceDocuments.length - completed - failed) } });
});

module.exports = { batchStatus, createBatchSession, uploadBatchDocuments };
