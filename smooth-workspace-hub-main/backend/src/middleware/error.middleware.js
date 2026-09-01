const multer = require('multer');
const { AppError } = require('../utils/api');

function errorMiddleware(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'Each file must be 10 MB or smaller.'
        }
      });
    }

    return res.status(400).json({
      success: false,
      error: {
        code: 'DUPLICATE_FIELD',
        message: 'Only one invoice and one bank statement file are allowed.'
      }
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {})
      }
    });
  }

  console.error(err);

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred.'
    }
  });
}

module.exports = errorMiddleware;
