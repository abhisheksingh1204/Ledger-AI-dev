const express = require('express');
const { requireUser } = require('../middleware/user.middleware');
const {
  customers,
  exceptions,
  invoices,
  overview,
  reconciliation,
  reports,
  revenue
} = require('../controllers/reporting.controller');

const router = express.Router();

router.get('/', requireUser, reports);
router.get('/overview', requireUser, overview);
router.get('/reconciliation', requireUser, reconciliation);
router.get('/revenue', requireUser, revenue);
router.get('/customers', requireUser, customers);
router.get('/exceptions', requireUser, exceptions);
router.get('/invoices', requireUser, invoices);

module.exports = router;
