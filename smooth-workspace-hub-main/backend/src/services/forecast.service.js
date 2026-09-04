const Decimal = require('decimal.js');
const db = require('../db/knex');

const DEFAULT_DELAY_DAYS = Number(process.env.FORECAST_DEFAULT_PAYMENT_DELAY_DAYS || 7);
const DEFAULT_OVERDUE_RECOVERY_DAYS = Number(process.env.FORECAST_DEFAULT_OVERDUE_RECOVERY_DAYS || 10);
const DEFAULT_CURRENCY = String(process.env.APP_DEFAULT_CURRENCY || 'INR').toUpperCase();
const RISK_WEIGHTS = { latePaymentRate: 0.35, overdueDays: 0.3, reconciliationRisk: 0.2, exceptions: 0.15 };
const CUSTOMER_SUFFIX_PATTERN = /\b(private|pvt|limited|ltd|inc|llc|corp|corporation|co|company)\b/gi;

function decimal(value) {
  try {
    return value === null || value === undefined || value === '' ? new Decimal(0) : new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}

function money(value) {
  return decimal(value).toFixed(2);
}

function isoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function dateAt(value) {
  const raw = String(value || '');
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(value, days) {
  const date = dateAt(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const left = dateAt(from);
  const right = dateAt(to);
  return left && right ? Math.round((right - left) / 86400000) : null;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeCustomerName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(CUSTOMER_SUFFIX_PATTERN, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function customerKey(value) {
  return normalizeCustomerName(value) || 'unknown';
}

function displayCustomerName(value) {
  return String(value || '').trim() || 'UNKNOWN';
}

function chooseDisplayName(existing, candidate) {
  const next = displayCustomerName(candidate);
  if (!existing) return next;
  if (!next) return existing;
  return next.length > existing.length ? next : existing;
}

function transactionIds(match) {
  return Array.isArray(match?.reason?.transactionIds) && match.reason.transactionIds.length
    ? match.reason.transactionIds
    : match?.transaction_id
      ? [match.transaction_id]
      : [];
}

function latestByInvoice(matches) {
  const latest = new Map();
  for (const match of matches) {
    const current = latest.get(match.invoice_id);
    const time = new Date(match.matched_at || 0).getTime() + Number(match.id || 0);
    const currentTime = current ? new Date(current.matched_at || 0).getTime() + Number(current.id || 0) : -1;
    if (!current || time >= currentTime) latest.set(match.invoice_id, match);
  }
  return latest;
}

function isConfirmedMatch(match) {
  const matchType = String(match?.match_type || '').toUpperCase();
  const status = String(match?.status || '').toUpperCase();
  return status === 'MATCHED' || matchType === 'AUTO_MATCH' || matchType === 'MULTI_TRANSACTION_MATCH';
}

function resolveConfirmedInvoicePayments(invoices, matches, transactions, tolerance = new Decimal('0.01')) {
  const transactionIndex = new Map(transactions.map((item) => [item.id, item]));
  const invoiceTransactionIds = new Map();

  for (const match of matches) {
    if (!isConfirmedMatch(match)) continue;
    if (match.invoice_id === null || match.invoice_id === undefined) continue;
    if (!invoiceTransactionIds.has(match.invoice_id)) {
      invoiceTransactionIds.set(match.invoice_id, new Set());
    }
    const set = invoiceTransactionIds.get(match.invoice_id);
    for (const id of transactionIds(match)) {
      if (transactionIndex.has(id)) {
        set.add(id);
      }
    }
  }

  const byInvoice = new Map();
  for (const invoice of invoices) {
    const ids = Array.from(invoiceTransactionIds.get(invoice.id) || []);
    const paidTransactions = ids.map((id) => transactionIndex.get(id)).filter(Boolean);
    const confirmedPaidAmount = paidTransactions.reduce((sum, item) => sum.plus(item.amount || 0), new Decimal(0));
    const outstanding = Decimal.max(decimal(invoice.amount).minus(confirmedPaidAmount), new Decimal(0));
    const paymentDate = paidTransactions.length
      ? paidTransactions.reduce((latest, item) => {
          if (!latest || !latest.transaction_date) return item;
          if (!item.transaction_date) return latest;
          return new Date(item.transaction_date) > new Date(latest.transaction_date) ? item : latest;
        }, null)?.transaction_date || null
      : null;

    byInvoice.set(invoice.id, {
      confirmedPaidAmount,
      outstanding,
      paymentDate,
      fullyPaid: confirmedPaidAmount.gt(0) && outstanding.lte(tolerance),
      transactionIds: ids
    });
  }

  return { byInvoice, transactionIndex };
}

function customerHistoricalBehavior(invoices, paymentStateMap) {
  const grouped = new Map();

  for (const invoice of invoices) {
    const state = paymentStateMap.get(invoice.id);
    if (!state?.fullyPaid || !state.paymentDate || !invoice.due_date) continue;
    const delay = daysBetween(invoice.due_date, state.paymentDate);
    if (delay === null) continue;

    const key = customerKey(invoice.customer_name);
    const current = grouped.get(key) || {
      customer: displayCustomerName(invoice.customer_name),
      delays: []
    };
    current.customer = chooseDisplayName(current.customer, invoice.customer_name);
    current.delays.push(delay);
    grouped.set(key, current);
  }

  return new Map(
    Array.from(grouped.entries(), ([key, item]) => [
      key,
      {
        customer: item.customer,
        averagePaymentDelay: Number((item.delays.reduce((sum, value) => sum + value, 0) / item.delays.length).toFixed(2)),
        medianPaymentDelay: Number(median(item.delays).toFixed(2)),
        paidInvoiceCount: item.delays.length,
        latePaymentRate: Number(((item.delays.filter((value) => value > 0).length / item.delays.length) * 100).toFixed(2)),
        delays: item.delays
      }
    ])
  );
}

function historicalPaymentBehavior(invoices, matches, transactions, tolerance = new Decimal('0.01')) {
  const { byInvoice } = resolveConfirmedInvoicePayments(invoices, matches, transactions, tolerance);
  return customerHistoricalBehavior(invoices, byInvoice);
}

function forecastConfidence(count) {
  return count >= 5 ? 'HIGH' : count >= 2 ? 'MEDIUM' : 'LOW';
}

function expectedDelay(behavior, defaultDelay = DEFAULT_DELAY_DAYS) {
  if (!behavior || behavior.paidInvoiceCount === 0) return defaultDelay;
  return behavior.paidInvoiceCount >= 3 ? behavior.medianPaymentDelay : behavior.averagePaymentDelay;
}

function calculateRiskScore({ latePaymentRate, overdueDays, reconciliationConfidence, exceptionCount }, weights = RISK_WEIGHTS) {
  const overdueRisk = Math.min(100, Math.max(0, overdueDays) / 30 * 100);
  const reconciliationRisk = reconciliationConfidence == null ? 50 : Math.max(0, 100 - Number(reconciliationConfidence));
  const exceptionRisk = Math.min(100, Math.max(0, exceptionCount) * 35);
  return Math.round(
    (
      Math.min(100, latePaymentRate) * weights.latePaymentRate +
      overdueRisk * weights.overdueDays +
      reconciliationRisk * weights.reconciliationRisk +
      exceptionRisk * weights.exceptions
    ) * 100
  ) / 100;
}

function riskLevel(score) {
  return score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';
}

function classification({ overdueDays, riskScore }) {
  return overdueDays > 0 ? 'OVERDUE' : riskScore >= 30 ? 'AT_RISK' : 'EXPECTED';
}

function bucketForDays(daysUntilExpected) {
  if (daysUntilExpected >= 0 && daysUntilExpected <= 7) return 'DAYS_0_7';
  if (daysUntilExpected <= 30) return 'DAYS_8_30';
  if (daysUntilExpected <= 60) return 'DAYS_31_60';
  return 'BEYOND_60_DAYS';
}

function buildForecast({
  invoices,
  matches,
  transactions,
  exceptions,
  today = isoDate(new Date()),
  from,
  to,
  defaultDelay = DEFAULT_DELAY_DAYS,
  overdueRecoveryDays = DEFAULT_OVERDUE_RECOVERY_DAYS,
  weights = RISK_WEIGHTS
}) {
  const latest = latestByInvoice(matches);
  const { byInvoice: paymentStateMap } = resolveConfirmedInvoicePayments(invoices, matches, transactions);
  const behavior = customerHistoricalBehavior(invoices, paymentStateMap);
  const rows = [];

  for (const invoice of invoices) {
    const status = String(invoice.status || '').toUpperCase();
    if (['CANCELLED', 'INVALID', 'DELETED'].includes(status)) continue;

    const dueDate = isoDate(invoice.due_date || invoice.invoice_date);
    if (!dueDate || (from && dueDate < from) || (to && dueDate > to)) continue;

    const paymentState = paymentStateMap.get(invoice.id) || {
      confirmedPaidAmount: new Decimal(0),
      outstanding: decimal(invoice.amount),
      paymentDate: null,
      fullyPaid: false,
      transactionIds: []
    };
    const confirmedPaidAmount = decimal(paymentState.confirmedPaidAmount);
    const outstanding = Decimal.max(decimal(invoice.amount).minus(confirmedPaidAmount), new Decimal(0));
    const latestMatch = latest.get(invoice.id);
    if (paymentState.fullyPaid || outstanding.lte(0) || ['PAID', 'RECONCILED', 'CANCELLED', 'INVALID', 'DELETED'].includes(status)) continue;

    const customerBehavior = behavior.get(customerKey(invoice.customer_name));
    const customerDelay = expectedDelay(customerBehavior, defaultDelay);
    const overdueDays = Math.max(0, daysBetween(dueDate, today) || 0);
    const expectedPaymentDate = overdueDays > 0
      ? addDays(today, Math.max(Number(customerDelay) || 0, overdueRecoveryDays))
      : addDays(dueDate, customerDelay);
    const daysUntilExpected = Math.max(0, daysBetween(today, expectedPaymentDate) || 0);
    const bucket = bucketForDays(daysUntilExpected);
    const invoiceExceptions = exceptions.filter((item) => item.invoice_id === invoice.id);
    const confidence = latestMatch?.confidence_score == null ? null : Number(latestMatch.confidence_score);
    const riskScore = calculateRiskScore(
      {
        latePaymentRate: customerBehavior?.latePaymentRate || 0,
        overdueDays,
        reconciliationConfidence: confidence,
        exceptionCount: invoiceExceptions.length
      },
      weights
    );
    const level = riskLevel(riskScore);
    const reasons = [];

    if (customerBehavior?.paidInvoiceCount) {
      reasons.push(
        `Customer ${customerBehavior.customer} historically pays ${Math.abs(customerBehavior.medianPaymentDelay)} days ${customerBehavior.medianPaymentDelay >= 0 ? 'late' : 'early'} (median)`
      );
    } else {
      reasons.push(`No customer payment history; default delay is ${defaultDelay} days`);
    }
    if (outstanding.gt(0) && overdueDays > 0) reasons.push(`${overdueDays} day(s) overdue`);
    if (latestMatch && !['AUTO_MATCH', 'MULTI_TRANSACTION_MATCH'].includes(String(latestMatch.match_type || '').toUpperCase())) {
      reasons.push(`Reconciliation is ${latestMatch.match_type}`);
    }
    if (invoiceExceptions.length) reasons.push(`${invoiceExceptions.length} unresolved exception(s)`);
    if (!invoiceExceptions.length && (!latestMatch || confidence == null || confidence >= 70) && overdueDays === 0 && riskScore < 30) {
      reasons.push('No material payment risk signals detected');
    }

    rows.push({
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number || invoice.invoice_id,
      customer_name: invoice.customer_name || null,
      currency: String(invoice.currency || DEFAULT_CURRENCY).toUpperCase(),
      invoice_total: money(invoice.amount),
      paid_amount: money(confirmedPaidAmount),
      confirmed_paid_amount: money(confirmedPaidAmount),
      outstanding_amount: money(outstanding),
      due_date: dueDate,
      expected_payment_date: expectedPaymentDate,
      customer_delay_days: Number(customerDelay || 0),
      historical_delay_days: Number(customerDelay || 0),
      days_until_expected: daysUntilExpected,
      bucket,
      risk_score: riskScore,
      risk_level: level,
      forecast_confidence: forecastConfidence(customerBehavior?.paidInvoiceCount || 0),
      classification: classification({ overdueDays, riskScore }),
      reconciliation_status: latestMatch?.match_type || (confirmedPaidAmount.gt(0) ? 'PARTIALLY_PAID' : 'UNMATCHED'),
      reconciliation_confidence: confidence,
      overdue_days: overdueDays,
      reason: reasons,
      forecast_debug: {
        invoice_number: invoice.invoice_number || invoice.invoice_id,
        due_date: dueDate,
        customer_delay_days: Number(customerDelay || 0),
        expected_payment_date: expectedPaymentDate,
        days_until_expected: daysUntilExpected,
        bucket,
        outstanding: Number(outstanding.toFixed(2))
      }
    });
  }

  const currencies = [...new Set(rows.map((row) => row.currency))];
  const primaryCurrency = currencies.length === 1 ? currencies[0] : currencies.length ? 'MULTI' : DEFAULT_CURRENCY;
  const summaryData = currencies.length === 1 ? summarizeCurrency(rows, currencies[0], today) : null;
  return {
    rows,
    behavior,
    currency: primaryCurrency,
    ...(summaryData || {})
  };
}

function summarizeCurrency(rows, currency, today = isoDate(new Date())) {
  const selected = rows.filter((row) => row.currency === currency);
  const outstanding = selected.reduce((sum, row) => sum.plus(row.outstanding_amount), new Decimal(0));
  const expected = selected.filter((row) => row.classification === 'EXPECTED').reduce((sum, row) => sum.plus(row.outstanding_amount), new Decimal(0));
  const atRisk = selected.filter((row) => row.classification === 'AT_RISK').reduce((sum, row) => sum.plus(row.outstanding_amount), new Decimal(0));
  const overdue = selected.filter((row) => row.classification === 'OVERDUE').reduce((sum, row) => sum.plus(row.outstanding_amount), new Decimal(0));
  const within = (days) =>
    selected
      .filter((row) => row.days_until_expected >= 0 && row.days_until_expected <= days)
      .reduce((sum, row) => sum.plus(row.outstanding_amount), new Decimal(0));
  const buckets = {
    days_0_7: new Decimal(0),
    days_8_30: new Decimal(0),
    days_31_60: new Decimal(0),
    beyond_60_days: new Decimal(0)
  };

  for (const row of selected) {
    if (row.bucket === 'DAYS_0_7') buckets.days_0_7 = buckets.days_0_7.plus(row.outstanding_amount);
    else if (row.bucket === 'DAYS_8_30') buckets.days_8_30 = buckets.days_8_30.plus(row.outstanding_amount);
    else if (row.bucket === 'DAYS_31_60') buckets.days_31_60 = buckets.days_31_60.plus(row.outstanding_amount);
    else buckets.beyond_60_days = buckets.beyond_60_days.plus(row.outstanding_amount);
  }

  return {
    currency,
    summary: {
      outstanding_total: money(outstanding),
      expected: money(expected),
      at_risk: money(atRisk),
      overdue: money(overdue)
    },
    cumulative: {
      within_7_days: money(within(7)),
      within_30_days: money(within(30)),
      within_60_days: money(within(60))
    },
    buckets: Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, money(value)]))
  };
}

async function getCashForecast({ userId, from, to, customer, currency, today = isoDate(new Date()) }) {
  const invoicesQuery = db('invoices').where({ user_id: userId });
  if (customer) invoicesQuery.whereILike('customer_name', `%${customer}%`);
  if (currency) invoicesQuery.where({ currency });
  const invoices = await invoicesQuery;
  const invoiceIds = invoices.map((item) => item.id);
  const matches = invoiceIds.length ? await db('reconciliation_matches').whereIn('invoice_id', invoiceIds).orderBy('id', 'asc') : [];
  const paymentIds = [...new Set(matches.flatMap((match) => transactionIds(match)))];
  const transactions = paymentIds.length ? await db('bank_transactions').where({ user_id: userId }).whereIn('id', paymentIds) : [];
  const exceptions = invoiceIds.length ? await db('exceptions').whereIn('invoice_id', invoiceIds).whereNull('resolved_at') : [];
  const { rows, behavior } = buildForecast({ invoices, matches, transactions, exceptions, today, from, to });
  const currencies = [...new Set(rows.map((row) => row.currency))];
  const summaries = Object.fromEntries(currencies.map((item) => [item, summarizeCurrency(rows, item, today)]));
  const primary = currencies.length === 1 ? summaries[currencies[0]] : null;

  return {
    generated_at: new Date().toISOString(),
    currency: currencies.length === 1 ? currencies[0] : 'MULTI',
    ...(primary || {}),
    currencies: summaries,
    invoices: rows,
    customer_behavior: Array.from(behavior.values()).flatMap((item) => {
      const relatedRows = rows.filter((row) => row.customer_name && customerKey(row.customer_name) === customerKey(item.customer));
      const currenciesForCustomer = [...new Set(relatedRows.map((row) => row.currency))];
      const groupedCurrencies = currenciesForCustomer.length ? currenciesForCustomer : [currencies[0] || DEFAULT_CURRENCY];

      return groupedCurrencies.map((rowCurrency) => ({
        customer: item.customer,
        currency: rowCurrency,
        avg_delay_days: item.averagePaymentDelay,
        median_delay_days: item.medianPaymentDelay,
        late_payment_rate: item.latePaymentRate,
        paid_invoice_count: item.paidInvoiceCount,
        outstanding: money(
          relatedRows
            .filter((row) => row.currency === rowCurrency)
            .reduce((sum, row) => sum.plus(row.outstanding_amount), new Decimal(0))
        )
      }));
    })
  };
}

module.exports = {
  DEFAULT_DELAY_DAYS,
  DEFAULT_OVERDUE_RECOVERY_DAYS,
  RISK_WEIGHTS,
  addDays,
  buildForecast,
  calculateRiskScore,
  classification,
  customerHistoricalBehavior,
  customerKey,
  daysBetween,
  expectedDelay,
  forecastConfidence,
  getCashForecast,
  historicalPaymentBehavior,
  isConfirmedMatch,
  latestByInvoice,
  median,
  money,
  normalizeCustomerName,
  resolveConfirmedInvoicePayments,
  riskLevel,
  summarizeCurrency,
  transactionIds
};
