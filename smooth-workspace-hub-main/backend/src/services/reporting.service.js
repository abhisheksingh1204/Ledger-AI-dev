const Decimal = require('decimal.js');
const db = require('../db/knex');

const EXCEPTION_TYPES = [
  'AMOUNT_MISMATCH',
  'DATE_MISMATCH',
  'REFERENCE_MISMATCH',
  'NAME_MISMATCH',
  'PARTIAL_PAYMENT',
  'POSSIBLE_DUPLICATE_PAYMENT',
  'MULTIPLE_POSSIBLE_MATCHES',
  'NO_TRANSACTION_FOUND',
  'LOW_CONFIDENCE_MATCH'
];

function toDecimal(value) {
  if (value === null || value === undefined || value === '') {
    return new Decimal(0);
  }

  try {
    return new Decimal(value);
  } catch (error) {
    return new Decimal(0);
  }
}

function moneyString(value) {
  return toDecimal(value).toFixed(2);
}

function percent(value) {
  return Number(toDecimal(value).toFixed(2));
}

function daysBetween(left, right) {
  const a = new Date(left);
  const b = new Date(right);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return null;
  }

  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function parseDateBound(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function applyDateRange(builder, column, from, to) {
  const start = parseDateBound(from);
  const end = parseDateBound(to);
  if (start && end) {
    builder.whereBetween(column, [start, end]);
  } else if (start) {
    builder.where(column, '>=', start);
  } else if (end) {
    builder.where(column, '<=', end);
  }
}

function resolveTransactionIds(match) {
  const fromReason = match?.reason?.transactionIds;
  if (Array.isArray(fromReason) && fromReason.length > 0) {
    return fromReason;
  }

  return match?.transaction_id ? [match.transaction_id] : [];
}

function getLatestRecordByKey(rows, keySelector, sortSelector) {
  const map = new Map();
  for (const row of rows) {
    const key = keySelector(row);
    if (key === null || key === undefined) {
      continue;
    }

    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }

    if (sortSelector(row) >= sortSelector(existing)) {
      map.set(key, row);
    }
  }

  return map;
}

async function loadReportingFacts({ userId, from, to, dbClient = db }) {
  const invoicesQuery = dbClient('invoices').where({ user_id: userId });
  applyDateRange(invoicesQuery, 'invoice_date', from, to);
  const invoices = await invoicesQuery.orderBy([{ column: 'invoice_date', order: 'asc' }, { column: 'id', order: 'asc' }]);

  const transactionsQuery = dbClient('bank_transactions').where({ user_id: userId });
  applyDateRange(transactionsQuery, 'transaction_date', from, to);
  const transactions = await transactionsQuery.orderBy([{ column: 'transaction_date', order: 'asc' }, { column: 'id', order: 'asc' }]);

  const invoiceIds = invoices.map((invoice) => invoice.id);
  const matches = invoiceIds.length
    ? await dbClient('reconciliation_matches as rm')
        .join('invoices as i', 'i.id', 'rm.invoice_id')
        .where('i.user_id', userId)
        .modify((builder) => {
          if (invoiceIds.length) {
            builder.whereIn('rm.invoice_id', invoiceIds);
          }
          applyDateRange(builder, 'rm.matched_at', from, to);
        })
        .select('rm.*')
        .orderBy([{ column: 'rm.matched_at', order: 'asc' }, { column: 'rm.id', order: 'asc' }])
    : [];

  const exceptions = invoiceIds.length
    ? await dbClient('exceptions as e')
        .join('invoices as i', 'i.id', 'e.invoice_id')
        .where('i.user_id', userId)
        .modify((builder) => {
          if (invoiceIds.length) {
            builder.whereIn('e.invoice_id', invoiceIds);
          }
          applyDateRange(builder, 'e.created_at', from, to);
        })
        .select('e.*')
        .orderBy([{ column: 'e.created_at', order: 'asc' }, { column: 'e.id', order: 'asc' }])
    : [];

  return { invoices, transactions, matches, exceptions };
}

