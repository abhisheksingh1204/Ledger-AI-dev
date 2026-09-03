const express = require('express');
const { getDocument, viewDocument } = require('../controllers/document.controller');
const { requireUser } = require('../middleware/user.middleware');

const router = express.Router();

router.get('/:documentId', requireUser, getDocument);
router.get('/:documentId/view', requireUser, viewDocument);

module.exports = router;
