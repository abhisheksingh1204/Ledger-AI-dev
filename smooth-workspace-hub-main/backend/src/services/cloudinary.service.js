const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');
const {
  getCloudinaryFolder,
  getCloudinaryPublicId,
  sanitizeFilename
} = require('../utils/identifiers');
const { AppError } = require('../utils/api');

const DEFAULT_DELIVERY_TYPE = 'authenticated';

function uploadBufferToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        return reject(error);
      }

      return resolve(result);
    });

    Readable.from(buffer).pipe(uploadStream);
  });
}

function buildSignedDocumentUrl(document) {
  return cloudinary.url(document.cloudinary_public_id, {
    secure: true,
    sign_url: true,
    resource_type: document.cloudinary_resource_type || 'image',
    type: 'authenticated',
    format: document.cloudinary_format || undefined
  });
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
