const path = require('path');
const { v4: uuidv4 } = require('uuid');

function generateSessionId() {
  return `REC-${uuidv4()}`;
}

function generateDocumentId() {
  return `DOC-${uuidv4()}`;
}

function getDocumentFolderName(documentType) {
  return documentType === 'BANK_STATEMENT' ? 'bank-statements' : 'invoices';
}

function getDocumentPublicIdPrefix(documentType) {
  return documentType === 'BANK_STATEMENT' ? 'bank-statement' : 'invoice';
}

function sanitizeFilename(filename) {
  if (!filename) {
    return 'document';
  }

  const baseName = path.basename(String(filename));
  return (
    baseName
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[<>:"|?*]/g, '_')
      .trim() || 'document'
  );
}

function getCloudinaryFolder({ userId, sessionId, documentType }) {
  return `finance-controller/users/${userId}/reconciliations/${sessionId}/${getDocumentFolderName(
    documentType
  )}`;
}

function getCloudinaryPublicId(documentType) {
  return `${getDocumentPublicIdPrefix(documentType)}-${uuidv4()}`;
}

function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && /^REC-[0-9a-fA-F-]{36}$/.test(sessionId);
}

function isValidDocumentId(documentId) {
  return typeof documentId === 'string' && /^DOC-[0-9a-fA-F-]{36}$/.test(documentId);
}

module.exports = {
  generateSessionId,
  generateDocumentId,
  getCloudinaryFolder,
  getCloudinaryPublicId,
  sanitizeFilename,
  isValidDocumentId,
  isValidSessionId
};
