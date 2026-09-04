const { asyncHandler, AppError } = require('../utils/api');
const db = require('../db/knex');
const { runReconciliation, getReconciliationMetadata } = require('../services/reconciliation.service');

function json(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function invoiceView(snapshot, invoice) {
  const value = snapshot || invoice || {};
  return {
    invoiceId: value.invoice_id || value.invoiceId || null,
    invoiceNumber: value.invoice_number || value.invoiceNumber || value.invoice_id || value.invoiceId || null,
    customerName: value.customer_name || value.customerName || null,
    amount: value.amount ?? null,
    invoiceDate: value.invoice_date || value.invoiceDate || null,
    currency: value.currency || null
  };
}

function transactionView(snapshot, transaction) {
  const value = snapshot || transaction;
  if (!value) return null;
  return {
    transactionId: value.transaction_id || value.transactionId || null,
    description: value.description || null,
    amount: value.amount ?? null,
    transactionDate: value.transaction_date || value.transactionDate || null,
    bankAccount: value.bank_account ? `****${String(value.bank_account).slice(-4)}` : null
  };
}

function resultView(row, invoice, transaction) {
  const reason = json(row.reason, {});
  const scores = reason.scores || (row.confidence_score == null ? null : {
    amount: Number(row.amount_score), reference: Number(row.reference_score), name: Number(row.name_score),
    semantic: Number(row.semantic_score || 0), date: Number(row.date_score), confidence: Number(row.confidence_score)
  });
  return {
    matchId: row.id,
    invoiceId: invoiceView(row.invoice_snapshot, invoice).invoiceId,
    invoice: invoiceView(row.invoice_snapshot, invoice),
    transactionId: transactionView(row.transaction_snapshot, transaction)?.transactionId || null,
    transaction: transactionView(row.transaction_snapshot, transaction),
    status: row.match_type,
    matchType: row.match_type,
    confidence: Number(row.confidence_score || 0),
    scores,
    amountDifference: row.amount_difference,
    amountDifferencePercent: row.amount_difference_percent,
    bestCandidate: json(row.best_candidate, null),
    reason: { summary: reason.summary || 'Historical reconciliation result.', signals: reason.signals || [] },
    warnings: reason.warnings || []
  };
}

function summaryFromRun(run) {
  return {
    totalInvoices: Number(run.total_invoices || 0),
    autoMatched: Number(run.auto_matched_count || 0),
    manualReview: Number(run.manual_review_count || 0),
    unmatched: Number(run.unmatched_count || 0),
    exceptions: Number(run.exception_count || 0)
  };

}

async function loadRun(runId, userId) {
  const run = await db('reconciliation_runs as r')
    .leftJoin('reconciliation_sessions as s', 's.id', 'r.session_id')
    .where({ 'r.run_id': runId, 'r.user_id': userId })
    .select('r.*', 's.session_id as session_display_id')
    .first();
  if (!run) throw new AppError('RUN_NOT_FOUND', 'Reconciliation run was not found.', 404);
  const rows = await db('reconciliation_matches as m')
    .leftJoin('invoices as i', 'i.id', 'm.invoice_id')
    .leftJoin('bank_transactions as t', 't.id', 'm.transaction_id')
    .where('m.run_id', run.id)
    .select('m.*', 'i.invoice_id as current_invoice_id', 'i.customer_name as current_customer_name', 'i.amount as current_invoice_amount', 'i.invoice_date as current_invoice_date', 't.transaction_id as current_transaction_id', 't.description as current_description', 't.amount as current_amount', 't.transaction_date as current_transaction_date')
    .orderBy('m.id');
  const exceptions = await db('exceptions as e')
    .leftJoin('invoices as i', 'i.id', 'e.invoice_id')
    .leftJoin('bank_transactions as t', 't.id', 'e.transaction_id')
    .where('e.run_id', run.id)
    .select('e.id', 'e.exception_type', 'e.severity', 'e.description', 'e.created_at', 'e.resolved_at', 'i.invoice_id', 't.transaction_id')
    .orderBy('e.id');
  return {
      run: {
      runId: run.run_id, sessionId: run.session_display_id || run.session_id, version: Number(run.version || 1), status: run.status,
      mode: run.mode || 'SINGLE', parentRunId: run.parent_run_id || null, metrics: json(run.metrics),
      createdAt: run.started_at, completedAt: run.completed_at, processingTimeMs: run.processing_time_ms,
      averageProcessingTimeMs: run.average_processing_time_ms, averageConfidence: Number(run.average_confidence || 0),
      matchRate: Number(run.match_rate || 0)
    },
    summary: summaryFromRun(run),
    weights: json(run.weights, getReconciliationMetadata().weights),
    thresholds: json(run.thresholds, getReconciliationMetadata().thresholds),
    results: rows.map((row) => resultView(row, { invoice_id: row.current_invoice_id, customer_name: row.current_customer_name, amount: row.current_invoice_amount, invoice_date: row.current_invoice_date }, {
      transaction_id: row.current_transaction_id, description: row.current_description,
      amount: row.current_amount, transaction_date: row.current_transaction_date
    })),
    exceptions: exceptions.map((item) => ({
      exceptionId: item.id, type: item.exception_type, severity: item.severity, description: item.description,
      invoiceId: item.invoice_id, transactionId: item.transaction_id, createdAt: item.created_at, resolvedAt: item.resolved_at
    }))
  };
}

const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
  const query = db('reconciliation_runs as r')
    .leftJoin('reconciliation_sessions as s', 's.id', 'r.session_id')
    .where('r.user_id', req.currentUserId)
    .select('r.*', 's.session_id as session_display_id');
  if (req.query.from) query.where('started_at', '>=', req.query.from);
  if (req.query.to) query.where('started_at', '<=', req.query.to);
  if (req.query.status) query.where('status', String(req.query.status));
  const runs = await query.orderBy('r.started_at', 'desc').limit(limit).offset((page - 1) * limit);
  return res.json({ success: true, data: { runs: runs.map((run) => ({
    run_id: run.run_id, session_id: run.session_display_id || run.session_id, version: Number(run.version || 1), mode: run.mode || 'SINGLE', created_at: run.started_at,
    total_invoices: Number(run.total_invoices || 0), auto_matched: Number(run.auto_matched_count || 0),
    manual_review: Number(run.manual_review_count || 0), unmatched: Number(run.unmatched_count || 0),
    exceptions: Number(run.exception_count || 0), match_rate: Number(run.match_rate || 0), average_confidence: Number(run.average_confidence || 0), processing_time_ms: run.processing_time_ms == null ? null : Number(run.processing_time_ms)
  })), page, limit } });
});

