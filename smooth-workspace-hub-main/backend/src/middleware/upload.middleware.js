const multer = require('multer');
const { AppError } = require('../utils/api');

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg'
]);

const MAX_DOCUMENT_SIZE_MB = Number(process.env.MAX_DOCUMENT_SIZE_MB || 10);
const MAX_FILE_SIZE_BYTES = Math.max(1, MAX_DOCUMENT_SIZE_MB) * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 2
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(
        new AppError(
          'INVALID_FILE_TYPE',
          'Only PDF, PNG and JPEG documents are supported.',
          400
        )
      );
    }

    return cb(null, true);
  }
});

const uploadReconciliationDocuments = upload.fields([
  { name: 'invoice', maxCount: 1 },
  { name: 'bankStatement', maxCount: 1 }
]);

module.exports = {
  MAX_FILE_SIZE_BYTES,
  uploadReconciliationDocuments
};
