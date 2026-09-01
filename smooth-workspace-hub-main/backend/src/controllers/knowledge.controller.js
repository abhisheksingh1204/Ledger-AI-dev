const { asyncHandler, AppError } = require('../utils/api');
const {
  buildKnowledgeCitations,
  buildTaxKnowledgeContext,
  ingestTrustedKnowledgeSource,
  searchKnowledge
} = require('../services/knowledge.service');

const ingest = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body.title || !body.url || !body.publisher) {
    throw new AppError('KNOWLEDGE_SOURCE_REQUIRED', 'title, url, and publisher are required.', 400);
  }

  const result = await ingestTrustedKnowledgeSource({
    title: body.title,
    url: body.url,
    publisher: body.publisher,
    jurisdiction: body.jurisdiction || 'IN',
    effectiveDate: body.effectiveDate || null,
    content: body.content || null,
    documentType: body.documentType || 'GUIDANCE',
    status: body.status || 'active',
    metadata: body.metadata || {},
    pageReference: body.pageReference || null
  });

  return res.status(201).json({
    success: true,
    data: result
  });
});

const search = asyncHandler(async (req, res) => {
  const query = String(req.query.q || req.body?.q || '').trim();
  if (!query) {
    throw new AppError('QUERY_REQUIRED', 'q is required.', 400);
  }

  const results = await searchKnowledge({
    query,
    jurisdiction: req.query.jurisdiction || req.body?.jurisdiction || 'IN',
    limit: Math.min(10, Math.max(1, Number(req.query.limit || req.body?.limit || 5)))
  });

  return res.json({
    success: true,
    data: {
      results,
      citations: buildKnowledgeCitations(results)
    }
  });
});

const context = asyncHandler(async (req, res) => {
  const result = await buildTaxKnowledgeContext({
    invoice: req.body?.invoice || {},
    document: req.body?.document || null,
    question: req.body?.question || req.query?.question || '',
    limit: Math.min(10, Math.max(1, Number(req.query.limit || req.body?.limit || 5)))
  });

  return res.json({
    success: true,
    data: result
  });
});

module.exports = {
  context,
  ingest,
  search
};
