const { asyncHandler } = require('../utils/api');
const { getDocumentByDocumentId } = require('../services/document.service');
const { buildSignedDocumentUrl } = require('../services/cloudinary.service');

const getDocument = asyncHandler(async (req, res) => {
  const userId = req.currentUserId;
  const { documentId } = req.params;
  const document = await getDocumentByDocumentId(documentId, userId);

  return res.status(200).json({
    success: true,
    document: {
      documentId: document.document_id,
      sessionId: document.session_id,
      documentType: document.document_type,
      originalFilename: document.original_filename,
      mimeType: document.mime_type,
      fileSize: document.file_size,
      uploadStatus: document.upload_status,
      processingStatus: document.processing_status,
      createdAt: document.created_at,
      updatedAt: document.updated_at
    }
  });
});

const viewDocument = asyncHandler(async (req, res) => {
  const document = await getDocumentByDocumentId(req.params.documentId, req.currentUserId);
  return res.status(200).json({
    success: true,
    data: {
      documentId: document.document_id,
      filename: document.original_filename,
      mimeType: document.mime_type,
      url: buildSignedDocumentUrl(document)
    }
  });
});

module.exports = {
  getDocument,
  viewDocument
};
