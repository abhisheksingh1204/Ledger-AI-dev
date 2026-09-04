const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addDays,
  buildForecast,
  calculateRiskScore,
  customerHistoricalBehavior,
  customerKey,
  forecastConfidence,
  historicalPaymentBehavior,
  isConfirmedMatch,
  median,
  normalizeCustomerName,
  resolveConfirmedInvoicePayments
} = require('../src/services/forecast.service');

const paidHistoryInvoices = [
  { id: 10, invoice_id: 'INV-A', invoice_number: 'INV-A', customer_name: 'ABC Technologies Pvt Ltd', amount: '100.00', currency: 'INR', due_date: '2026-01-10', status: 'PENDING' },
  { id: 11, invoice_id: 'INV-B', invoice_number: 'INV-B', customer_name: 'ABC Technologies Pvt. Ltd.', amount: '100.00', currency: 'INR', due_date: '2026-02-10', status: 'PENDING' },
  { id: 12, invoice_id: 'INV-C', invoice_number: 'INV-C', customer_name: 'ABC TECHNOLOGIES', amount: '100.00', currency: 'INR', due_date: '2026-03-10', status: 'PENDING' },
  { id: 13, invoice_id: 'INV-D', invoice_number: 'INV-D', customer_name: 'ABC Technologies', amount: '100.00', currency: 'INR', due_date: '2026-04-10', status: 'PENDING' }
];

const paidHistoryMatches = [
  { id: 10, invoice_id: 10, transaction_id: 110, match_type: 'AUTO_MATCH', status: 'MATCHED', matched_at: '2026-01-12', reason: { transactionIds: [110] } },
  { id: 11, invoice_id: 11, transaction_id: 111, match_type: 'AUTO_MATCH', status: 'MATCHED', matched_at: '2026-02-15', reason: { transactionIds: [111] } },
  { id: 12, invoice_id: 12, transaction_id: 112, match_type: 'AUTO_MATCH', status: 'MATCHED', matched_at: '2026-03-09', reason: { transactionIds: [112] } },
  { id: 13, invoice_id: 13, transaction_id: 113, match_type: 'AUTO_MATCH', status: 'MATCHED', matched_at: '2026-04-12', reason: { transactionIds: [113] } }
];

const paidHistoryTransactions = [
  { id: 110, transaction_id: 'TX-110', amount: '100.00', transaction_date: '2026-01-12' },
  { id: 111, transaction_id: 'TX-111', amount: '100.00', transaction_date: '2026-02-15' },
  { id: 112, transaction_id: 'TX-112', amount: '100.00', transaction_date: '2026-03-09' },
  { id: 113, transaction_id: 'TX-113', amount: '100.00', transaction_date: '2026-04-12' }
];

test('normalizes customer names for aggregation and computes historical delays from fully paid invoices', () => {
  assert.equal(normalizeCustomerName('ABC Technologies Pvt. Ltd.'), 'abc technologies');
  assert.equal(customerKey('ABC Technologies Pvt Ltd'), 'abc technologies');
  assert.equal(median([1, 9, 3]), 3);

  const behavior = historicalPaymentBehavior(paidHistoryInvoices, paidHistoryMatches, paidHistoryTransactions);
  const abc = behavior.get('abc technologies');

  assert.equal(abc.paidInvoiceCount, 4);
  assert.equal(abc.averagePaymentDelay, 2);
  assert.equal(abc.medianPaymentDelay, 2);
  assert.equal(abc.latePaymentRate, 75);
});

