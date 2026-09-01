const { asyncHandler, AppError } = require('../utils/api');
const { runReconciliation } = require('../services/reconciliation.service');
const run = asyncHandler(async (req, res) => { try { res.json({ success: true, summary: await runReconciliation(req.params.sessionId, req.currentUserId) }); } catch (e) { if (e.statusCode) throw new AppError('RECONCILIATION_ERROR', e.message, e.statusCode); throw e; } });
module.exports = { run };
