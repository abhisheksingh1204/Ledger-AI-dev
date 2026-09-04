const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTax, validateTax } = require('../src/services/taxValidation.service');

test('validates generic tax without mislabeling it as GST', () => {
  const result = validateTax({ subtotal: '18300', tax_amount: '1647', amount: '20097' }, { extracted_data: { invoice: { tax_rate: 9, shipping: 150 } } });
  assert.equal(result.tax_type, 'GENERIC_TAX');
  assert.equal(result.validation_status, 'VALID');
  assert.equal(result.arithmetic.expected_total, '20097.00');
});

test('validates balanced intrastate GST lines', () => {
  const result = validateTax({ subtotal: '100000', tax_amount: '18000', amount: '118000' }, { extracted_data: { invoice: { taxable_amount: '100000', cgst_rate: 9, cgst_amount: 9000, sgst_rate: 9, sgst_amount: 9000 } } });
  assert.equal(result.tax_type, 'GST_INTRASTATE');
  assert.equal(result.validation_status, 'VALID');
  assert.equal(result.checks.filter((check) => check.status === 'PASS').length, 3);
});

test('reports tax rate and grand total mismatches deterministically', () => {
  const result = validateTax({ subtotal: '100000', tax_amount: '17500', amount: '117000' }, { extracted_data: { invoice: { taxable_amount: '100000', cgst_rate: 9, cgst_amount: 8500, sgst_rate: 9, sgst_amount: 9000 } } });
  assert.equal(result.validation_status, 'INVALID');
  assert.ok(result.exceptions.some((item) => item.exception_type === 'TAX_RATE_AMOUNT_MISMATCH'));
  assert.ok(result.exceptions.some((item) => item.exception_type === 'GRAND_TOTAL_MISMATCH'));
});

test('detects interstate GST and invalid combined GST structure', () => {
  const interstate = validateTax({ subtotal: '1000', tax_amount: '180', amount: '1180' }, { extracted_data: { invoice: { taxable_amount: '1000', igst_rate: 18, igst_amount: 180 } } });
  assert.equal(interstate.tax_type, 'GST_INTERSTATE');
  assert.equal(interstate.validation_status, 'VALID');
  const invalid = normalizeTax({}, { extracted_data: { invoice: { cgst_amount: 1, sgst_amount: 1, igst_amount: 1, taxable_amount: 10 } } });
  assert.equal(invalid.tax_type, 'GST');
});
