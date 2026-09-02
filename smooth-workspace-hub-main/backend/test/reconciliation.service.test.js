const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalize,
  similarity,
  jaroWinkler,
  amountScore,
  dateScore,
  findPaymentCombination,
  score,
  buildSemanticQuery,
  getSemanticScores
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
  assert.equal(amountScore('100000', '60000'), 60);
  assert.equal(dateScore(2), 100);
  assert.equal(dateScore(10), 75);
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
