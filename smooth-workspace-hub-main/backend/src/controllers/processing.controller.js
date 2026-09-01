const { asyncHandler, AppError } = require('../utils/api');
const {
  processSessionDocuments,
  processSingleDocument
} = require('../services/documentProcessing.service');

const processDocument = asyncHandler(async (req, res) => {
  const userId = req.currentUserId;
  const { documentId } = req.body || {};

  if (!documentId) {
    throw new AppError('DOCUMENT_ID_REQUIRED', 'documentId is required.', 400);
  }

  const result = await processSingleDocument(documentId, userId);

  return res.status(200).json({
    success: true,
    message: 'Document processed successfully.',
    data: result
  });
});

const processSession = asyncHandler(async (req, res) => {
  const userId = req.currentUserId;
  const { sessionId } = req.params;
  const result = await processSessionDocuments(sessionId, userId);

  return res.status(200).json({
    success: true,
    message: 'Session documents processed successfully.',
    data: result
  });
});

module.exports = {
  processDocument,
  processSession
};
