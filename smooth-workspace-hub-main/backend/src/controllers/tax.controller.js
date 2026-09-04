const { asyncHandler } = require('../utils/api');
const { getTaxValidation } = require('../services/taxValidation.service');

const invoice = asyncHandler(async (req, res) => {
  const data = await getTaxValidation({ invoiceId: req.params.invoiceId, userId: req.currentUserId });
  return res.json({ success: true, data });
});

module.exports = { invoice };
