const { asyncHandler } = require('../utils/api');
const { getCashForecast } = require('../services/forecast.service');

const cash = asyncHandler(async (req, res) => {
  const data = await getCashForecast({ userId: req.currentUserId, from: req.query.from || null, to: req.query.to || null, customer: req.query.customer || null, currency: req.query.currency || null });
  res.json({ success: true, data });
});

module.exports = { cash };
