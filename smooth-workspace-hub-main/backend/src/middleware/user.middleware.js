const { AppError } = require('../utils/api');

function getFirstValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function resolveRequestUserId(req) {
  const headerUserId = getFirstValue(req.headers['x-user-id']);
  const bodyUserId = getFirstValue(req.body && req.body.userId);
  const queryUserId = getFirstValue(req.query && req.query.userId);
  const userId = headerUserId || bodyUserId || queryUserId;

  if (!userId || !String(userId).trim()) {
    throw new AppError(
      'UNAUTHORIZED',
      'Provide a userId via the x-user-id header or request body for development.',
      401
    );
  }

  return String(userId).trim();
}

function requireUser(req, res, next) {
  try {
    req.currentUserId = resolveRequestUserId(req);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requireUser,
  resolveRequestUserId
};
