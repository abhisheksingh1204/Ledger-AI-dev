const test = require('node:test');
const assert = require('node:assert/strict');
const { taxValidation, safeContext } = require('../src/services/aiFinance.service');

test('validates invoice tax arithmetic deterministically', () => {
  assert.equal(taxValidation({ subtotal: '100000', amount: '118000', tax_amount: '18000' }).status, 'VALID');
  assert.equal(taxValidation({ subtotal: '100000', amount: '119000', tax_amount: '18000' }).status, 'INVALID');
});
test('returns insufficient data without inventing tax values', () => assert.equal(taxValidation({ subtotal: '100000', amount: '118000' }).status, 'INSUFFICIENT_DATA'));
test('masks bank account data before AI context', () => assert.equal(safeContext({ invoice: {}, document: null, matches: [], exceptions: [], transactions: [{ bank_account: '1234567890' }] }).transactions[0].bank_account, '******7890'));
