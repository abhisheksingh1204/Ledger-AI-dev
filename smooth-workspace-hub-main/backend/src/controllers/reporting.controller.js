const { asyncHandler, AppError } = require('../utils/api');
const { buildCsv, getReports } = require('../services/reporting.service');

function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 50));
  return { page, limit };
}

function parseDateFilters(query) {
  return {
    from: query.from || query.start || null,
    to: query.to || query.end || null
  };
}

async function loadReports(req) {
  const { page, limit } = parsePagination(req.query || {});
  const { from, to } = parseDateFilters(req.query || {});
  return getReports({
    userId: req.currentUserId,
    from,
    to,
    status: req.query.status || null,
    page,
    limit
  });
}

const overview = asyncHandler(async (req, res) => {
  const reports = await loadReports(req);
  res.json({
    success: true,
    data: reports.overview
  });
});

const reconciliation = asyncHandler(async (req, res) => {
  const reports = await loadReports(req);
  res.json({
    success: true,
    data: reports.reconciliation
  });
});

const revenue = asyncHandler(async (req, res) => {
  const reports = await loadReports(req);
  res.json({
    success: true,
    data: reports.revenue
  });
});

const customers = asyncHandler(async (req, res) => {
  const reports = await loadReports(req);
  res.json({
    success: true,
    data: reports.customers
  });
});

const exceptions = asyncHandler(async (req, res) => {
  const reports = await loadReports(req);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  res.json({
    success: true,
    data: {
      items: reports.exceptions,
      pagination: {
        page,
        limit,
        total: reports.exceptions.length,
        totalPages: Math.max(1, Math.ceil(reports.exceptions.length / limit))
      }
    }
  });
});

const invoices = asyncHandler(async (req, res) => {
  const reports = await loadReports(req);
  const payload = reports.invoices;

  if (String(req.query.format || '').toLowerCase() === 'csv') {
    const csv = buildCsv(payload.items, [
      'invoiceId',
      'invoiceNumber',
      'customerName',
      'sellerName',
      'amount',
      'receivedAmount',
      'outstandingAmount',
      'invoiceDate',
      'dueDate',
      'paymentDate',
      'paymentDelayDays',
      'status',
      'matchType',
      'confidence',
      'exceptionCount'
    ]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="invoice-report.csv"');
    return res.status(200).send(csv);
  }

  res.json({
    success: true,
    data: payload
  });
});

const reports = asyncHandler(async (req, res) => {
  const reportsData = await loadReports(req);
  res.json({
    success: true,
    data: {
      overview: reportsData.overview,
      reconciliation: reportsData.reconciliation,
      revenue: reportsData.revenue,
      customers: reportsData.customers,
      exceptions: reportsData.exceptions,
      invoices: reportsData.invoices
    }
  });
});

module.exports = {
  customers,
  exceptions,
  invoices,
  overview,
  reconciliation,
  reports,
  revenue
};
