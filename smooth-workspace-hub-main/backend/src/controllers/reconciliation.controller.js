const { AppError, asyncHandler } = require('../utils/api');
const {
  createReconciliationSession,
  getSessionWithDocuments,
  insertAuditLog,
  markSessionFailed,
  persistUploadedDocuments,
  requireSessionForUser,
  updateSessionStatusById
} = require('../services/document.service');
const {
  deleteDocumentAsset,
  uploadDocument
} = require('../services/cloudinary.service');

function getUploadedFile(req, fieldName) {
  return req.files && req.files[fieldName] && req.files[fieldName][0];
}

function toSafeDocumentResponse(document) {
  return {
    documentId: document.document_id,
    documentType: document.document_type,
    originalFilename: document.original_filename,
    uploadStatus: document.upload_status,
    processingStatus: document.processing_status
  };
}

const createSession = asyncHandler(async (req, res) => {
  const userId = req.currentUserId;
  const session = await createReconciliationSession({ userId });

  return res.status(201).json({
    success: true,
    session: {
      id: session.id,
      sessionId: session.session_id,
      status: session.status
    }
  });
});

const getSession = asyncHandler(async (req, res) => {
  const userId = req.currentUserId;
  const { sessionId } = req.params;
  const { session, documents } = await getSessionWithDocuments(sessionId, userId);

  return res.status(200).json({
    success: true,
    session: {
      sessionId: session.session_id,
      status: session.status,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      documents: documents.map(toSafeDocumentResponse)
    }
  });
});

const uploadDocuments = asyncHandler(async (req, res) => {
  const userId = req.currentUserId;
  const { sessionId } = req.params;
  const invoiceFile = getUploadedFile(req, 'invoice');
  const bankStatementFile = getUploadedFile(req, 'bankStatement');

  if (!invoiceFile) {
    throw new AppError('INVOICE_REQUIRED', 'Invoice file is required.', 400);
  }

  if (!bankStatementFile) {
    throw new AppError('BANK_STATEMENT_REQUIRED', 'Bank statement file is required.', 400);
  }

  const session = await requireSessionForUser({ sessionId, userId });

  const uploadedAssets = [];

  try {
    await updateSessionStatusById({ sessionDbId: session.id, status: 'UPLOADING' });

    const invoiceUpload = await uploadDocument({
      buffer: invoiceFile.buffer,
      documentType: 'INVOICE',
      userId,
      sessionId,
      originalFilename: invoiceFile.originalname
    });

    uploadedAssets.push(invoiceUpload);

    const bankStatementUpload = await uploadDocument({
      buffer: bankStatementFile.buffer,
      documentType: 'BANK_STATEMENT',
      userId,
      sessionId,
      originalFilename: bankStatementFile.originalname
    });

    uploadedAssets.push(bankStatementUpload);

    const { session: updatedSession, documents } = await persistUploadedDocuments({
      session,
      userId,
      invoiceUpload,
      bankStatementUpload,
      invoiceFile,
      bankStatementFile
    });

    return res.status(201).json({
      success: true,
      message: 'Documents uploaded successfully.',
      data: {
        sessionId: updatedSession.session_id,
        status: updatedSession.status,
        documents: documents.map((document) => ({
          documentId: document.document_id,
          documentType: document.document_type,
          filename: document.original_filename,
          uploadStatus: document.upload_status,
          processingStatus: document.processing_status
        }))
      }
    });
  } catch (error) {
    if (uploadedAssets.length > 0) {
      await Promise.all(
        uploadedAssets.map((asset) =>
          deleteDocumentAsset({
            publicId: asset.public_id,
            resourceType: asset.resource_type,
            deliveryType: 'authenticated'
          })
        )
      );
    }

    try {
      await markSessionFailed(session.id);
    } catch (statusError) {
      console.error(statusError);
    }

    try {
      await insertAuditLog({
        action: 'DOCUMENT_UPLOAD_FAILED',
        tableName: 'reconciliation_sessions',
        recordId: session.id,
        userId,
        newValue: {
          sessionId: session.session_id,
          status: 'FAILED'
        }
      });
    } catch (auditError) {
      console.error(auditError);
    }

    throw error;
  }
});

module.exports = {
  createSession,
  getSession,
  uploadDocuments
};
