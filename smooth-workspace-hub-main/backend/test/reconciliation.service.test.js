const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, similarity, jaroWinkler, amountScore, dateScore, findPaymentCombination } = require('../src/services/reconciliation.service');

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