test('confirmed payment aggregation excludes pending review and includes approved manual matches', () => {
  const invoices = [
    { id: 1, invoice_id: 'INV-CONFIRMED', customer_name: 'Confirmed Co', amount: '100.00', currency: 'INR', due_date: '2026-09-10', status: 'PENDING' },
    { id: 2, invoice_id: 'INV-PARTIAL', customer_name: 'Partial Co', amount: '100.00', currency: 'INR', due_date: '2026-09-10', status: 'PENDING' },
    { id: 3, invoice_id: 'INV-MANUAL', customer_name: 'Manual Co', amount: '80.00', currency: 'INR', due_date: '2026-09-10', status: 'PENDING' },
    { id: 4, invoice_id: 'INV-PENDING', customer_name: 'Pending Co', amount: '70.00', currency: 'INR', due_date: '2026-09-10', status: 'PENDING' }
  ];
  const matches = [
    { id: 1, invoice_id: 1, transaction_id: 201, match_type: 'AUTO_MATCH', status: 'MATCHED', matched_at: '2026-09-04', reason: { transactionIds: [201] } },
    { id: 2, invoice_id: 2, transaction_id: 202, match_type: 'PARTIAL_PAYMENT', status: 'MATCHED', matched_at: '2026-09-04', reason: { transactionIds: [202] } },
    { id: 3, invoice_id: 3, transaction_id: 203, match_type: 'MANUAL_REVIEW', status: 'MATCHED', matched_at: '2026-09-04', reason: { transactionIds: [203] } },
    { id: 4, invoice_id: 4, transaction_id: 204, match_type: 'MANUAL_REVIEW', status: 'PENDING_REVIEW', matched_at: '2026-09-04', reason: { transactionIds: [204] } }
  ];
  const transactions = [
    { id: 201, transaction_id: 'TX-201', amount: '100.00', transaction_date: '2026-09-04' },
    { id: 202, transaction_id: 'TX-202', amount: '40.00', transaction_date: '2026-09-04' },
    { id: 203, transaction_id: 'TX-203', amount: '80.00', transaction_date: '2026-09-06' },
    { id: 204, transaction_id: 'TX-204', amount: '70.00', transaction_date: '2026-09-07' }
  ];

  const { rows } = buildForecast({ invoices, matches, transactions, exceptions: [], today: '2026-09-04' });

  assert.equal(rows.some((row) => row.invoice_id === 'INV-CONFIRMED'), false);
  assert.equal(rows.find((row) => row.invoice_id === 'INV-PARTIAL').outstanding_amount, '60.00');
  assert.equal(rows.some((row) => row.invoice_id === 'INV-MANUAL'), false);
  assert.equal(rows.find((row) => row.invoice_id === 'INV-PENDING').outstanding_amount, '70.00');
  assert.equal(isConfirmedMatch(matches[0]), true);
  assert.equal(isConfirmedMatch(matches[3]), false);
});

test('uses median delay for repeated customers and recalculates after reconciliation', () => {
  const before = historicalPaymentBehavior(
    paidHistoryInvoices.slice(0, 3),
    paidHistoryMatches.slice(0, 3),
    paidHistoryTransactions.slice(0, 3)
  );
  assert.equal(before.get('abc technologies').paidInvoiceCount, 3);
  assert.equal(before.get('abc technologies').medianPaymentDelay, 2);

  const after = historicalPaymentBehavior(paidHistoryInvoices, paidHistoryMatches, paidHistoryTransactions);
  assert.equal(after.get('abc technologies').paidInvoiceCount, 4);
  assert.equal(after.get('abc technologies').averagePaymentDelay, 2);

  const openInvoice = buildForecast({
    invoices: [...paidHistoryInvoices, { id: 50, invoice_id: 'INV-OPEN', customer_name: 'ABC Technologies Pvt. Ltd.', amount: '250.00', currency: 'INR', due_date: '2026-04-10', status: 'PENDING' }],
    matches: paidHistoryMatches,
    transactions: paidHistoryTransactions,
    exceptions: [],
    today: '2026-04-01'
  }).rows[0];

  assert.equal(openInvoice.expected_payment_date, '2026-04-12');
  assert.equal(openInvoice.days_until_expected, 11);
  assert.equal(openInvoice.bucket, 'DAYS_8_30');
});

test('places invoices into the correct non-overlapping forecast buckets and cumulative horizons', () => {
  const { rows, currency, summary, cumulative, buckets } = buildForecast({
    invoices: [
      { id: 1, invoice_id: 'INV-3', customer_name: 'A', amount: '10.00', currency: 'INR', due_date: '2026-09-07', status: 'PENDING' },
      { id: 2, invoice_id: 'INV-15', customer_name: 'B', amount: '20.00', currency: 'INR', due_date: '2026-09-19', status: 'PENDING' },
      { id: 3, invoice_id: 'INV-45', customer_name: 'C', amount: '30.00', currency: 'INR', due_date: '2026-10-19', status: 'PENDING' },
      { id: 4, invoice_id: 'INV-90', customer_name: 'D', amount: '40.00', currency: 'INR', due_date: '2026-12-03', status: 'PENDING' }
    ],
    matches: [],
    transactions: [],
    exceptions: [],
    today: '2026-09-04',
    defaultDelay: 0
  });

  assert.equal(currency, 'INR');
  assert.deepEqual(rows.map((row) => row.bucket), ['DAYS_0_7', 'DAYS_8_30', 'DAYS_31_60', 'BEYOND_60_DAYS']);
  assert.equal(summary.outstanding_total, '100.00');
  assert.equal(cumulative.within_7_days, '10.00');
  assert.equal(cumulative.within_30_days, '30.00');
  assert.equal(cumulative.within_60_days, '60.00');
  assert.equal(buckets.days_0_7, '10.00');
  assert.equal(buckets.days_8_30, '20.00');
  assert.equal(buckets.days_31_60, '30.00');
  assert.equal(buckets.beyond_60_days, '40.00');
});

