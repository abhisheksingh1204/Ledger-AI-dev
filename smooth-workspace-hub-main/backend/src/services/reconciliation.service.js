const Decimal = require('decimal.js');
const db = require('../db/knex');

const CONFIG = {
  tolerance: new Decimal(process.env.RECON_AMOUNT_TOLERANCE || '0.01'),
  beforeDays: Number(process.env.RECON_DATE_BEFORE_DAYS || 7),
  afterDays: Number(process.env.RECON_DATE_AFTER_DAYS || 30),
  auto: Number(process.env.RECON_AUTO_MATCH_THRESHOLD || 90),
  review: Number(process.env.RECON_REVIEW_THRESHOLD || 70),
  semanticServiceUrl: process.env.SEMANTIC_SERVICE_URL || process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8001',
  semanticServiceToken: process.env.OCR_SERVICE_INTERNAL_TOKEN || '',
  semanticTimeoutMs: Number(process.env.SEMANTIC_TIMEOUT_MS || process.env.OCR_SERVICE_TIMEOUT_MS || 120000)
};
const AMOUNT_SCORE_BANDS = [
  [Number(process.env.RECON_AMOUNT_SCORE_EXACT_PERCENT || 0.10), 100],
  [Number(process.env.RECON_AMOUNT_SCORE_HIGH_PERCENT || 0.50), 95],
  [Number(process.env.RECON_AMOUNT_SCORE_GOOD_PERCENT || 1.00), 85],
  [Number(process.env.RECON_AMOUNT_SCORE_REVIEW_PERCENT || 2.00), 65],
  [Number(process.env.RECON_AMOUNT_SCORE_WEAK_PERCENT || 5.00), 40],
  [Number(process.env.RECON_AMOUNT_SCORE_LOW_PERCENT || 10.00), 20]
];
const CANDIDATE_AMOUNT_MAX_PERCENT = Number(process.env.RECON_CANDIDATE_AMOUNT_MAX_PERCENT || 25);
const WEIGHTS = {
  amount: Number(process.env.RECON_WEIGHT_AMOUNT || 35),
  reference: Number(process.env.RECON_WEIGHT_REFERENCE || 25),
  name: Number(process.env.RECON_WEIGHT_NAME || 15),
  semantic: Number(process.env.RECON_WEIGHT_SEMANTIC || 15),
  date: Number(process.env.RECON_WEIGHT_DATE || 10)
};
const WEIGHT_TOTAL = Object.values(WEIGHTS).reduce((sum, value) => sum + value, 0) || 1;
function normalize(v) { return String(v || '').toLowerCase().replace(/\b(private|pvt|limited|ltd|inc|llc)\b/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim(); }
function compact(v) { return normalize(v).replace(/ /g, ''); }
function levenshtein(a, b) { const m = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) m[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; }
function similarity(a, b) { a = normalize(a); b = normalize(b); if (!a || !b) return 0; if (a === b) return 100; return Math.max(0, Math.round((1 - levenshtein(a, b) / Math.max(a.length, b.length)) * 10000) / 100); }
function jaroWinkler(a, b) {
  a = normalize(a); b = normalize(b); if (!a || !b) return 0; if (a === b) return 100;
  const distance = Math.floor(Math.max(a.length, b.length) / 2) - 1; const am = [], bm = []; let matches = 0;
  for (let i = 0; i < a.length; i++) for (let j = Math.max(0, i - distance); j <= Math.min(i + distance, b.length - 1); j++) if (!bm[j] && a[i] === b[j]) { am[i] = true; bm[j] = true; matches++; break; }
  if (!matches) return 0; const ax = [], bx = []; for (let i = 0; i < a.length; i++) if (am[i]) ax.push(a[i]); for (let j = 0; j < b.length; j++) if (bm[j]) bx.push(b[j]);
  let transpositions = 0; for (let i = 0; i < ax.length; i++) if (ax[i] !== bx[i]) transpositions++;
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3; let prefix = 0; while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  return Math.round((jaro + prefix * 0.1 * (1 - jaro)) * 10000) / 100;
}
function amountDifferencePercent(a, b) {
  const x = new Decimal(a || 0);
  const y = new Decimal(b || 0);
  if (!x.isFinite() || !y.isFinite()) return new Decimal(100);
  const denominator = Decimal.max(x.abs(), new Decimal('0.01'));
  return x.minus(y).abs().div(denominator).mul(100);
}
function amountScore(a, b) {
  const differencePercent = amountDifferencePercent(a, b);
  for (const [limit, scoreValue] of AMOUNT_SCORE_BANDS) {
    if (differencePercent.lte(limit)) return scoreValue;
  }
  return 0;
}
function dateScore(days) { return days <= 3 ? 100 : days <= 7 ? 90 : days <= 15 ? 75 : days <= 30 ? 50 : Math.max(0, 50 - days + 30); }
function daysBetween(a, b) { const x = new Date(a); const y = new Date(b); return Number.isNaN(x.getTime()) || Number.isNaN(y.getTime()) ? 999 : Math.abs(Math.round((y - x) / 86400000)); }
function weight(value) { return value / WEIGHT_TOTAL; }

function buildReason({ invoice, best, matchType, candidates }) {
  if (!best) {
    return {
      summary: 'No candidate transaction found within the configured date and amount rules.',
      signals: ['No transaction passed the deterministic candidate filters.']
    };
  }

  const signals = [];
  const amountPercent = amountDifferencePercent(invoice.amount, best.transactions
    ? best.transactions.reduce((sum, transaction) => sum.plus(transaction.amount || 0), new Decimal(0))
    : best.t?.amount).toFixed(2);
  const amountDifference = best.difference.toFixed(2);
  signals.push(best.scores.amount === 100 ? 'Exact amount match' : `Amount differs by ${amountDifference} (${amountPercent}%)`);
  signals.push(best.referenceExact ? 'Exact invoice reference match' : `Reference score ${best.scores.reference}%`);
  signals.push(best.scores.name >= 95 ? 'Customer name matched' : `Name score ${best.scores.name}%`);
  signals.push(`Semantic score ${best.scores.semantic}%`);
  signals.push(`Transaction date score ${best.scores.date}%`);
  if (best.days !== 999) signals.push(`Transaction occurred ${best.days} day(s) from the invoice date`);

  const summary = matchType === 'UNMATCHED'
    ? `Best candidate confidence ${best.scores.confidence}% is below the review threshold of ${CONFIG.review}%.`
    : best.referenceExact && best.scores.amount < 100 && best.scores.name >= 90 && best.scores.date >= 90
      ? 'Strong reference, customer and date match with an amount discrepancy.'
    : best.referenceExact && best.scores.amount === 100
      ? 'Strong amount and reference match.'
      : 'Match selected from the highest deterministic confidence score.';
  return { summary, signals };
}

function semanticClean(value) {
  return String(value || '')
    .replace(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[a-z]{3,9}\s+\d{2,4}|[a-z]{3,9}\s+\d{1,2},?\s+\d{2,4})\b/gi, ' ')
    .replace(/\b(?:invoice|inv|bill|utr|ref|reference|txn|transaction|payment)\s*[:#\-]?\s*[a-z0-9/\-_.]*\d[a-z0-9/\-_.]*\b/gi, ' ')
    .replace(/\b(?:inr|usd|eur|gbp|rs\.?|₹|\$)\s*\d[\d,]*(?:\.\d{1,2})?\b/gi, ' ')
    .replace(/\b\d[\d,]*(?:\.\d{1,2})?\b/g, ' ')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSemanticQuery(invoice = {}) {
  return semanticClean(invoice.customer_name || invoice.seller_name || '');
}

function buildSemanticPassage(transaction = {}) {
  return semanticClean(transaction.description || transaction.counterparty || transaction.payer_payee || '');
}

async function getSemanticScores(query, passages) {
  const cleanedQuery = buildSemanticQuery({ customer_name: query });
  const cleanedPassages = passages.map((passage) => buildSemanticPassage({ description: passage }));
  if (!cleanedQuery || cleanedPassages.every((passage) => !passage)) {
    return passages.map(() => 0);
  }

  const scoringTargets = cleanedPassages
    .map((passage, index) => ({ passage, index }))
    .filter((entry) => entry.passage);

  if (!scoringTargets.length) {
    return passages.map(() => 0);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.semanticTimeoutMs);
  try {
    const response = await fetch(`${CONFIG.semanticServiceUrl}/internal/semantic-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CONFIG.semanticServiceToken ? { 'X-Internal-Token': CONFIG.semanticServiceToken } : {})
      },
      body: JSON.stringify({ query: cleanedQuery, passages: scoringTargets.map((entry) => entry.passage) }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !Array.isArray(payload?.data?.scores)) {
      throw new Error(payload?.error?.message || 'semantic service failed');
    }
    const scores = passages.map(() => 0);
    scoringTargets.forEach((entry, index) => {
      scores[entry.index] = Number(payload.data.scores[index]?.semantic_score || 0);
    });
    return scores;
  } catch (error) {
    console.warn('Semantic scoring unavailable: %s', error.message || error);
    return passages.map(() => 0);
  } finally {
    clearTimeout(timeout);
  }
}

function score(invoice, transaction, semantic = 0) {
  const data = invoice.extracted_data?.invoice || {};
  const number = data.invoice_number || invoice.invoice_id;
  const description = `${transaction.description || ''} ${transaction.reference || ''}`;
  const paymentReference = compact(data.payment_reference);
  const referenceExact =
    (compact(number) && compact(description).includes(compact(number))) ||
    (paymentReference ? compact(description).includes(paymentReference) : false);
  const days = daysBetween(invoice.invoice_date, transaction.transaction_date);
  const scores = {
    amount: amountScore(invoice.amount, transaction.amount),
    reference: referenceExact ? 100 : similarity(number, description),
    name: Math.max(
      jaroWinkler(data.customer_name || invoice.customer_name, description),
      compact(data.customer_name || invoice.customer_name) && compact(description).includes(compact(data.customer_name || invoice.customer_name)) ? 100 : 0
    ),
    semantic: Math.max(0, Math.min(100, Number(semantic) || 0)),
    date: dateScore(days)
  };
  scores.confidence = Math.round(
    (
      scores.amount * weight(WEIGHTS.amount) +
      scores.reference * weight(WEIGHTS.reference) +
      scores.name * weight(WEIGHTS.name) +
      scores.semantic * weight(WEIGHTS.semantic) +
      scores.date * weight(WEIGHTS.date)
    ) * 100
  ) / 100;
  const difference = new Decimal(invoice.amount || 0).minus(transaction.amount || 0).abs();
  const warnings = [];
  if (!difference.isZero()) {
    const isPartialPayment = new Decimal(transaction.amount || 0).lt(new Decimal(invoice.amount || 0));
    warnings.push({ type: isPartialPayment ? 'PARTIAL_PAYMENT' : 'AMOUNT_MISMATCH', severity: 'HIGH', difference: difference.toFixed(2) });
  }
  if (days > 30) warnings.push({ type: 'DATE_MISMATCH', severity: 'MEDIUM' });
  if (!referenceExact) warnings.push({ type: 'REFERENCE_MISMATCH', severity: 'MEDIUM' });
  if (scores.name < 60) warnings.push({ type: 'NAME_MISMATCH', severity: 'MEDIUM' });
  return { scores, difference, warnings, referenceExact, days };
}
function isDateAllowed(invoice, transaction) {
  const invoiceDate = new Date(invoice.invoice_date);
  const dueDate = new Date(invoice.due_date || invoice.invoice_date);
  const transactionDate = new Date(transaction.transaction_date);
  if (Number.isNaN(transactionDate.getTime()) || Number.isNaN(invoiceDate.getTime())) return false;
  return transactionDate >= new Date(invoiceDate.getTime() - CONFIG.beforeDays * 86400000) &&
    transactionDate <= new Date(dueDate.getTime() + CONFIG.afterDays * 86400000);
}
function isBroadCandidate(invoice, transaction) {
  if (!isDateAllowed(invoice, transaction)) return false;
  const data = invoice.extracted_data?.invoice || {};
  const invoiceNumber = data.invoice_number || invoice.invoice_id;
  const description = `${transaction.description || ''} ${transaction.reference || ''}`;
  const normalizedDescription = compact(description);
  const referenceExact = compact(invoiceNumber) && normalizedDescription.includes(compact(invoiceNumber));
  const referenceScore = referenceExact ? 100 : similarity(invoiceNumber, description);
  const customer = data.customer_name || invoice.customer_name;
  const normalizedCustomer = compact(customer);
  const nameScore = normalizedCustomer && normalizedDescription.includes(normalizedCustomer)
    ? 100
    : jaroWinkler(customer, description);
  const amountPercent = amountDifferencePercent(invoice.amount, transaction.amount).toNumber();
  return referenceExact || referenceScore >= 80 || nameScore >= 70 || amountPercent <= CANDIDATE_AMOUNT_MAX_PERCENT;
}
function findPaymentCombination(invoice, candidates, limit = 3) {
  const target = new Decimal(invoice.amount || 0);
  let found = null;
  function visit(start, chosen, total) {
    if (chosen.length >= 2 && total.minus(target).abs().lte(CONFIG.tolerance)) {
      const parts = chosen.map((item) => item.scored);
      found = { transactions: chosen.map((item) => item.transaction), scores: {
        amount: 100,
        reference: Math.max(...parts.map((p) => p.scores.reference)),
        name: Math.max(...parts.map((p) => p.scores.name)),
        semantic: Math.max(...parts.map((p) => p.scores.semantic || 0)),
        date: Math.min(...parts.map((p) => p.scores.date))
      } };
      found.scores.confidence = Math.round(
        (
          found.scores.amount * weight(WEIGHTS.amount) +
          found.scores.reference * weight(WEIGHTS.reference) +
          found.scores.name * weight(WEIGHTS.name) +
          found.scores.semantic * weight(WEIGHTS.semantic) +
          found.scores.date * weight(WEIGHTS.date)
        ) * 100
      ) / 100;
      return true;
    }
    if (chosen.length === limit || found) return Boolean(found);
    for (let i = start; i < candidates.length; i++) {
      const next = candidates[i];
      if (visit(i + 1, [...chosen, next], total.plus(next.transaction.amount || 0))) return true;
    }
    return false;
  }
  visit(0, [], new Decimal(0));
  return found;
}

async function runReconciliation(sessionId, userId) {
  const session = await db('reconciliation_sessions').where({ session_id: sessionId, user_id: userId }).first();
  if (!session) { const e = new Error('Reconciliation session not found.'); e.statusCode = 404; throw e; }
  const invoices = await db('invoices').where({ session_id: session.id, user_id: userId });
  const transactions = await db('bank_transactions').where({ session_id: session.id, user_id: userId }).whereIn('status', ['PENDING', 'EXTRACTED']);
  const results = [];
  let runId = null;
  const startedAt = Date.now();
  await db.transaction(async (trx) => {
    const [{ max }] = await trx('reconciliation_runs').where({ session_id: session.id, user_id: userId }).max('version as max');
    const version = Number(max || 0) + 1;
    const [run] = await trx('reconciliation_runs').insert({
      run_id: `RUN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      session_id: session.id, user_id: userId, version, status: 'RUNNING',
      weights: WEIGHTS, thresholds: { auto: CONFIG.auto, review: CONFIG.review }
    }).returning('*');
    runId = run.run_id;
    await trx('audit_log').insert({ action: 'RECONCILIATION_STARTED', table_name: 'reconciliation_runs', record_id: run.id, user_id: userId, new_value: { sessionId } });
    const used = new Set();
    for (const invoice of invoices) {
      // Candidate generation is intentionally broad. Amount and reference signals
      // are scored only after date-valid candidates have been collected.
      const candidates = transactions.filter((t) => !used.has(t.id) && isBroadCandidate(invoice, t));
      const semanticQuery = buildSemanticQuery(invoice);
      const semanticPassages = candidates.map((t) => buildSemanticPassage(t));
      const semanticScores = await getSemanticScores(semanticQuery, semanticPassages);
      const ranked = candidates
        .map((t, index) => ({ t, ...score(invoice, t, semanticScores[index]) }))
        .sort((a, b) => b.scores.confidence - a.scores.confidence);
      if (!ranked.length) {
        const warning = { type: 'NO_TRANSACTION_FOUND', severity: 'HIGH' };
        await trx('exceptions').insert({ run_id: run.id, session_id: session.id, invoice_id: invoice.id, exception_type: warning.type, severity: warning.severity, description: 'No candidate bank transaction found.' });
        const reason = buildReason({ invoice, candidates: [] });
        await trx('reconciliation_matches').insert({
          run_id: run.id, session_id: session.id, invoice_id: invoice.id,
          transaction_id: null, amount_score: null, reference_score: null, name_score: null,
          semantic_score: null, date_score: null, confidence_score: 0, amount_difference: null,
          amount_difference_percent: null, match_type: 'UNMATCHED', status: 'PENDING_REVIEW',
          best_candidate: null, invoice_snapshot: invoice, transaction_snapshot: null,
          reason: { ...reason, scores: null, warnings: [warning] }
        });
        results.push({
          invoiceId: invoice.invoice_id,
          customerName: invoice.customer_name,
          amount: invoice.amount,
          invoiceDate: invoice.invoice_date,
          matchType: 'UNMATCHED',
          confidence: 0,
          scores: null,
          warnings: [warning],
          reason
        });
        continue;
      }
      let best = ranked[0];
      const grouped = best.scores.amount < 100 ? findPaymentCombination(invoice, candidates.map((t, index) => ({ transaction: t, scored: score(invoice, t, semanticScores[index]) }))) : null;
      if (grouped) {
        const total = grouped.transactions.reduce((sum, t) => sum.plus(t.amount || 0), new Decimal(0));
        best = { t: grouped.transactions[0], transactions: grouped.transactions, scores: grouped.scores, difference: total.minus(invoice.amount || 0).abs(), referenceExact: grouped.scores.reference === 100, days: Math.max(...grouped.transactions.map((t) => daysBetween(invoice.invoice_date, t.transaction_date))), warnings: [] };
        best.warnings.push({ type: 'MULTI_TRANSACTION_MATCH', severity: 'LOW', transactionIds: grouped.transactions.map((t) => t.id), transactionReferences: grouped.transactions.map((t) => t.transaction_id), paidAmount: total.toFixed(2) });
      }
      if (ranked.length > 1 && ranked[1].scores.confidence >= CONFIG.review) best.warnings.push({ type: 'MULTIPLE_POSSIBLE_MATCHES', severity: 'HIGH' });
      const auto = best.scores.amount === 100 && best.referenceExact;
      const partial = !grouped && best.scores.amount < 100 && new Decimal(best.t.amount || 0).lt(invoice.amount || 0);
      const matchType = grouped ? 'MULTI_TRANSACTION_MATCH' : partial ? 'PARTIAL_PAYMENT' : auto || best.scores.confidence >= CONFIG.auto ? 'AUTO_MATCH' : best.scores.confidence >= CONFIG.review ? 'MANUAL_REVIEW' : 'UNMATCHED';
      if (matchType !== 'AUTO_MATCH') best.warnings.push({ type: 'LOW_CONFIDENCE_MATCH', severity: 'MEDIUM' });
      const transactionIds = (best.transactions || [best.t]).map((t) => t.id);
      const reason = buildReason({ invoice, best, matchType, candidates });
      const bestCandidate = {
        transactionId: best.t.transaction_id,
        description: best.t.description,
        amount: best.transactions ? best.transactions.reduce((sum, item) => sum.plus(item.amount || 0), new Decimal(0)).toFixed(2) : best.t.amount,
        transactionDate: best.t.transaction_date,
        confidence: best.scores.confidence,
        scores: best.scores
      };
      await trx('reconciliation_matches').insert({
        run_id: run.id, session_id: session.id, invoice_id: invoice.id, transaction_id: best.t.id,
        amount_score: best.scores.amount, reference_score: best.scores.reference, name_score: best.scores.name,
        semantic_score: best.scores.semantic, date_score: best.scores.date, confidence_score: best.scores.confidence,
        amount_difference: best.difference.toFixed(2), amount_difference_percent: amountDifferencePercent(invoice.amount, best.transactions ? best.transactions.reduce((sum, item) => sum.plus(item.amount || 0), new Decimal(0)) : best.t.amount).toFixed(2),
        match_type: matchType, status: matchType === 'AUTO_MATCH' || matchType === 'MULTI_TRANSACTION_MATCH' ? 'MATCHED' : 'PENDING_REVIEW',
        best_candidate: matchType === 'UNMATCHED' ? bestCandidate : null,
        invoice_snapshot: invoice, transaction_snapshot: best.t,
        reason: { ...reason, scores: best.scores, warnings: best.warnings, days: best.days, transactionIds }
      });
       transactionIds.forEach((id) => used.add(id));
      for (const warning of best.warnings) {
        for (const transactionId of transactionIds) await trx('exceptions').insert({ run_id: run.id, session_id: session.id, invoice_id: invoice.id, transaction_id: transactionId, exception_type: warning.type, severity: warning.severity || 'MEDIUM', description: JSON.stringify({ ...warning, outstanding: partial ? new Decimal(invoice.amount || 0).minus(best.t.amount || 0).toFixed(2) : undefined }) });
        await trx('audit_log').insert({ action: 'RECONCILIATION_EXCEPTION_CREATED', table_name: 'exceptions', user_id: userId, new_value: { runId: run.run_id, invoiceId: invoice.invoice_id, transactionIds, exceptionType: warning.type, severity: warning.severity || 'MEDIUM' } });
      }
      const strongAlternates = ranked.filter((candidate) => candidate.t.id !== best.t.id && (candidate.scores.amount === 100 && candidate.referenceExact || candidate.scores.confidence >= CONFIG.auto));
      for (const alternate of strongAlternates) {
         const warning = { type: 'POSSIBLE_DUPLICATE_PAYMENT', severity: 'HIGH', transactionIds: [best.t.id, alternate.t.id], transactionReferences: [best.t.transaction_id, alternate.t.transaction_id] };
        await trx('exceptions').insert({ run_id: run.id, session_id: session.id, invoice_id: invoice.id, transaction_id: alternate.t.id, exception_type: warning.type, severity: warning.severity, description: JSON.stringify(warning) });
        await trx('audit_log').insert({ action: 'RECONCILIATION_EXCEPTION_CREATED', table_name: 'exceptions', user_id: userId, new_value: { runId: run.run_id, invoiceId: invoice.invoice_id, transactionIds: warning.transactionIds, exceptionType: warning.type, severity: warning.severity } });
      }
      await trx('audit_log').insert({ action: matchType === 'AUTO_MATCH' ? 'AUTO_MATCH_CREATED' : 'MANUAL_REVIEW_REQUIRED', table_name: 'reconciliation_matches', user_id: userId, new_value: { sessionId, invoiceId: invoice.invoice_id, transactionId: best.t.transaction_id, confidence: best.scores.confidence } });
      const row = {
        invoiceId: invoice.invoice_id,
        customerName: invoice.customer_name,
        amount: invoice.amount,
        invoiceDate: invoice.invoice_date,
        transactionId: best.t.transaction_id,
        transaction: {
          transactionId: best.t.transaction_id,
          description: best.t.description,
          amount: best.t.amount,
          transactionDate: best.t.transaction_date,
          bankAccount: best.t.bank_account ? `****${String(best.t.bank_account).slice(-4)}` : null
        },
        matchType,
        confidence: best.scores.confidence,
        scores: best.scores,
        amountDifference: best.difference.toFixed(2),
        warnings: best.warnings,
        reason,
        ...(matchType === 'UNMATCHED' ? {
          bestCandidate
        } : {})
      };
      results.push(row);
    }
     const summary = buildReconciliationResult({ totalInvoices: invoices.length, results, sessionId }).summary;
     const processingTime = Date.now() - startedAt;
     const averageConfidence = results.length ? results.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / results.length : 0;
     const matchRate = invoices.length ? ((summary.autoMatched + summary.manualReview + summary.partialPayments + summary.multiTransactionMatches) / invoices.length) * 100 : 0;
     const [{ count: persistedExceptionCount }] = await trx('exceptions').where({ run_id: run.id }).count('* as count');
     await trx('reconciliation_runs').where({ id: run.id }).update({
       status: 'COMPLETED', completed_at: trx.fn.now(), total_invoices: invoices.length,
       auto_matched_count: summary.autoMatched, manual_review_count: summary.manualReview,
       unmatched_count: summary.unmatched, exception_count: Number(persistedExceptionCount || 0),
       average_confidence: averageConfidence.toFixed(2), match_rate: matchRate.toFixed(2),
       processing_time_ms: processingTime, average_processing_time_ms: invoices.length ? (processingTime / invoices.length).toFixed(2) : 0
     });
     await trx('reconciliation_sessions').where({ id: session.id, user_id: userId }).update({ status: 'RECONCILED', updated_at: trx.fn.now() });
    await trx('audit_log').insert({ action: 'RECONCILIATION_COMPLETED', table_name: 'reconciliation_runs', record_id: run.id, user_id: userId, new_value: { sessionId } });
  });
  return buildReconciliationResult({
    totalInvoices: invoices.length,
    results,
    runId,
    sessionId
  });
}

function buildReconciliationResult({
  totalInvoices = 0,
  results = [],
  summary = {},
  runId = null,
  sessionId
}) {
  const safeResults = Array.isArray(results) ? results : [];
  return {
    totalInvoices,
    results: safeResults,
    summary: {
      autoMatched: summary.autoMatched ?? safeResults.filter((r) => r.matchType === 'AUTO_MATCH').length,
      manualReview: summary.manualReview ?? safeResults.filter((r) => r.matchType === 'MANUAL_REVIEW').length,
      unmatched: summary.unmatched ?? safeResults.filter((r) => r.matchType === 'UNMATCHED').length,
      partialPayments: summary.partialPayments ?? safeResults.filter((r) => r.matchType === 'PARTIAL_PAYMENT').length,
      multiTransactionMatches: summary.multiTransactionMatches ?? safeResults.filter((r) => r.matchType === 'MULTI_TRANSACTION_MATCH').length,
      exceptions: summary.exceptions ?? safeResults.reduce((count, result) => count + (Array.isArray(result.warnings) ? result.warnings.length : 0), 0)
    },
    weights: WEIGHTS,
    runId,
    sessionId
  };
}

function getReconciliationMetadata() {
  return {
    weights: { ...WEIGHTS },
    thresholds: { auto: CONFIG.auto, review: CONFIG.review }
  };
}
module.exports = {
  runReconciliation,
  normalize,
  compact,
  similarity,
  jaroWinkler,
  amountScore,
  amountDifferencePercent,
  dateScore,
  findPaymentCombination,
  score,
  buildSemanticQuery,
  buildSemanticPassage,
  getSemanticScores,
  isBroadCandidate,
  buildReconciliationResult,
  getReconciliationMetadata
};
