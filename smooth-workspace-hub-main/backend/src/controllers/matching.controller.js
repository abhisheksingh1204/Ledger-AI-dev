const { asyncHandler, AppError } = require('../utils/api');
const { runReconciliation } = require('../services/reconciliation.service');
const run = asyncHandler(async (req, res) => {
  try {
    const result = await runReconciliation(req.params.sessionId, req.currentUserId);
    if (!result || !Array.isArray(result.results) || typeof result.totalInvoices !== 'number' || !result.summary) {
      console.error('Reconciliation service returned invalid shape', {
        keys: result ? Object.keys(result) : 'undefined',
        resultsType: Array.isArray(result?.results) ? 'array' : typeof result?.results
      });
      throw new AppError(
        'INVALID_RECONCILIATION_RESULT',
        'Reconciliation service returned an invalid result.',
        502
      );
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AppError && error.code === 'INVALID_RECONCILIATION_RESULT') {
      throw error;
    }
    if (error.statusCode) {
      throw new AppError('RECONCILIATION_ERROR', error.message, error.statusCode);
    }
    throw error;
  }
});
module.exports = { run };
