const test = require('node:test');
const assert = require('node:assert/strict');
const {
  taxValidation,
  safeContext,
  isTaxQuestion,
  classifyQuestion,
  deterministicFactAnswer,
  deterministicTaxAnswer,
  deterministicReconciliationAnswer,
  deterministicConfidenceAnswer
} = require('../src/services/aiFinance.service');

test('validates invoice tax arithmetic deterministically', () => {
  assert.equal(taxValidation({ subtotal: '100000', amount: '118000', tax_amount: '18000' }).status, 'VALID');
  assert.equal(taxValidation({ subtotal: '100000', amount: '119000', tax_amount: '18000' }).status, 'INVALID');
});
test('returns insufficient data without inventing tax values', () => assert.equal(taxValidation({ subtotal: '100000', amount: '118000' }).status, 'INSUFFICIENT_DATA'));
test('masks bank account data before AI context', () => assert.equal(safeContext({ invoice: {}, document: null, matches: [], exceptions: [], transactions: [{ bank_account: '1234567890' }] }).transactions[0].bank_account, '******7890'));
test('flags tax questions for RAG grounding', () => {
  assert.equal(isTaxQuestion('Is this GST calculation correct?'), true);
  assert.equal(isTaxQuestion('Explain the reconciliation result.'), false);
});
test('routes deterministic question categories without invoking external services', () => {
  assert.equal(classifyQuestion('What is the total amount?'), 'INVOICE_FACT');
  assert.equal(classifyQuestion('Why is this invoice unmatched?'), 'RECONCILIATION');
  assert.equal(classifyQuestion('Is the GST calculation mathematically correct?'), 'TAX_ARITHMETIC');
  assert.equal(classifyQuestion('Is this GST rate legally applicable?'), 'TAX_REGULATORY');
});
test('answers invoice facts from stored values', () => {
  assert.match(deterministicFactAnswer('What is the total amount?', { amount: '20097', currency: 'USD' }), /20097\.00 USD/);
  assert.match(deterministicFactAnswer('Who is the customer?', { customer_name: 'Global Retail Inc.' }), /Global Retail Inc/);
});
test('includes shipping in Decimal tax arithmetic and does not invent GST', () => {
  const validation = taxValidation({ subtotal: '18300', amount: '20097', tax_amount: '1647' }, { invoice: { shipping: '150', tax_amount: '1647' } });
  const result = deterministicTaxAnswer('Is the GST calculation mathematically correct?', { subtotal: '18300', amount: '20097', tax_amount: '1647' }, { extracted_data: { invoice: { shipping: '150', tax_amount: '1647' } } }, validation);
  assert.equal(validation.status, 'VALID');
  assert.match(result.answer, /does not contain GST-specific fields/);
  assert.match(result.answer, /18300\.00 \+ 1647\.00 \+ 150\.00 = 20097\.00/);
});
test('uses authoritative reconciliation state, candidate and signal scores', () => {
  const context = {
    invoice: { amount: '20097' },
    reconciliationSummary: {
      match_type: 'MANUAL_REVIEW', confidence_score: '86.02', amount_score: '40', reference_score: '100', name_score: '95', semantic_score: '88', date_score: '100',
      best_candidate: { transaction_id: 'FSB-1', amount: '20315' }, reason: { summary: 'Amount discrepancy', warnings: [{ type: 'AMOUNT_MISMATCH' }] }
    },
    exceptions: [{ exception_type: 'AMOUNT_MISMATCH' }]
  };
  const answer = deterministicReconciliationAnswer(context);
  assert.match(answer, /MANUAL_REVIEW/);
  assert.match(answer, /FSB-1/);
  assert.match(answer, /86\.02%/);
  assert.match(answer, /AMOUNT_MISMATCH/);
  assert.match(deterministicConfidenceAnswer(context), /Semantic: 88%/);
});
test('does not call an unreconciled invoice unmatched', () => {
  assert.match(deterministicReconciliationAnswer({ reconciliationSummary: null, invoice: {} }), /has not been reconciled yet/);
});
