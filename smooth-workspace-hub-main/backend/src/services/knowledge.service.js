const crypto = require('crypto');
const db = require('../db/knex');
const { AppError } = require('../utils/api');
const {
  DEFAULT_DIMENSION,
  EMBEDDING_MODEL,
  cosineSimilarity,
  embedText,
  parseVector,
  vectorToJson
} = require('./embedding.service');

const TRUSTED_DOMAINS = [
  'cbic-gst.gov.in',
  'gst.gov.in',
  'tutorial.gst.gov.in',
  'incometax.gov.in',
  'einvoice1.gst.gov.in',
  'einvoice.gst.gov.in'
];

function normalizeJurisdiction(value) {
  return String(value || '').trim().toUpperCase();
}

function isTrustedUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === 'https:' &&
      TRUSTED_DOMAINS.some(
        (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
      )
    );
  } catch (error) {
    return false;
  }
}

function createSourceHash({ title, url, publisher, jurisdiction, effectiveDate, content }) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        title,
        url,
        publisher,
        jurisdiction,
        effectiveDate: effectiveDate || null,
        content: content || ''
      })
    )
    .digest('hex');
}

function stripHtml(rawText) {
  return String(rawText || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(h[1-6]|p|li|tr|div|section|article|table)>/gi, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r/g, '\n');
}

function cleanText(rawText) {
  return String(rawText || '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function getHeadingFromLine(line) {
  const value = String(line || '').trim();
  if (!value) {
    return null;
  }

  if (value.length <= 120 && (/^[A-Z0-9][A-Z0-9\s&(),./:-]+$/.test(value) || /[:]\s*$/.test(value))) {
    return value.replace(/:\s*$/, '');
  }

  if (/^(\d+(\.\d+)*)\s+[A-Z]/.test(value)) {
    return value;
  }

  return null;
}

function splitIntoSemanticChunks(rawText, maxCharacters = 1200, overlapParagraphs = 1) {
  const lines = cleanText(rawText).split('\n');
  const sections = [];
  let currentHeading = null;
  let buffer = [];

  function flush() {
    if (!buffer.length) {
      return;
    }

    const content = buffer.join('\n').trim();
    if (content) {
      sections.push({ heading: currentHeading, content });
    }

    const overlap = overlapParagraphs > 0 ? buffer.slice(Math.max(0, buffer.length - overlapParagraphs)) : [];
    buffer = overlap.filter(Boolean);
  }

  for (const line of lines) {
    const heading = getHeadingFromLine(line);
    if (heading) {
      flush();
      currentHeading = heading;
      continue;
    }

    buffer.push(line);
    const joined = buffer.join('\n');
    if (joined.length >= maxCharacters) {
      flush();
    }
  }

  flush();

  return sections.length
    ? sections
    : [{ heading: currentHeading, content: cleanText(rawText) }];
}

function normalizeTaxValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const text = String(value).trim();
  const numeric = text.replace(/[^0-9.-]/g, '');
  return numeric || text;
}

function inferJurisdictionFromInvoice(invoice = {}, document = null) {
  const extracted = document?.extracted_data?.invoice || {};
  const candidates = [
    invoice.jurisdiction,
    extracted.jurisdiction,
    invoice.country,
    extracted.country
  ];

  for (const candidate of candidates) {
    const value = normalizeJurisdiction(candidate);
    if (value) {
      if (value === 'IN' || value === 'INDIA') {
        return 'IN';
      }
      if (value.length === 2) {
        return value;
      }
    }
  }

  const gstin = String(
    invoice.seller_gstin || extracted.seller_gstin || invoice.buyer_gstin || extracted.buyer_gstin || ''
  ).trim();
  if (/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) {
    return 'IN';
  }

  const currency = String(invoice.currency || extracted.currency || '').toUpperCase();
  if (currency === 'INR' || currency === 'RUPEE' || currency === 'RUPEES') {
    return 'IN';
  }

  return null;
}

async function fetchSourceContent(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'AI-Finance-Controller/1.0'
    }
  });

  if (!response.ok) {
    throw new AppError('KNOWLEDGE_FETCH_FAILED', `Unable to fetch trusted source (${response.status}).`, 502);
  }

  return response.text();
}

