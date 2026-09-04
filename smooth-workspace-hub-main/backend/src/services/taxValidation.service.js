const Decimal = require('decimal.js');
const db = require('../db/knex');
const { AppError } = require('../utils/api');

const AMOUNT_TOLERANCE = new Decimal(process.env.TAX_AMOUNT_TOLERANCE || '0.01');
const PERCENT_TOLERANCE = new Decimal(process.env.TAX_PERCENT_TOLERANCE || '0.01');

function valueOf(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function decimal(value) {
  try { return value === null || value === undefined || value === '' ? null : new Decimal(String(value).replace(/[^0-9.-]/g, '')); } catch { return null; }
}

function money(value) { return value === null ? null : value.toFixed(2); }
function percent(value) { return value === null ? null : value.toFixed(2); }
function closeEnough(left, right, tolerance = AMOUNT_TOLERANCE) { return left && right && left.minus(right).abs().lte(tolerance); }

function sourceInvoice(invoice, document) {
  return { ...(document?.extracted_data?.invoice || {}), ...(document?.extracted_data || {}), ...invoice };
}

function taxLinesFrom(source) {
  const supplied = valueOf(source.tax_lines, source.taxLines, source.taxes);
  if (Array.isArray(supplied)) {
    return supplied.map((line) => ({
      type: String(valueOf(line.type, line.name, line.tax_type) || 'TAX').toUpperCase(),
      rate: decimal(valueOf(line.rate, line.tax_rate, line.percentage)),
      amount: decimal(valueOf(line.amount, line.tax_amount, line.value)),
      taxable_amount: decimal(valueOf(line.taxable_amount, line.taxableAmount, line.base))
    }));
  }
  const componentLines = ['CGST', 'SGST', 'IGST', 'CESS', 'GST'].flatMap((type) => {
    const key = type.toLowerCase();
    const amount = decimal(valueOf(source[`${key}_amount`], type === 'GST' ? source.gst_amount : null));
    const rate = decimal(valueOf(source[`${key}_rate`], type === 'GST' ? source.gst_rate : null));
    return amount !== null || rate !== null ? [{ type, rate, amount, taxable_amount: decimal(valueOf(source[`${key}_taxable_amount`])) }] : [];
  });
  if (componentLines.length) return componentLines;
  const amount = decimal(valueOf(source.tax_amount, source.total_tax, source.tax));
  const rate = decimal(valueOf(source.tax_rate, source.tax_percentage));
  return amount !== null || rate !== null ? [{ type: 'TAX', rate, amount, taxable_amount: decimal(valueOf(source.taxable_amount, source.taxableAmount)) }] : [];
}

function detectTaxType(source, lines) {
  const text = JSON.stringify(source).toUpperCase();
  const hasCgst = lines.some((line) => line.type === 'CGST') || /\bCGST\b/.test(text);
  const hasSgst = lines.some((line) => line.type === 'SGST') || /\bSGST\b/.test(text);
  const hasIgst = lines.some((line) => line.type === 'IGST') || /\bIGST\b/.test(text);
  const hasGst = hasCgst || hasSgst || hasIgst || /\bGST(?:IN)?\b|\bHSN\b|\bSAC\b|PLACE OF SUPPLY/.test(text);
  if (hasCgst && hasSgst && !hasIgst) return 'GST_INTRASTATE';
  if (hasIgst && !hasCgst && !hasSgst) return 'GST_INTERSTATE';
  if (hasGst) return 'GST';
  if (valueOf(source.tax_amount, source.tax, source.total_tax, source.tax_rate) !== null) return 'GENERIC_TAX';
  return 'NONE';
}

function normalizeTax(invoice = {}, document = null) {
  const source = sourceInvoice(invoice, document);
  const lines = taxLinesFrom(source);
  const subtotal = decimal(valueOf(source.subtotal, source.sub_total));
  const shipping = decimal(valueOf(source.shipping, source.shipping_amount, source.freight)) || new Decimal(0);
  const discount = decimal(valueOf(source.discount, source.discount_amount)) || new Decimal(0);
  const otherCharges = decimal(valueOf(source.other_charges, source.otherCharges, source.other)) || new Decimal(0);
  const taxableAmount = decimal(valueOf(source.taxable_amount, source.taxableAmount));
  const grandTotal = decimal(valueOf(invoice.amount, source.total_amount, source.grand_total, source.total));
  const totalTax = decimal(valueOf(source.tax_amount, source.total_tax, source.tax)) || lines.reduce((sum, line) => sum.plus(line.amount || 0), new Decimal(0));
  const base = taxableAmount || (subtotal ? subtotal.minus(discount).plus(otherCharges) : null);
  return {
    tax_type: detectTaxType(source, lines), subtotal, shipping, discount, other_charges: otherCharges,
    taxable_amount: base, tax_lines: lines, total_tax: totalTax, grand_total: grandTotal,
    gstin: valueOf(source.gstin, source.seller_gstin, source.supplier_gstin, source.customer_gstin),
    hsn: valueOf(source.hsn, source.hsn_code), sac: valueOf(source.sac, source.sac_code),
    place_of_supply: valueOf(source.place_of_supply, source.placeOfSupply), source
  };
}

function validateTax(invoice = {}, document = null) {
  const tax = normalizeTax(invoice, document);
  const checks = [];
  const exceptions = [];
  const fail = (name, type, severity, expected, actual, why) => {
    checks.push({ name, status: 'FAIL', expected: money(expected), actual: money(actual), difference: expected && actual ? money(expected.minus(actual).abs()) : null, why });
    exceptions.push({ exception_type: type, severity, description: why });
  };
  const pass = (name, expected, actual) => checks.push({ name, status: 'PASS', expected: money(expected), actual: money(actual), difference: '0.00' });
  if (!tax.subtotal || !tax.grand_total || !tax.total_tax || !tax.taxable_amount) {
    return { ...publicTax(tax), validation_status: 'INSUFFICIENT_DATA', arithmetic: null, checks, exceptions: [{ exception_type: 'MISSING_TAX_FIELD', severity: 'MEDIUM', description: 'Subtotal, taxable amount, tax amount, and grand total are required for complete arithmetic validation.' }] };
  }
  const hasCgst = tax.tax_lines.some((line) => line.type === 'CGST');
  const hasSgst = tax.tax_lines.some((line) => line.type === 'SGST');
  const hasIgst = tax.tax_lines.some((line) => line.type === 'IGST');
  if (hasCgst && hasSgst && hasIgst) fail('GST structure', 'INVALID_GST_STRUCTURE', 'HIGH', new Decimal(0), new Decimal(1), 'CGST/SGST and IGST cannot all be present in the same tax structure.');
  for (const line of tax.tax_lines.filter((item) => item.type !== 'CESS')) {
    if (!line.rate || !line.amount) {
      fail(`${line.type} fields`, 'MISSING_TAX_FIELD', 'MEDIUM', new Decimal(0), new Decimal(1), `${line.type} rate and amount were not both detected.`);
      continue;
    }
    const expected = (line.taxable_amount || tax.taxable_amount).times(line.rate).div(100);
    if (closeEnough(expected, line.amount)) pass(`${line.type} calculation`, expected, line.amount);
    else fail(`${line.type} calculation`, 'TAX_RATE_AMOUNT_MISMATCH', 'HIGH', expected, line.amount, `The invoice lists taxable value ${money(line.taxable_amount || tax.taxable_amount)} and ${line.type} rate ${percent(line.rate)}%. Expected ${line.type} ${money(expected)}, but the invoice contains ${money(line.amount)}.`);
  }
  if (hasCgst && hasSgst) {
    const cgst = tax.tax_lines.find((line) => line.type === 'CGST');
    const sgst = tax.tax_lines.find((line) => line.type === 'SGST');
    if (cgst.rate && sgst.rate && cgst.rate.minus(sgst.rate).abs().gt(PERCENT_TOLERANCE)) fail('CGST and SGST rates', 'CGST_SGST_MISMATCH', 'MEDIUM', cgst.rate, sgst.rate, 'CGST and SGST rates are not balanced.');
    if (cgst.amount && sgst.amount && !closeEnough(cgst.amount, sgst.amount)) fail('CGST and SGST amounts', 'CGST_SGST_MISMATCH', 'MEDIUM', cgst.amount, sgst.amount, 'CGST and SGST amounts are not balanced.');
  }
  const lineTax = tax.tax_lines.reduce((sum, line) => sum.plus(line.amount || 0), new Decimal(0));
  if (tax.tax_lines.length && !closeEnough(lineTax, tax.total_tax)) fail('Total tax', 'TAX_TOTAL_MISMATCH', 'HIGH', lineTax, tax.total_tax, `The tax lines total ${money(lineTax)}, but the invoice total tax is ${money(tax.total_tax)}.`);
  const expectedTotal = tax.subtotal.minus(tax.discount).plus(tax.shipping).plus(tax.other_charges).plus(tax.total_tax);
  if (closeEnough(expectedTotal, tax.grand_total)) pass('Grand total', expectedTotal, tax.grand_total);
  else fail('Grand total', 'GRAND_TOTAL_MISMATCH', 'HIGH', expectedTotal, tax.grand_total, `Subtotal ${money(tax.subtotal)} minus discount ${money(tax.discount)} plus shipping ${money(tax.shipping)} plus other charges ${money(tax.other_charges)} plus tax ${money(tax.total_tax)} equals ${money(expectedTotal)}, not invoice total ${money(tax.grand_total)}.`);
  return { ...publicTax(tax), validation_status: exceptions.length ? 'INVALID' : 'VALID', arithmetic: { subtotal: money(tax.subtotal), taxable_amount: money(tax.taxable_amount), expected_tax: money(tax.total_tax), actual_tax: money(tax.total_tax), expected_total: money(expectedTotal), actual_total: money(tax.grand_total), difference: money(expectedTotal.minus(tax.grand_total)) }, checks, exceptions };
}

function publicTax(tax) {
  return { tax_type: tax.tax_type, subtotal: money(tax.subtotal), shipping: money(tax.shipping), discount: money(tax.discount), other_charges: money(tax.other_charges), taxable_amount: money(tax.taxable_amount), tax_lines: tax.tax_lines.map((line) => ({ type: line.type, rate: percent(line.rate), amount: money(line.amount), taxable_amount: money(line.taxable_amount) })), total_tax: money(tax.total_tax), grand_total: money(tax.grand_total), gstin: tax.gstin || null, hsn: tax.hsn || null, sac: tax.sac || null, place_of_supply: tax.place_of_supply || null };
}

async function getTaxValidation({ invoiceId, userId, persistExceptions = true }) {
  const invoice = await db('invoices').where({ invoice_id: invoiceId, user_id: userId }).first();
  if (!invoice) throw new AppError('INVOICE_NOT_FOUND', 'Invoice not found.', 404);
  const document = invoice.document_id ? await db('documents').where({ id: invoice.document_id, user_id: userId }).first() : null;
  const result = validateTax(invoice, document);
  if (persistExceptions && result.exceptions.length) {
    const existing = await db('exceptions').where({ invoice_id: invoice.id }).whereIn('exception_type', result.exceptions.map((item) => item.exception_type)).whereNull('resolved_at');
    const existingTypes = new Set(existing.map((item) => item.exception_type));
    const rows = result.exceptions.filter((item) => !existingTypes.has(item.exception_type)).map((item) => ({ invoice_id: invoice.id, session_id: invoice.session_id, exception_type: item.exception_type, severity: item.severity, description: item.description }));
    if (rows.length) await db('exceptions').insert(rows);
  }
  return { invoice, ...result, exceptions: result.exceptions };
}

module.exports = { getTaxValidation, normalizeTax, validateTax };
