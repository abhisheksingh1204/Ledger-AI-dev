const express = require('express');
const { requireUser } = require('../middleware/user.middleware');
const { invoice } = require('../controllers/tax.controller');

const router = express.Router();
router.get('/invoice/:invoiceId', requireUser, invoice);
module.exports = router;
