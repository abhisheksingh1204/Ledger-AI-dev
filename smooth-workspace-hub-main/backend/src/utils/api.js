class AppError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

function asyncHandler(fn) {
  return function asyncMiddleware(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function successResponse(message, data = undefined) {
  return {
    success: true,
    ...(message ? { message } : {}),
    ...(data !== undefined ? { data } : {})
  };
}

module.exports = {
  AppError,
  asyncHandler,
  successResponse
};