function deriveInvoiceState(invoice, latestMatch, transactionIndex) {
  const matchedTransactionIds = latestMatch ? resolveTransactionIds(latestMatch) : [];
  const matchedTransactions = matchedTransactionIds
    .map((id) => transactionIndex.get(id))
    .filter(Boolean);
  const received = matchedTransactions.reduce((sum, transaction) => sum.plus(transaction.amount || 0), new Decimal(0));
  const invoiceAmount = toDecimal(invoice.amount);
  const outstanding = Decimal.max(invoiceAmount.minus(received), new Decimal(0));
  const paymentDate = matchedTransactions.length
    ? matchedTransactions.reduce((latest, transaction) => {
        if (!latest || !latest.transaction_date) {
          return transaction;
        }
        return new Date(transaction.transaction_date) > new Date(latest.transaction_date)
          ? transaction
          : latest;
      }, null)
    : null;

  const receivedPositive = received.gt(0);
  const fullyPaid = receivedPositive && outstanding.lte(0.01);
  const status = !latestMatch
    ? 'UNMATCHED'
    : latestMatch.match_type === 'AUTO_MATCH' || latestMatch.match_type === 'MULTI_TRANSACTION_MATCH'
      ? 'RECONCILED'
      : latestMatch.match_type === 'MANUAL_REVIEW' ||
            latestMatch.match_type === 'LOW_CONFIDENCE_MATCH' ||
            latestMatch.match_type === 'MULTIPLE_POSSIBLE_MATCHES'
          ? 'MANUAL_REVIEW'
          : latestMatch.match_type === 'PARTIAL_PAYMENT' || (receivedPositive && !fullyPaid)
            ? 'PARTIAL_PAYMENT'
          : 'UNMATCHED';

  const paymentDelayDays =
    paymentDate && invoice.invoice_date ? daysBetween(invoice.invoice_date, paymentDate.transaction_date) : null;

  return {
    invoice,
    latestMatch,
    matchedTransactionIds,
    matchedTransactions,
    received,
    outstanding,
    status,
    paymentDelayDays,
    fullyPaid,
    paymentDate: paymentDate ? paymentDate.transaction_date : null
  };
}

function buildInvoiceView(state) {
  const { invoice, latestMatch, received, outstanding, status, paymentDelayDays, paymentDate } = state;
  return {
    invoiceId: invoice.invoice_id,
    invoiceNumber: invoice.invoice_number || invoice.invoice_id,
    customerName: invoice.customer_name || null,
    sellerName: invoice.seller_name || null,
    amount: moneyString(invoice.amount),
    receivedAmount: moneyString(received),
    outstandingAmount: moneyString(outstanding),
    invoiceDate: invoice.invoice_date || null,
    dueDate: invoice.due_date || null,
    paymentDate,
    paymentDelayDays,
    status,
    matchType: latestMatch?.match_type || null,
    confidence: latestMatch?.confidence_score ? Number(latestMatch.confidence_score) : null,
    exceptionCount: 0
  };
}

function buildInvoiceStates(invoices, matches, transactions) {
  const latestMatchByInvoice = getLatestRecordByKey(
    matches,
    (match) => match.invoice_id,
    (match) => new Date(match.matched_at || 0).getTime() + (match.id || 0)
  );
  const transactionIndex = new Map(transactions.map((transaction) => [transaction.id, transaction]));

  return invoices.map((invoice) => {
    const latestMatch = latestMatchByInvoice.get(invoice.id) || null;
    return deriveInvoiceState(invoice, latestMatch, transactionIndex);
  });
}

function countStatuses(invoiceStates) {
  const summary = {
    reconciled: 0,
    manualReview: 0,
    unmatched: 0,
    partialPayments: 0
  };

  for (const state of invoiceStates) {
    if (state.status === 'RECONCILED') {
      summary.reconciled += 1;
    } else if (state.status === 'MANUAL_REVIEW') {
      summary.manualReview += 1;
    } else if (state.status === 'PARTIAL_PAYMENT') {
      summary.partialPayments += 1;
    } else {
      summary.unmatched += 1;
    }
  }

  return summary;
}

function getUniqueTransactionIdsFromStates(invoiceStates) {
  const ids = new Set();
  for (const state of invoiceStates) {
    for (const transactionId of state.matchedTransactionIds) {
      ids.add(transactionId);
    }
  }
  return ids;
}

