const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');
const {
  getCloudinaryFolder,
  getCloudinaryPublicId,
  sanitizeFilename
} = require('../utils/identifiers');
const { AppError } = require('../utils/api');

const DEFAULT_DELIVERY_TYPE = 'authenticated';
const UPLOAD_RETRIES = Number(process.env.CLOUDINARY_UPLOAD_RETRIES || 2);
const RETRYABLE_NETWORK_ERRORS = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']);

function uploadBufferToCloudinary(buffer, options) {
  const attempt = (attemptNumber) => new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (!error) return resolve(result);

      const code = error?.code || error?.errno;
      if (RETRYABLE_NETWORK_ERRORS.has(code) && attemptNumber < UPLOAD_RETRIES) {
        const delayMs = 500 * attemptNumber;
        console.warn('Retrying Cloudinary upload after transient network error', {
          code,
          attempt: attemptNumber + 1,
          delayMs
        });
        return setTimeout(() => {
          attempt(attemptNumber + 1).then(resolve, reject);
        }, delayMs);
      }

      return reject(error);
    });

    Readable.from(buffer).pipe(uploadStream);
  });

  return attempt(0);
}

function buildSignedDocumentUrl(document) {
  if (!document?.cloudinary_public_id) {
    throw new AppError('CLOUDINARY_DOWNLOAD_FAILED', 'Cloudinary public ID is missing for this document.', 502);
  }

  return cloudinary.utils.private_download_url(
    document.cloudinary_public_id,
    document.cloudinary_format || 'pdf',
    {
    resource_type: document.cloudinary_resource_type || 'image',
    type: 'authenticated',
    }
  );
}

async function uploadDocument({
  buffer,
  documentType,
  userId,
  sessionId,
  originalFilename
}) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new AppError('INVALID_FILE', 'Uploaded file buffer is missing.', 400);
  }

  const folder = getCloudinaryFolder({ userId, sessionId, documentType });
  const publicId = getCloudinaryPublicId(documentType);
  const safeFilename = sanitizeFilename(originalFilename);

  try {
    const result = await uploadBufferToCloudinary(buffer, {
      folder,
      public_id: publicId,
      resource_type: 'auto',
      type: DEFAULT_DELIVERY_TYPE,
      use_filename: false,
      unique_filename: false,
      overwrite: false,
      filename_override: safeFilename
    });

    return result;
  } catch (error) {
    console.error('Cloudinary upload failed:', {
      code: error?.http_code || error?.code || 'UNKNOWN',
      message: error?.message || 'Cloudinary upload failed.'
    });
    const wrapped = new AppError(
      'CLOUDINARY_UPLOAD_FAILED',
      'Failed to upload document to Cloudinary.',
      502
    );
    wrapped.details = error?.message || 'Cloudinary upload failed.';
    throw wrapped;
  }
}

async function deleteDocumentAsset({ publicId, resourceType, deliveryType }) {
  if (!publicId) {
    return null;
  }

  try {
    return await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType || 'image',
      type: deliveryType || DEFAULT_DELIVERY_TYPE
    });
  } catch (error) {
    return {
      deleted: false,
      error: error?.message || 'Cloudinary deletion failed.'
    };
  }
}

module.exports = {
  DEFAULT_DELIVERY_TYPE,
  buildSignedDocumentUrl,
  deleteDocumentAsset,
  uploadDocument
};
