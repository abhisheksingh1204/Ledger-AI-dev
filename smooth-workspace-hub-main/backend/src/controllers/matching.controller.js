const { asyncHandler, AppError } = require('../utils/api');
const { runReconciliation } = require('../services/reconciliation.service');
const db = require('../db/knex');
const { getReconciliationMetadata } = require('../services/reconciliation.service');
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

const invoiceDetail = asyncHandler(async (req, res) => {
  const invoice = await db('invoices').where({ invoice_id: req.params.invoiceId, user_id: req.currentUserId }).first();
  if (!invoice) throw new AppError('INVOICE_NOT_FOUND', 'Invoice was not found.', 404);
  const match = await db('reconciliation_matches').where({ invoice_id: invoice.id }).orderBy('matched_at', 'desc').first();
  const transaction = match?.transaction_id ? await db('bank_transactions').where({ id: match.transaction_id, user_id: req.currentUserId }).first() : null;
  const exceptions = await db('exceptions').where({ invoice_id: invoice.id }).orderBy('created_at', 'desc');
  const document = invoice.document_id ? await db('documents').where({ id: invoice.document_id, user_id: req.currentUserId }).first() : null;
  const extracted = invoice.extracted_data?.invoice || {};
  return res.json({
    success: true,
    data: {
      invoice: {
        invoiceId: invoice.invoice_id,
        invoiceNumber: extracted.invoice_number || invoice.invoice_id,
        customerName: extracted.customer_name || invoice.customer_name,
        vendorName: extracted.seller_name || extracted.vendor_name || null,
        subtotal: extracted.subtotal ?? null,
        tax: extracted.tax ?? extracted.total_tax ?? null,
        amount: extracted.total ?? invoice.amount,
        invoiceDate: invoice.invoice_date,
        dueDate: invoice.due_date,
        currency: invoice.currency,
        paymentReference: extracted.payment_reference || null,
        status: invoice.status
      },
      match: match ? {
        matchId: match.id,
        matchType: match.match_type,
        status: match.status,
        confidence: Number(match.confidence_score),
        scores: {
          amount: Number(match.amount_score), reference: Number(match.reference_score), name: Number(match.name_score), date: Number(match.date_score), semantic: Number(match.semantic_score || 0)
        },
        reason: match.reason
      } : null,
      transaction: transaction ? {
        transactionId: transaction.transaction_id,
        description: transaction.description,
        amount: transaction.amount,
        transactionDate: transaction.transaction_date,
        bankAccount: transaction.bank_account ? `****${String(transaction.bank_account).slice(-4)}` : null,
        currency: transaction.currency
      } : null,
      weights: getReconciliationMetadata().weights,
      exceptions: exceptions.map((item) => ({ id: item.id, type: item.exception_type, severity: item.severity, description: item.description, transactionId: item.transaction_id, createdAt: item.created_at, resolvedAt: item.resolved_at })),
      document: document ? { documentId: document.document_id, filename: document.original_filename } : null
    }
  });
});

const sessionExceptions = asyncHandler(async (req, res) => {
  const session = await db('reconciliation_sessions').where({ session_id: req.params.sessionId, user_id: req.currentUserId }).first();
  if (!session) throw new AppError('SESSION_NOT_FOUND', 'Reconciliation session was not found.', 404);
  const rows = await db('exceptions as e')
    .leftJoin('invoices as i', 'i.id', 'e.invoice_id')
    .leftJoin('bank_transactions as t', 't.id', 'e.transaction_id')
    .where('e.session_id', session.id)
    .select('e.id', 'e.exception_type', 'e.severity', 'e.description', 'e.created_at', 'e.resolved_at', 'i.invoice_id', 't.transaction_id')
    .orderBy('e.created_at', 'desc');
  return res.json({ success: true, data: { items: rows } });
});

module.exports = { run, invoiceDetail, sessionExceptions };