test('handles overdue invoices separately from future inflow and applies configured recovery days', () => {
  const { rows, summary } = buildForecast({
    invoices: [
      { id: 1, invoice_id: 'INV-OVERDUE', customer_name: 'Overdue Co', amount: '200.00', currency: 'INR', due_date: '2026-08-25', status: 'PENDING' }
    ],
    matches: [],
    transactions: [],
    exceptions: [],
    today: '2026-09-04'
  });

  assert.equal(rows[0].classification, 'OVERDUE');
  assert.equal(rows[0].expected_payment_date, '2026-09-14');
  assert.equal(rows[0].bucket, 'DAYS_8_30');
  assert.equal(summary.overdue, '200.00');
  assert.equal(summary.expected, '0.00');
});

test('supports forecast confidence and risk scoring independently', () => {
  assert.equal(forecastConfidence(0), 'LOW');
  assert.equal(forecastConfidence(3), 'MEDIUM');
  assert.equal(forecastConfidence(5), 'HIGH');
  assert.equal(calculateRiskScore({ latePaymentRate: 100, overdueDays: 30, reconciliationConfidence: 0, exceptionCount: 3 }), 100);
});

test('derives confirmed payment amounts from unique linked transactions', () => {
  const invoices = [{ id: 1, invoice_id: 'INV-MULTI', customer_name: 'Multi Co', amount: '100.00', currency: 'INR', due_date: '2026-09-10', status: 'PENDING' }];
  const matches = [
    { id: 1, invoice_id: 1, transaction_id: 301, match_type: 'MULTI_TRANSACTION_MATCH', status: 'MATCHED', matched_at: '2026-09-04', reason: { transactionIds: [301, 302] } },
    { id: 2, invoice_id: 1, transaction_id: 302, match_type: 'MULTI_TRANSACTION_MATCH', status: 'MATCHED', matched_at: '2026-09-05', reason: { transactionIds: [301, 302] } }
  ];
  const transactions = [
    { id: 301, transaction_id: 'TX-301', amount: '60.00', transaction_date: '2026-09-04' },
    { id: 302, transaction_id: 'TX-302', amount: '40.00', transaction_date: '2026-09-05' }
  ];

  const paymentState = resolveConfirmedInvoicePayments(invoices, matches, transactions).byInvoice.get(1);
  assert.equal(paymentState.confirmedPaidAmount.toFixed(2), '100.00');
  assert.equal(paymentState.fullyPaid, true);
  assert.equal(paymentState.paymentDate, '2026-09-05');
});

test('uses customer behavior when deciding the expected payment date', () => {
  const invoices = [
    { id: 1, invoice_id: 'INV-H1', customer_name: 'History Co', amount: '100.00', currency: 'INR', due_date: '2026-01-10', status: 'PENDING' },
    { id: 2, invoice_id: 'INV-H2', customer_name: 'History Co', amount: '100.00', currency: 'INR', due_date: '2026-02-10', status: 'PENDING' },
    { id: 3, invoice_id: 'INV-H3', customer_name: 'History Co', amount: '100.00', currency: 'INR', due_date: '2026-03-10', status: 'PENDING' },
    { id: 4, invoice_id: 'INV-OPEN', customer_name: 'History Co', amount: '100.00', currency: 'INR', due_date: '2026-04-10', status: 'PENDING' }
  ];
  const matches = [
    { id: 1, invoice_id: 1, transaction_id: 401, match_type: 'AUTO_MATCH', status: 'MATCHED', matched_at: '2026-01-12', reason: { transactionIds: [401] } },
    { id: 2, invoice_id: 2, transaction_id: 402, match_type: 'AUTO_MATCH', status: 'MATCHED', matched_at: '2026-02-15', reason: { transactionIds: [402] } },
    { id: 3, invoice_id: 3, transaction_id: 403, match_type: 'AUTO_MATCH', status: 'MATCHED', matched_at: '2026-03-09', reason: { transactionIds: [403] } }
  ];
  const transactions = [
    { id: 401, transaction_id: 'TX-401', amount: '100.00', transaction_date: '2026-01-12' },
    { id: 402, transaction_id: 'TX-402', amount: '100.00', transaction_date: '2026-02-15' },
    { id: 403, transaction_id: 'TX-403', amount: '100.00', transaction_date: '2026-03-09' }
  ];

  const { rows } = buildForecast({ invoices, matches, transactions, exceptions: [], today: '2026-04-01' });
  const open = rows.find((row) => row.invoice_id === 'INV-OPEN');

  assert.equal(open.expected_payment_date, '2026-04-12');
  assert.equal(open.customer_delay_days, 2);
  assert.equal(open.days_until_expected, 11);
});