const detail = asyncHandler(async (req, res) => res.json({ success: true, data: await loadRun(req.params.runId, req.currentUserId) }));

const sessionHistory = asyncHandler(async (req, res) => {
  const session = await db('reconciliation_sessions').where({ session_id: req.params.sessionId, user_id: req.currentUserId }).first();
  if (!session) throw new AppError('SESSION_NOT_FOUND', 'Reconciliation session was not found.', 404);
  const runs = await db('reconciliation_runs').where({ session_id: session.id, user_id: req.currentUserId }).orderBy('version');
  return res.json({ success: true, data: { sessionId: req.params.sessionId, runs: runs.map((run) => ({ runId: run.run_id, version: Number(run.version || 1), createdAt: run.started_at, matchRate: Number(run.match_rate || 0), averageConfidence: Number(run.average_confidence || 0), ...summaryFromRun(run) })) } });
});

const recheck = asyncHandler(async (req, res) => {
  const run = await db('reconciliation_runs').where({ run_id: req.params.runId, user_id: req.currentUserId }).first();
  if (!run) throw new AppError('RUN_NOT_FOUND', 'Reconciliation run was not found.', 404);
  const result = await runReconciliation(run.session_id, req.currentUserId, { parentRunId: run.run_id });
  return res.status(201).json({ success: true, data: result });
});

const compare = asyncHandler(async (req, res) => {
  const from = await loadRun(req.query.from, req.currentUserId);
  const to = await loadRun(req.query.to, req.currentUserId);
  const oldResults = new Map(from.results.map((item) => [item.invoiceId, item]));
  const changed = to.results.filter((item) => oldResults.get(item.invoiceId)?.matchType !== item.matchType).map((item) => ({ invoiceId: item.invoiceId, from: oldResults.get(item.invoiceId)?.matchType || null, to: item.matchType }));
  return res.json({ success: true, data: { from: from.run, to: to.run, summary: { from: from.summary, to: to.summary }, changed } });
});

module.exports = { list, detail, sessionHistory, recheck, compare };