function buildOverviewReport(invoiceStates, transactions, exceptions, matches) {
  const totals = invoiceStates.reduce(
    (acc, state) => {
      const invoiceAmount = toDecimal(state.invoice.amount);
      acc.totalInvoices += 1;
      acc.totalInvoiceValue = acc.totalInvoiceValue.plus(invoiceAmount);
      acc.totalUnreconciledAmount = acc.totalUnreconciledAmount.plus(state.outstanding);
      acc.confidenceSum = acc.confidenceSum.plus(state.latestMatch?.confidence_score || 0);
      if (state.latestMatch) {
        acc.confidenceCount += 1;
      }
      if (state.status === 'RECONCILED') {
        acc.reconciled += 1;
      } else if (state.status === 'MANUAL_REVIEW') {
        acc.manualReview += 1;
      } else if (state.status === 'PARTIAL_PAYMENT') {
        acc.partialPayments += 1;
      } else {
        acc.unmatched += 1;
      }
      return acc;
    },
    {
      totalInvoices: 0,
      totalInvoiceValue: new Decimal(0),
      reconciled: 0,
      manualReview: 0,
      unmatched: 0,
      partialPayments: 0,
      confidenceSum: new Decimal(0),
      confidenceCount: 0,
      totalUnreconciledAmount: new Decimal(0)
    }
  );

  const matchedTransactionIds = getUniqueTransactionIdsFromStates(invoiceStates);
  const uniqueReceivedTransactions = transactions.filter((transaction) => matchedTransactionIds.has(transaction.id));
  const totalReceivedAmount = uniqueReceivedTransactions.reduce(
    (sum, transaction) => sum.plus(transaction.amount || 0),
    new Decimal(0)
  );
  const paidInvoices = invoiceStates.filter((state) => state.status === 'RECONCILED').length;
  const unpaidInvoices = invoiceStates.filter((state) => state.status === 'UNMATCHED').length;
  const partiallyPaidInvoices = invoiceStates.filter((state) => state.status === 'PARTIAL_PAYMENT').length;
  const overdueInvoices = invoiceStates.filter((state) => {
    if (!state.invoice.due_date) {
      return false;
    }
    const dueDate = new Date(state.invoice.due_date);
    if (Number.isNaN(dueDate.getTime())) {
      return false;
    }
    return dueDate < new Date() && state.outstanding.gt(0);
  }).length;
  const paymentDelays = invoiceStates
    .filter((state) => state.paymentDelayDays !== null && state.paymentDelayDays !== undefined)
    .map((state) => state.paymentDelayDays);

  const averagePaymentDelay =
    paymentDelays.length > 0
      ? Number((paymentDelays.reduce((sum, value) => sum + value, 0) / paymentDelays.length).toFixed(2))
      : 0;

  const duplicateWarnings = Array.from(
    new Set(exceptions.filter((item) => item.exception_type === 'POSSIBLE_DUPLICATE_PAYMENT').map((item) => `${item.invoice_id || 'NA'}:${item.transaction_id || 'NA'}`))
  ).length;

  return {
    reconciliation: {
      totalInvoices: totals.totalInvoices,
      reconciledInvoices: totals.reconciled,
      manualReviewInvoices: totals.manualReview,
      unmatchedInvoices: totals.unmatched,
      partialPayments: totals.partialPayments,
      duplicatePaymentWarnings: duplicateWarnings,
      reconciliationRate: totals.totalInvoices ? percent((totals.reconciled / totals.totalInvoices) * 100) : 0,
      averageConfidenceScore: totals.confidenceCount ? percent(totals.confidenceSum.div(totals.confidenceCount)) : 0,
      totalUnreconciledAmount: moneyString(totals.totalUnreconciledAmount)
    },
    financial: {
      totalInvoiced: moneyString(totals.totalInvoiceValue),
      totalReceived: moneyString(totalReceivedAmount),
      outstanding: moneyString(totals.totalUnreconciledAmount),
      totalReceivedAmount: moneyString(totalReceivedAmount),
      paidInvoices,
      unpaidInvoices,
      partiallyPaidInvoices,
      overdueInvoices,
      averagePaymentDelay
    },
    exceptions: summarizeExceptionAnalytics(exceptions, invoiceStates)
  };
}

function summarizeExceptionAnalytics(exceptions, invoiceStates) {
  const invoiceStateById = new Map(invoiceStates.map((state) => [state.invoice.id, state]));
  const summary = {};

  for (const type of EXCEPTION_TYPES) {
    summary[type] = {
      count: 0,
      monetaryImpact: '0.00'
    };
  }

  for (const exception of exceptions) {
    const bucket = summary[exception.exception_type] || { count: 0, monetaryImpact: '0.00' };
    bucket.count += 1;

    const state = invoiceStateById.get(exception.invoice_id);
    const impact =
      exception.exception_type === 'PARTIAL_PAYMENT' || exception.exception_type === 'AMOUNT_MISMATCH'
        ? state?.outstanding || new Decimal(0)
        : exception.exception_type === 'POSSIBLE_DUPLICATE_PAYMENT'
          ? toDecimal(state?.invoice?.amount)
          : toDecimal(exception.description && exception.description.amount_difference ? exception.description.amount_difference : 0);

    bucket.monetaryImpact = moneyString(toDecimal(bucket.monetaryImpact).plus(impact));
    summary[exception.exception_type] = bucket;
  }

  return summary;
}

