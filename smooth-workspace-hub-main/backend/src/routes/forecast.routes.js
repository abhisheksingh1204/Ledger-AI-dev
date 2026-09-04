const express = require('express');
const { requireUser } = require('../middleware/user.middleware');
const { cash } = require('../controllers/forecast.controller');

const router = express.Router();
router.get('/cash', requireUser, cash);
module.exports = router;
