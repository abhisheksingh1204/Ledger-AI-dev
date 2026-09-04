const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateBenchmark } = require('../src/services/benchmarkEvaluation.service');

test('evaluates correct, wrong, missed, and correct-unmatched results', () => {
  const result = evaluateBenchmark([
    { invoiceId: 'A', transactionId: 'T1' },
    { invoiceId: 'B', transactionId: 'T9' },
    { invoiceId: 'C' }
  ], {
    A: { expected_transaction_ids: ['T1'] },
    B: { expected_transaction_ids: ['T2'] },
    C: { expected_transaction_ids: [] },
    D: { expected_transaction_ids: ['T4'] }
  });
  assert.equal(result.correct_matches, 1);
  assert.equal(result.wrong_matches, 1);
  assert.equal(result.correct_unmatched, 1);
  assert.equal(result.missed_matches, 1);
  assert.equal(result.precision, 0.5);
  assert.equal(result.recall, 1 / 3);
  assert.ok(result.f1 > 0);
});