function buildCustomerAnalytics(invoiceStates) {
  const groups = new Map();

  for (const state of invoiceStates) {
    const key = state.invoice.customer_name || 'UNKNOWN';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(state);
  }

  return Array.from(groups.entries()).map(([customerName, states]) => {
    const totalInvoiced = states.reduce((sum, state) => sum.plus(state.invoice.amount || 0), new Decimal(0));
    const totalReceived = states.reduce((sum, state) => sum.plus(state.received), new Decimal(0));
    const outstanding = states.reduce((sum, state) => sum.plus(state.outstanding), new Decimal(0));
    const invoiceCount = states.length;
    const paidInvoiceCount = states.filter((state) => state.status === 'RECONCILED').length;
    const overdueInvoiceCount = states.filter((state) => {
      if (!state.invoice.due_date) {
        return false;
      }
      const dueDate = new Date(state.invoice.due_date);
      return !Number.isNaN(dueDate.getTime()) && dueDate < new Date() && state.outstanding.gt(0);
    }).length;
    const paymentDelays = states
      .filter((state) => state.paymentDelayDays !== null && state.paymentDelayDays !== undefined)
      .map((state) => state.paymentDelayDays);
    const reconciliationFailureCount = states.filter((state) => state.status !== 'RECONCILED').length;

    return {
      customerName,
      totalInvoiced: moneyString(totalInvoiced),
      totalReceived: moneyString(totalReceived),
      outstandingAmount: moneyString(outstanding),
      invoiceCount,
      paidInvoiceCount,
      overdueInvoiceCount,
      averagePaymentDelay:
        paymentDelays.length > 0
          ? Number((paymentDelays.reduce((sum, value) => sum + value, 0) / paymentDelays.length).toFixed(2))
          : 0,
      reconciliationFailureCount
    };
  }).sort((left, right) => toDecimal(right.outstandingAmount).cmp(left.outstandingAmount));
}