async function upsertTrustedKnowledgeSource(source, dbClient = db) {
  const jurisdiction = normalizeJurisdiction(source.jurisdiction || 'IN') || 'IN';
  const rawContent = source.content || source.rawContent || '';
  const hash = source.sourceHash || createSourceHash({
    title: source.title,
    url: source.url,
    publisher: source.publisher,
    jurisdiction,
    effectiveDate: source.effectiveDate,
    content: rawContent
  });

  const existing = await dbClient('knowledge_sources').where({ url: source.url }).first();
  const baseMetadata = {
    ...(source.metadata || {}),
    embedding_model: EMBEDDING_MODEL,
    embedding_dimension: DEFAULT_DIMENSION
  };
  const now = dbClient.fn.now();

  if (existing && existing.source_hash === hash) {
    await dbClient('knowledge_sources')
      .where({ id: existing.id })
      .update({
        status: source.status || existing.status || 'active',
        retrieved_at: source.retrievedAt || now,
        updated_at: now,
        metadata: {
          ...existing.metadata,
          ...baseMetadata,
          preserved_version: existing.version
        }
      });

    return dbClient('knowledge_sources').where({ id: existing.id }).first();
  }

  if (existing) {
    await dbClient('knowledge_sources')
      .where({ id: existing.id })
      .update({
        title: source.title,
        publisher: source.publisher,
        jurisdiction,
        effective_date: source.effectiveDate || existing.effective_date || null,
        retrieved_at: source.retrievedAt || now,
        source_hash: hash,
        status: source.status || 'active',
        version: Number(existing.version || 1) + 1,
        document_type: source.documentType || existing.document_type || 'GUIDANCE',
        metadata: {
          ...existing.metadata,
          ...baseMetadata,
          previous_hash: existing.source_hash
        },
        updated_at: now
      });

    await dbClient('knowledge_chunks').where({ source_id: existing.id }).del();
    return dbClient('knowledge_sources').where({ id: existing.id }).first();
  }

  const [inserted] = await dbClient('knowledge_sources')
    .insert({
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      jurisdiction,
      effective_date: source.effectiveDate || null,
      retrieved_at: source.retrievedAt || now,
      source_hash: hash,
      status: source.status || 'active',
      version: Number(source.version || 1),
      document_type: source.documentType || 'GUIDANCE',
      metadata: baseMetadata,
      created_at: now,
      updated_at: now
    })
    .returning('*');

  return inserted;
}

function buildChunkEmbedding(content, heading) {
  return vectorToJson(embedText([heading, content].filter(Boolean).join('\n')));
}

async function ingestTrustedKnowledgeSource(input, dbClient = db) {
  const url = input.url ? String(input.url).trim() : '';
  if (url && !isTrustedUrl(url)) {
    throw new AppError('UNTRUSTED_SOURCE', 'Only approved government or official sources may be ingested.', 400);
  }

  const resolvedContent = input.content || (url ? stripHtml(await fetchSourceContent(url)) : '');
  const cleanedContent = cleanText(resolvedContent);
  if (!cleanedContent) {
    throw new AppError('KNOWLEDGE_EMPTY', 'Trusted source content is empty after cleaning.', 400);
  }

  const source = await upsertTrustedKnowledgeSource(
    {
      title: input.title,
      url,
      publisher: input.publisher,
      jurisdiction: input.jurisdiction || 'IN',
      effectiveDate: input.effectiveDate || null,
      content: cleanedContent,
      retrievedAt: input.retrievedAt || undefined,
      documentType: input.documentType || 'GUIDANCE',
      status: input.status || 'active',
      version: input.version || 1,
      metadata: input.metadata || {},
      sourceHash: input.sourceHash
    },
    dbClient
  );

  const sections = splitIntoSemanticChunks(cleanedContent, input.maxCharacters || 1200, input.overlapParagraphs || 1);
  const chunkRows = sections.map((section, index) => ({
    source_id: source.id,
    chunk_index: index,
    heading: section.heading,
    content: section.content,
    embedding: buildChunkEmbedding(section.content, section.heading),
    metadata: {
      source_url: url,
      publisher: source.publisher,
      jurisdiction: source.jurisdiction,
      effective_date: source.effective_date,
      retrieved_at: source.retrieved_at,
      version: source.version,
      checksum: source.source_hash,
      embedding_model: EMBEDDING_MODEL,
      chunk_type: section.heading ? 'HEADING_SECTION' : 'TEXT',
      page_reference: input.pageReference || null,
      section_reference: section.heading || null
    }
  }));

  await dbClient.transaction(async (trx) => {
    await trx('knowledge_chunks').where({ source_id: source.id }).del();
    if (chunkRows.length > 0) {
      await trx('knowledge_chunks').insert(chunkRows);
    }
  });

  const refreshedSource = await dbClient('knowledge_sources').where({ id: source.id }).first();

  return {
    source: refreshedSource,
    chunkCount: chunkRows.length
  };
}

function scoreKeywordOverlap(query, content, heading) {
  const queryTokens = new Set(String(query || '').toLowerCase().split(/\W+/).filter(Boolean));
  const haystack = new Set(
    [heading, content]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .split(/\W+/)
      .filter(Boolean)
  );

  if (!queryTokens.size || !haystack.size) {
    return 0;
  }

  let overlap = 0;
  for (const token of queryTokens) {
    if (haystack.has(token)) {
      overlap += 1;
    }
  }

  return overlap / queryTokens.size;
}

