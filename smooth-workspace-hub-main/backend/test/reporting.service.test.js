const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildInvoiceAnalytics,
  buildInvoiceStates,
  buildReportingPayload
} = require('../src/services/reporting.service');

const invoices = [
  {
    id: 1,
    invoice_id: 'INV-1001',
    customer_name: 'ABC Technologies',
    seller_name: 'ABC Technologies',
    amount: '50000.00',
    invoice_date: '2026-08-01',
    due_date: '2026-08-15'
  },
  {
    id: 2,
    invoice_id: 'INV-1002',
    customer_name: 'XYZ Retail',
    seller_name: 'ABC Technologies',
    amount: '50000.00',
    invoice_date: '2026-08-02',
    due_date: '2026-08-12'
  },
  {
    id: 3,
    invoice_id: 'INV-1003',
    customer_name: 'ABC Technologies',
    seller_name: 'ABC Technologies',
    amount: '100000.00',
    invoice_date: '2026-08-05',
    due_date: '2026-08-20'
  },
  {
    id: 4,
    invoice_id: 'INV-1004',
    customer_name: 'ABC Technologies',
    seller_name: 'ABC Technologies',
    amount: '100000.00',
    invoice_date: '2026-08-06',
    due_date: '2026-08-25'
  },
  {
    id: 5,
    invoice_id: 'INV-2001',
    customer_name: 'XYZ Retail',
    seller_name: 'XYZ Retail',
    amount: '50000.00',
    invoice_date: '2026-08-07',
    due_date: '2026-08-18'
  },
  {
    id: 6,
    invoice_id: 'INV-3001',
    customer_name: 'Late Corp',
    seller_name: 'Late Corp',
    amount: '75000.00',
    invoice_date: '2026-08-08',
    due_date: '2026-08-10'
  }
];

const transactions = [
  { id: 101, transaction_id: 'BTX-101', amount: '50000.00', transaction_date: '2026-08-01' },
  { id: 102, transaction_id: 'BTX-102', amount: '49500.00', transaction_date: '2026-08-02' },
  { id: 103, transaction_id: 'BTX-103', amount: '60000.00', transaction_date: '2026-08-05' },
  { id: 104, transaction_id: 'BTX-104', amount: '40000.00', transaction_date: '2026-08-06' },
  { id: 105, transaction_id: 'BTX-105', amount: '60000.00', transaction_date: '2026-08-06' },
  { id: 106, transaction_id: 'BTX-106', amount: '50000.00', transaction_date: '2026-08-07' },
  { id: 107, transaction_id: 'BTX-107', amount: '50000.00', transaction_date: '2026-08-07' }
];

const matches = [
  {
    id: 1,
    invoice_id: 1,
    transaction_id: 101,
    match_type: 'AUTO_MATCH',
    status: 'MATCHED',
    confidence_score: '96.00',
    matched_at: '2026-08-01T12:00:00Z',
    reason: { transactionIds: [101] }
  },
  {
    id: 2,
    invoice_id: 2,
    transaction_id: 102,
    match_type: 'MANUAL_REVIEW',
    status: 'PENDING_REVIEW',
    confidence_score: '68.00',
    matched_at: '2026-08-02T12:00:00Z',
    reason: { transactionIds: [102] },
    amount_difference: '500.00'
  },
  {
    id: 3,
    invoice_id: 3,
    transaction_id: 103,
    match_type: 'PARTIAL_PAYMENT',
    status: 'PENDING_REVIEW',
    confidence_score: '82.00',
    matched_at: '2026-08-05T12:00:00Z',
    reason: { transactionIds: [103] }
  },
  {
    id: 4,
    invoice_id: 4,
    transaction_id: 104,
    match_type: 'MULTI_TRANSACTION_MATCH',
    status: 'MATCHED',
    confidence_score: '93.00',
    matched_at: '2026-08-06T12:00:00Z',
    reason: { transactionIds: [104, 105] }
  },
  {
    id: 5,
    invoice_id: 5,
    transaction_id: 106,
    match_type: 'AUTO_MATCH',
    status: 'MATCHED',
    confidence_score: '98.00',
    matched_at: '2026-08-07T12:00:00Z',
    reason: { transactionIds: [106] }
  }
];