function buildRevenueAnalytics(invoiceStates, transactions, from, to) {
  const matchedTransactionIds = getUniqueTransactionIdsFromStates(invoiceStates);
  const matchedTransactions = transactions.filter((transaction) => matchedTransactionIds.has(transaction.id));
  const groupedByMonth = new Map();

  for (const transaction of matchedTransactions) {
    const transactionDate = new Date(transaction.transaction_date || transaction.created_at || new Date());
    if (Number.isNaN(transactionDate.getTime())) {
      continue;
    }

    const monthKey = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, '0')}`;
    if (!groupedByMonth.has(monthKey)) {
      groupedByMonth.set(monthKey, new Decimal(0));
    }
    groupedByMonth.set(monthKey, groupedByMonth.get(monthKey).plus(transaction.amount || 0));
  }

  const monthlyPayments = Array.from(groupedByMonth.entries()).map(([month, amount]) => ({
    month,
    amount: moneyString(amount)
  }));

  return {
    from: from || null,
    to: to || null,
    totalReceivedAmount: moneyString(matchedTransactions.reduce((sum, transaction) => sum.plus(transaction.amount || 0), new Decimal(0))),
    monthlyPayments,
    paidInvoices: invoiceStates.filter((state) => state.status === 'RECONCILED').length,
    unpaidInvoices: invoiceStates.filter((state) => state.status === 'UNMATCHED').length,
    partiallyPaidInvoices: invoiceStates.filter((state) => state.status === 'PARTIAL_PAYMENT').length,
    overdueInvoices: invoiceStates.filter((state) => state.status !== 'RECONCILED' && state.outstanding.gt(0)).length,
    outstandingAmount: moneyString(invoiceStates.reduce((sum, state) => sum.plus(state.outstanding), new Decimal(0))),
    averagePaymentDelay:
      invoiceStates.filter((state) => state.paymentDelayDays !== null && state.paymentDelayDays !== undefined).length > 0
        ? Number(
            (
              invoiceStates
                .filter((state) => state.paymentDelayDays !== null && state.paymentDelayDays !== undefined)
                .reduce((sum, state) => sum + state.paymentDelayDays, 0) /
              invoiceStates.filter((state) => state.paymentDelayDays !== null && state.paymentDelayDays !== undefined).length
            ).toFixed(2)
          )
        : 0
  };
}

function buildInvoiceAnalytics(invoiceStates, exceptions, statusFilter, page = 1, limit = 50) {
  const filtered = statusFilter
    ? invoiceStates.filter((state) => state.status === String(statusFilter).toUpperCase())
    : invoiceStates;
  const total = filtered.length;
  const start = (page - 1) * limit;
  const end = start + limit;
  const items = filtered.slice(start, end).map((state) => {
    const exceptionCount = exceptions.filter((exception) => exception.invoice_id === state.invoice.id).length;
    return {
      ...buildInvoiceView(state),
      exceptionCount
    };
  });

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  };
}

function buildExceptionAnalytics(exceptions, invoiceStates) {
  const grouped = new Map();
  const stateByInvoiceId = new Map(invoiceStates.map((state) => [state.invoice.id, state]));

  for (const type of EXCEPTION_TYPES) {
    grouped.set(type, { exceptionType: type, count: 0, monetaryImpact: '0.00' });
  }

  for (const exception of exceptions) {
    const group = grouped.get(exception.exception_type) || {
      exceptionType: exception.exception_type,
      count: 0,
      monetaryImpact: '0.00'
    };
    group.count += 1;

    const state = stateByInvoiceId.get(exception.invoice_id);
    const impact =
      exception.exception_type === 'PARTIAL_PAYMENT' || exception.exception_type === 'AMOUNT_MISMATCH'
        ? state?.outstanding || new Decimal(0)
        : exception.exception_type === 'POSSIBLE_DUPLICATE_PAYMENT'
          ? toDecimal(state?.invoice?.amount)
          : new Decimal(0);
    group.monetaryImpact = moneyString(toDecimal(group.monetaryImpact).plus(impact));
    grouped.set(exception.exception_type, group);
  }

  return Array.from(grouped.values());
}

function buildCustomerReport(invoiceStates, page = 1, limit = 50) {
  const analytics = buildCustomerAnalytics(invoiceStates);
  const total = analytics.length;
  const start = (page - 1) * limit;
  const end = start + limit;

  return {
    items: analytics.slice(start, end),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  };
}

function buildReconciliationReport(invoiceStates, matches, exceptions) {
  const overview = buildOverviewReport(invoiceStates, [], exceptions, matches);
  return {
    ...overview.reconciliation,
    exceptionCounts: buildExceptionAnalytics(exceptions, invoiceStates)
  };
}

function buildReportingPayload({ invoices, transactions, matches, exceptions }) {
  const invoiceStates = buildInvoiceStates(invoices, matches, transactions);
  return {
    overview: buildOverviewReport(invoiceStates, transactions, exceptions, matches),
    reconciliation: buildReconciliationReport(invoiceStates, matches, exceptions),
    revenue: buildRevenueAnalytics(invoiceStates, transactions),
    customers: buildCustomerAnalytics(invoiceStates),
    exceptions: buildExceptionAnalytics(exceptions, invoiceStates),
    invoiceStates
  };
}

async function getReports({ userId, from, to, status, page = 1, limit = 50, dbClient = db }) {
  const facts = await loadReportingFacts({ userId, from, to, dbClient });
  const payload = buildReportingPayload(facts);

  return {
    overview: payload.overview,
    reconciliation: payload.reconciliation,
    revenue: buildRevenueAnalytics(payload.invoiceStates, facts.transactions, from, to),
    customers: buildCustomerReport(payload.invoiceStates, page, limit),
    exceptions: buildExceptionAnalytics(facts.exceptions, payload.invoiceStates),
    invoices: buildInvoiceAnalytics(payload.invoiceStates, facts.exceptions, status, page, limit),
    invoiceStates: payload.invoiceStates,
    facts
  };
}

function buildCsv(rows, headers) {
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    if (/[,"\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const headerLine = headers.join(',');
  const lines = rows.map((row) => headers.map((header) => escape(row[header])).join(','));
  return [headerLine, ...lines].join('\n');
}

module.exports = {
  EXCEPTION_TYPES,
  applyDateRange,
  buildCsv,
  buildCustomerAnalytics,
  buildCustomerReport,
  buildExceptionAnalytics,
  buildInvoiceAnalytics,
  buildInvoiceStates,
  buildOverviewReport,
  buildReconciliationReport,
  buildReportingPayload,
  buildRevenueAnalytics,
  daysBetween,
  getLatestRecordByKey,
  getReports,
  loadReportingFacts,
  moneyString,
  parseDateBound,
  percent,
  resolveTransactionIds,
  summarizeExceptionAnalytics,
  toDecimal
};
