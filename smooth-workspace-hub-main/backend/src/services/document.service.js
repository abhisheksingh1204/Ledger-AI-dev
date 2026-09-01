const db = require('../db/knex');
const { AppError } = require('../utils/api');
const {
  generateDocumentId,
  generateSessionId,
  sanitizeFilename,
  isValidDocumentId,
  isValidSessionId
} = require('../utils/identifiers');

async function insertAuditLog(entry, trx = db) {
  const payload = {
    action: entry.action,
    table_name: entry.tableName,
    record_id: entry.recordId,
    old_value: entry.oldValue || null,
    new_value: entry.newValue || null,
    user_id: entry.userId,
    created_at: trx.fn.now()
  };

  await trx('audit_log').insert(payload);
}

async function createReconciliationSession({ userId }, trx = db) {
  const sessionId = generateSessionId();
  const [session] = await trx('reconciliation_sessions')
    .insert({
      session_id: sessionId,
      user_id: userId,
      status: 'CREATED',
      created_at: trx.fn.now(),
      updated_at: trx.fn.now()
    })
    .returning('*');

  await insertAuditLog(
    {
      action: 'RECONCILIATION_SESSION_CREATED',
      tableName: 'reconciliation_sessions',
      recordId: session.id,
      userId,
      newValue: {
        sessionId: session.session_id,
        status: session.status
      }
    },
    trx
  );

  return session;
}

async function findSessionBySessionId(sessionId, trx = db) {
  return trx('reconciliation_sessions').where({ session_id: sessionId }).first();
}

async function requireSessionForUser({ sessionId, userId }, trx = db) {
  if (!isValidSessionId(sessionId)) {
    throw new AppError('INVALID_SESSION_ID', 'Session ID format is invalid.', 400);
  }

  const session = await findSessionBySessionId(sessionId, trx);

  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Reconciliation session was not found.', 404);
  }

  if (session.user_id !== userId) {
    throw new AppError(
      'UNAUTHORIZED_SESSION',
      'This reconciliation session does not belong to the current user.',
      403
    );
  }

  return session;
}

async function updateSessionStatusById({ sessionDbId, status }, trx = db) {
  const [session] = await trx('reconciliation_sessions')
    .where({ id: sessionDbId })
    .update(
      {
        status,
        updated_at: trx.fn.now()
      },
      ['id', 'session_id', 'user_id', 'status', 'created_at', 'updated_at']
    );

  return session;
}

async function markSessionFailed(sessionDbId, trx = db) {
  await trx('reconciliation_sessions')
    .where({ id: sessionDbId })
    .update({
      status: 'FAILED',
      updated_at: trx.fn.now()
    });
}

function mapCloudinaryResultToDocumentData({
  uploadResult,
  documentType,
  userId,
  sessionDbId,
  originalFilename,
  mimeType,
  fileSize
}) {
  return {
    document_id: generateDocumentId(),
    session_id: sessionDbId,
    user_id: userId,
    document_type: documentType,
    original_filename: sanitizeFilename(originalFilename),
    mime_type: mimeType,
    file_size: fileSize,
    cloudinary_public_id: uploadResult.public_id,
    cloudinary_asset_id: uploadResult.asset_id || null,
    cloudinary_url: uploadResult.url,
    cloudinary_secure_url: uploadResult.secure_url || null,
    cloudinary_resource_type: uploadResult.resource_type || null,
    cloudinary_format: uploadResult.format || null,
    cloudinary_version: uploadResult.version || null,
    upload_status: 'UPLOADED',
    processing_status: 'PENDING',
    created_at: db.fn.now(),
    updated_at: db.fn.now()
  };
}

async function insertDocuments(documents, trx = db) {
  return trx('documents').insert(documents).returning('*');
}

