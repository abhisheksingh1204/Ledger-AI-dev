const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalize,
  similarity,
  jaroWinkler,
  amountScore,
  amountDifferencePercent,
  dateScore,
  findPaymentCombination,
  score,
  buildSemanticQuery,
  getSemanticScores,
  isBroadCandidate,
  buildReconciliationResult,
  getReconciliationMetadata
} = require('../src/services/reconciliation.service');

test('normalizes invoice and company values', () => {
  assert.equal(normalize('ABC Technologies Pvt. Ltd.'), 'abc technologies');
  assert.equal(normalize('INV/2026-001'), 'inv 2026 001');
});
test('uses Levenshtein and Jaro-Winkler signals', () => {
  assert.ok(similarity('INV-1001', 'INV-1002') > 70);
  assert.ok(jaroWinkler('ABC Technologies', 'ABC Technologes') > 90);
});
test('uses Decimal-safe amount scoring and date scoring', () => {
  assert.equal(amountScore('100000.00', '100000'), 100);
  assert.equal(amountScore('20097', '20315'), 65);
  assert.equal(amountScore('20097', '22000'), 20);
  assert.equal(amountDifferencePercent('20097', '20315').toFixed(2), '1.08');
  assert.equal(dateScore(2), 100);
  assert.equal(dateScore(10), 75);
});

test('keeps a date-valid exact-reference candidate despite amount mismatch', () => {
  const invoice = {
    invoice_id: 'INV-2024-008743',
    invoice_date: '2024-09-15',
    amount: '20097.00',
    customer_name: 'Global Retail Inc.'
  };
  const transaction = {
    transaction_id: 'FSB-2024-445821',
    transaction_date: '2024-09-18',
    description: 'Global Retail Inc. settlement INV-2024-008743',
    reference: 'FSB-2024-445821',
    amount: '20315.00'
  };
  assert.equal(isBroadCandidate(invoice, transaction), true);
  const scored = score(invoice, transaction, 0);
  assert.equal(scored.referenceExact, true);
  assert.equal(scored.scores.reference, 100);
  assert.equal(scored.scores.name, 100);
  assert.equal(scored.scores.date, 100);
  assert.equal(scored.scores.amount, 65);
  assert.ok(scored.warnings.some((warning) => warning.type === 'AMOUNT_MISMATCH'));
  assert.equal(scored.days, 3);
});
test('finds bounded two and three transaction combinations', () => {
  const invoice = { amount: '100000' };
  const candidates = [40000, 30000, 30000, 60000].map((amount, index) => ({ transaction: { id: index, amount: String(amount) }, scored: { scores: { reference: 100, name: 90, date: 100 } } }));
  const result = findPaymentCombination(invoice, candidates);
  assert.deepEqual(result.transactions.map((t) => t.amount), ['40000', '30000', '30000']);
});

test('keeps deterministic scores stable when semantic similarity changes', () => {
  const invoice = { amount: '100.00', invoice_date: '2026-08-01', customer_name: 'ABC Technologies Pvt Ltd' };
  const transaction = {
    amount: '100.00',
    transaction_date: '2026-08-02',
    description: 'NEFT PAYMENT',
    reference: 'ABC1001'
  };

  const withoutSemantic = score(invoice, transaction, 0);
  const withSemantic = score(invoice, transaction, 100);

  assert.equal(withoutSemantic.scores.amount, withSemantic.scores.amount);
  assert.equal(withoutSemantic.scores.reference, withSemantic.scores.reference);
  assert.equal(withoutSemantic.scores.date, withSemantic.scores.date);
  assert.ok(withSemantic.scores.semantic > withoutSemantic.scores.semantic);
  assert.ok(withSemantic.scores.confidence > withoutSemantic.scores.confidence);
});

test('keeps exact references stronger than semantic similarity alone', () => {
  const invoice = { amount: '100.00', invoice_date: '2026-08-01', customer_name: 'ABC Technologies Pvt Ltd', invoice_id: 'INV-1001' };
  const exactReference = score(invoice, {
    amount: '100.00',
    transaction_date: '2026-08-02',
    description: 'bank transfer',
    reference: 'INV-1001'
  }, 0);
  const semanticOnly = score(invoice, {
    amount: '100.00',
    transaction_date: '2026-08-02',
    description: 'miscellaneous credit',
    reference: 'TXN-999'
  }, 100);

  assert.equal(exactReference.referenceExact, true);
  assert.equal(exactReference.scores.reference, 100);
  assert.ok(exactReference.scores.reference > semanticOnly.scores.reference);
});

test('requests batched semantic scores and preserves order', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.query, 'ABC Technologies Pvt Ltd');
    assert.deepEqual(body.passages, ['NEFT PAYMENT ABC Technologies', 'Closing balance update']);
    return {
      ok: true,
      json: async () => ({
        success: true,
        data: {
          scores: [
            { semantic_score: 82.5 },
            { semantic_score: 7.5 }
          ]
        }
      })
    };
  };

  try {
    const scores = await getSemanticScores('ABC Technologies Pvt Ltd', ['NEFT PAYMENT ABC Technologies', 'Closing balance update']);
    assert.deepEqual(scores, [82.5, 7.5]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('builds persisted-run counts from exactly one result per invoice', () => {
  const result = buildReconciliationResult({
    totalInvoices: 4,
    results: [
      { matchType: 'AUTO_MATCH' },
      { matchType: 'MANUAL_REVIEW' },
      { matchType: 'UNMATCHED' },
      { matchType: 'PARTIAL_PAYMENT' }
    ],
    runId: 'RUN-test',
    sessionId: 'REC-test'
  });
  assert.deepEqual(result.summary, {
    autoMatched: 1,
    manualReview: 1,
    unmatched: 1,
    partialPayments: 1,
    multiTransactionMatches: 0,
    exceptions: 0
  });
  assert.equal(result.totalInvoices, 4);
});

test('exposes the configured confidence weights and thresholds for run persistence', () => {
  const metadata = getReconciliationMetadata();
  assert.equal(Object.values(metadata.weights).reduce((sum, value) => sum + value, 0), 100);
  assert.ok(metadata.thresholds.auto >= metadata.thresholds.review);
});
