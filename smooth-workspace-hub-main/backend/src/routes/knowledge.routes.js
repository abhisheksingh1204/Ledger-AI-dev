const express = require('express');
const { requireUser } = require('../middleware/user.middleware');
const { context, ingest, search } = require('../controllers/knowledge.controller');

const router = express.Router();

router.post('/ingest', requireUser, ingest);
router.get('/search', requireUser, search);
router.post('/context', requireUser, context);

module.exports = router;
