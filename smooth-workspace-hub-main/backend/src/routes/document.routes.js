const express = require('express');
const { getDocument } = require('../controllers/document.controller');
const { requireUser } = require('../middleware/user.middleware');

const router = express.Router();

router.get('/:documentId', requireUser, getDocument);

module.exports = router;