async function searchKnowledge({
  query,
  jurisdiction = 'IN',
  limit = 5,
  documentType = null,
  activeOnly = true,
  dbClient = db
}) {
  const normalizedJurisdiction = normalizeJurisdiction(jurisdiction || 'IN');
  const rows = await dbClient('knowledge_chunks as kc')
    .join('knowledge_sources as ks', 'ks.id', 'kc.source_id')
    .select(
      'kc.id',
      'kc.chunk_index',
      'kc.heading',
      'kc.content',
      'kc.embedding',
      'kc.metadata',
      'ks.id as source_id',
      'ks.title',
      'ks.url',
      'ks.publisher',
      'ks.jurisdiction',
      'ks.effective_date',
      'ks.retrieved_at',
      'ks.source_hash',
      'ks.status',
      'ks.version',
      'ks.document_type',
      'ks.metadata as source_metadata'
    )
    .where('ks.jurisdiction', normalizedJurisdiction)
    .modify((builder) => {
      if (activeOnly) {
        builder.where('ks.status', 'active');
      }
      if (documentType) {
        builder.where('ks.document_type', documentType);
      }
    });

  const queryEmbedding = embedText(query);
  const ranked = rows
    .map((row) => {
      const embedding = parseVector(row.embedding);
      const vectorScore = embedding.length ? cosineSimilarity(queryEmbedding, embedding) : 0;
      const keywordScore = scoreKeywordOverlap(query, row.content, row.heading);
      const score = Number((0.75 * vectorScore + 0.25 * keywordScore).toFixed(6));

      return {
        score,
        chunk: {
          id: row.id,
          sourceId: row.source_id,
          chunkIndex: row.chunk_index,
          heading: row.heading,
          content: row.content,
          metadata: row.metadata,
          source: {
            id: row.source_id,
            title: row.title,
            url: row.url,
            sourceUrl: row.url,
            publisher: row.publisher,
            jurisdiction: row.jurisdiction,
            effectiveDate: row.effective_date,
            retrievedAt: row.retrieved_at,
            sourceHash: row.source_hash,
            status: row.status,
            version: row.version,
            documentType: row.document_type,
            metadata: row.source_metadata
          }
        }
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked;
}

function buildKnowledgeCitations(results) {
  const citations = [];
  const seen = new Set();

  for (const result of results) {
    const key = `${result.chunk.source.id}:${result.chunk.chunkIndex}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    citations.push({
      source_id: result.chunk.source.id,
      title: result.chunk.source.title,
      url: result.chunk.source.url,
      source_url: result.chunk.source.url,
      publisher: result.chunk.source.publisher,
      jurisdiction: result.chunk.source.jurisdiction,
      document_type: result.chunk.source.documentType,
      effective_date: result.chunk.source.effectiveDate,
      retrieved_at: result.chunk.source.retrievedAt,
      version: result.chunk.source.version,
      section: result.chunk.heading || result.chunk.metadata?.section_reference || null,
      chunk_index: result.chunk.chunkIndex
    });
  }

  return citations;
}

async function buildTaxKnowledgeContext({
  invoice,
  document,
  question,
  dbClient = db,
  limit = 5
}) {
  const jurisdiction = inferJurisdictionFromInvoice(invoice, document);

  if (!jurisdiction) {
    return {
      status: 'UNKNOWN_JURISDICTION',
      jurisdiction: null,
      sources: [],
      chunks: [],
      citations: [],
      guidance:
        'The invoice jurisdiction cannot be determined from the available data, so tax applicability cannot be verified.'
    };
  }

  const results = await searchKnowledge({
    query:
      question ||
      [
        invoice?.seller_name,
        invoice?.customer_name,
        invoice?.tax_amount,
        invoice?.subtotal,
        invoice?.payment_reference
      ]
        .filter(Boolean)
        .join(' '),
    jurisdiction,
    limit,
    dbClient
  });

  const citations = buildKnowledgeCitations(results);

  if (!results.length) {
    return {
      status: 'AUTHORITATIVE_SOURCE_NOT_FOUND',
      jurisdiction,
      sources: [],
      chunks: [],
      citations,
      guidance: 'No authoritative trusted source was found for this jurisdiction and question.'
    };
  }

  return {
    status: 'GROUNDING_AVAILABLE',
    jurisdiction,
    sources: citations,
    chunks: results.map((result) => ({
      score: result.score,
      heading: result.chunk.heading,
      content: result.chunk.content,
      source: result.chunk.source
    })),
    citations,
    guidance: 'Use only the retrieved authoritative source material for tax-law statements.'
  };
}

module.exports = {
  TRUSTED_DOMAINS,
  buildKnowledgeCitations,
  buildTaxKnowledgeContext,
  cleanText,
  createSourceHash,
  fetchSourceContent,
  inferJurisdictionFromInvoice,
  ingestTrustedKnowledgeSource,
  isTrustedUrl,
  normalizeJurisdiction,
  scoreKeywordOverlap,
  splitIntoSemanticChunks,
  stripHtml,
  upsertTrustedKnowledgeSource,
  searchKnowledge
};