const exceptions = [
  {
    id: 1,
    invoice_id: 2,
    transaction_id: 102,
    exception_type: 'AMOUNT_MISMATCH',
    severity: 'HIGH',
    description: { difference: '500.00' },
    created_at: '2026-08-02T12:00:00Z'
  },
  {
    id: 2,
    invoice_id: 3,
    transaction_id: 103,
    exception_type: 'PARTIAL_PAYMENT',
    severity: 'HIGH',
    description: { outstanding: '40000.00' },
    created_at: '2026-08-05T12:00:00Z'
  },
  {
    id: 3,
    invoice_id: 4,
    transaction_id: 104,
    exception_type: 'MULTIPLE_POSSIBLE_MATCHES',
    severity: 'HIGH',
    description: {},
    created_at: '2026-08-06T12:00:00Z'
  },
  {
    id: 4,
    invoice_id: 5,
    transaction_id: 107,
    exception_type: 'POSSIBLE_DUPLICATE_PAYMENT',
    severity: 'HIGH',
    description: {},
    created_at: '2026-08-07T12:00:00Z'
  },
  {
    id: 5,
    invoice_id: 6,
    transaction_id: null,
    exception_type: 'NO_TRANSACTION_FOUND',
    severity: 'HIGH',
    description: {},
    created_at: '2026-08-08T12:00:00Z'
  }
];

test('builds a deterministic reconciliation dashboard from phase 3 records', () => {
  const report = buildReportingPayload({ invoices, transactions, matches, exceptions });

  assert.equal(report.overview.reconciliation.totalInvoices, 6);
  assert.equal(report.overview.reconciliation.reconciledInvoices, 3);
  assert.equal(report.overview.reconciliation.manualReviewInvoices, 1);
  assert.equal(report.overview.reconciliation.partialPayments, 1);
  assert.equal(report.overview.reconciliation.unmatchedInvoices, 1);
  assert.equal(report.overview.reconciliation.reconciliationRate, 50);
  assert.equal(report.overview.reconciliation.totalUnreconciledAmount, '115500.00');
  assert.equal(report.overview.financial.totalInvoiced, '425000.00');
  assert.equal(report.overview.financial.totalReceived, '309500.00');
  assert.equal(report.overview.financial.outstanding, '115500.00');
  assert.equal(report.overview.exceptions.AMOUNT_MISMATCH.count, 1);
  assert.equal(report.overview.exceptions.PARTIAL_PAYMENT.count, 1);
  assert.equal(report.overview.exceptions.POSSIBLE_DUPLICATE_PAYMENT.count, 1);
  assert.equal(report.overview.exceptions.NO_TRANSACTION_FOUND.count, 1);
  assert.equal(report.revenue.totalReceivedAmount, '309500.00');
  assert.equal(report.revenue.monthlyPayments[0].month, '2026-08');
  assert.equal(report.revenue.monthlyPayments[0].amount, '309500.00');
  assert.equal(report.customers[0].customerName, 'Late Corp');
  assert.equal(report.customers[0].outstandingAmount, '75000.00');
  assert.equal(report.customers[1].customerName, 'ABC Technologies');
  assert.equal(report.customers[1].outstandingAmount, '40000.00');
});

test('filters invoices by status and paginates report rows', () => {
  const invoiceStates = buildInvoiceStates(invoices, matches, transactions);
  const partial = buildInvoiceAnalytics(invoiceStates, exceptions, 'PARTIAL_PAYMENT', 1, 10);

  assert.equal(partial.pagination.total, 1);
  assert.equal(partial.items[0].invoiceId, 'INV-1003');
  assert.equal(partial.items[0].status, 'PARTIAL_PAYMENT');
  assert.equal(partial.items[0].outstandingAmount, '40000.00');
});