async function persistUploadedDocuments({
  session,
  userId,
  invoiceUpload,
  bankStatementUpload,
  invoiceFile,
  bankStatementFile
}) {
  return db.transaction(async (trx) => {
    const invoiceDocument = mapCloudinaryResultToDocumentData({
      uploadResult: invoiceUpload,
      documentType: 'INVOICE',
      userId,
      sessionDbId: session.id,
      originalFilename: invoiceFile.originalname,
      mimeType: invoiceFile.mimetype,
      fileSize: invoiceFile.size
    });

    const bankStatementDocument = mapCloudinaryResultToDocumentData({
      uploadResult: bankStatementUpload,
      documentType: 'BANK_STATEMENT',
      userId,
      sessionDbId: session.id,
      originalFilename: bankStatementFile.originalname,
      mimeType: bankStatementFile.mimetype,
      fileSize: bankStatementFile.size
    });

    const insertedDocuments = await insertDocuments(
      [invoiceDocument, bankStatementDocument],
      trx
    );

    const [updatedSession] = await trx('reconciliation_sessions')
      .where({ id: session.id, user_id: userId })
      .update(
        {
          status: 'UPLOADED',
          updated_at: trx.fn.now()
        },
        ['id', 'session_id', 'user_id', 'status', 'created_at', 'updated_at']
      );

    if (!updatedSession) {
      throw new AppError('SESSION_NOT_FOUND', 'Reconciliation session was not found.', 404);
    }

    await insertAuditLog(
      {
        action: 'DOCUMENT_UPLOADED',
        tableName: 'documents',
        recordId: insertedDocuments[0].id,
        userId,
        newValue: {
          documentId: insertedDocuments[0].document_id,
          documentType: insertedDocuments[0].document_type,
          filename: insertedDocuments[0].original_filename,
          uploadStatus: insertedDocuments[0].upload_status
        }
      },
      trx
    );

    await insertAuditLog(
      {
        action: 'DOCUMENT_UPLOADED',
        tableName: 'documents',
        recordId: insertedDocuments[1].id,
        userId,
        newValue: {
          documentId: insertedDocuments[1].document_id,
          documentType: insertedDocuments[1].document_type,
          filename: insertedDocuments[1].original_filename,
          uploadStatus: insertedDocuments[1].upload_status
        }
      },
      trx
    );

    await insertAuditLog(
      {
        action: 'RECONCILIATION_SESSION_UPDATED',
        tableName: 'reconciliation_sessions',
        recordId: updatedSession.id,
        userId,
        newValue: {
          sessionId: updatedSession.session_id,
          status: updatedSession.status
        }
      },
      trx
    );

    return {
      session: updatedSession,
      documents: insertedDocuments
    };
  });
}

async function getSessionWithDocuments(sessionId, userId) {
  if (!isValidSessionId(sessionId)) {
    throw new AppError('INVALID_SESSION_ID', 'Session ID format is invalid.', 400);
  }

  const session = await db('reconciliation_sessions')
    .where({ session_id: sessionId })
    .first();

  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Reconciliation session was not found.', 404);
  }

  if (session.user_id !== userId) {
    throw new AppError(
      'UNAUTHORIZED_SESSION',
      'This reconciliation session does not belong to the current user.',
      403
    );
  }

  const documents = await db('documents')
    .where({ session_id: session.id, user_id: userId })
    .orderBy('created_at', 'asc');

  return { session, documents };
}

async function getDocumentByDocumentId(documentId, userId) {
  if (!isValidDocumentId(documentId)) {
    throw new AppError('INVALID_DOCUMENT_ID', 'Document ID format is invalid.', 400);
  }

  const document = await db('documents')
    .where({ document_id: documentId })
    .first();

  if (!document) {
    throw new AppError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
  }

  if (document.user_id !== userId) {
    throw new AppError('UNAUTHORIZED_DOCUMENT', 'This document does not belong to the current user.', 403);
  }

  return document;
}

async function getDocumentsForProcessingBySessionId(sessionId, userId) {
  const session = await db('reconciliation_sessions')
    .where({ session_id: sessionId })
    .first();

  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Reconciliation session was not found.', 404);
  }

  if (session.user_id !== userId) {
    throw new AppError(
      'UNAUTHORIZED_SESSION',
      'This reconciliation session does not belong to the current user.',
      403
    );
  }

  const documents = await db('documents')
    .where({ session_id: session.id, user_id: userId })
    .orderBy('created_at', 'asc');

  return { session, documents };
}

async function updateDocumentProcessingStatus(documentDbId, processingStatus, trx = db) {
  const [document] = await trx('documents')
    .where({ id: documentDbId })
    .update(
      {
        processing_status: processingStatus,
        updated_at: trx.fn.now()
      },
      ['id', 'document_id', 'document_type', 'processing_status', 'extracted_data']
    );

  return document;
}

async function storeDocumentExtraction(documentDbId, extractedData, trx = db) {
  const [document] = await trx('documents')
    .where({ id: documentDbId })
    .update(
      {
        extracted_data: extractedData,
        updated_at: trx.fn.now()
      },
      ['id', 'document_id', 'document_type', 'extracted_data']
    );

  return document;
}

module.exports = {
  createReconciliationSession,
  findSessionBySessionId,
  getDocumentByDocumentId,
  getDocumentsForProcessingBySessionId,
  getSessionWithDocuments,
  insertAuditLog,
  insertDocuments,
  markSessionFailed,
  mapCloudinaryResultToDocumentData,
  persistUploadedDocuments,
  requireSessionForUser,
  storeDocumentExtraction,
  updateDocumentProcessingStatus,
  updateSessionStatusById
};
