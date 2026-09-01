const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTaxKnowledgeContext,
  inferJurisdictionFromInvoice,
  isTrustedUrl,
  searchKnowledge,
  splitIntoSemanticChunks
} = require('../src/services/knowledge.service');
const { embedText } = require('../src/services/embedding.service');

function createFakeKnowledgeDb(rows) {
  return function fakeDb() {
    const filters = {
      jurisdiction: null,
      status: null,
      documentType: null
    };

    const builder = {
      join() {
        return builder;
      },
      select() {
        return builder;
      },
      where(column, value) {
        if (typeof column === 'string') {
          if (column === 'ks.jurisdiction') {
            filters.jurisdiction = value;
          } else if (column === 'ks.status') {
            filters.status = value;
          } else if (column === 'ks.document_type') {
            filters.documentType = value;
          }
        } else if (column && typeof column === 'object') {
          Object.assign(filters, column);
        }

        return builder;
      },
      modify(callback) {
        callback(builder);
        return builder;
      },
      whereIn() {
        return builder;
      },
      andWhere() {
        return builder;
      },
      orderBy() {
        return builder;
      },
      then(resolve, reject) {
        try {
          const filtered = rows.filter((row) => {
            if (filters.jurisdiction && row.jurisdiction !== filters.jurisdiction) {
              return false;
            }
            if (filters.status && row.status !== filters.status) {
              return false;
            }
            if (filters.documentType && row.document_type !== filters.documentType) {
              return false;
            }
            return true;
          });
          resolve(filtered);
        } catch (error) {
          reject(error);
        }
      }
    };

    return builder;
  };
}

test('trust filters official tax sources and rejects random blogs', () => {
  assert.equal(isTrustedUrl('https://cbic-gst.gov.in/gst-rules'), true);
  assert.equal(isTrustedUrl('https://example-blog.com/gst-tips'), false);
});

test('splits trusted guidance on semantic boundaries', () => {
  const chunks = splitIntoSemanticChunks(`
SECTION 1
Tax Invoice Requirements

The invoice should include GSTIN, date, and value.

SECTION 2
Reverse Charge

Use the reverse charge mechanism only when applicable.
  `);

  assert.equal(chunks.length >= 2, true);
  assert.equal(chunks[0].heading, 'SECTION 1');
  assert.match(chunks[0].content, /GSTIN/);
});

test('infers Indian jurisdiction from GST identifiers and currency', () => {
  assert.equal(inferJurisdictionFromInvoice({ seller_gstin: '27ABCDE1234F2Z5' }), 'IN');
  assert.equal(inferJurisdictionFromInvoice({ currency: 'INR' }), 'IN');
  assert.equal(inferJurisdictionFromInvoice({ currency: 'USD' }), null);
});

test('retrieves authoritative chunks and preserves citations', async () => {
  const rows = [
    {
      id: 1,
      chunk_index: 0,
      heading: 'Tax Invoice Requirements',
      content: 'A tax invoice should include GSTIN, invoice number, date, and taxable value.',
      embedding: embedText('GSTIN invoice number date taxable value tax invoice requirements'),
      metadata: {},
      source_id: 11,
      title: 'GST Invoice Requirements',
      url: 'https://cbic-gst.gov.in/gst-invoice',
      publisher: 'CBIC',
      jurisdiction: 'IN',
      effective_date: '2026-08-01',
      retrieved_at: '2026-09-01T00:00:00Z',
      source_hash: 'hash-1',
      status: 'active',
      version: 1,
      document_type: 'GUIDANCE',
      source_metadata: {}
    },
    {
      id: 2,
      chunk_index: 0,
      heading: 'Inactive Source',
      content: 'This should be ignored.',
      embedding: embedText('ignored'),
      metadata: {},
      source_id: 12,
      title: 'Old Guidance',
      url: 'https://cbic-gst.gov.in/old-guidance',
      publisher: 'CBIC',
      jurisdiction: 'IN',
      effective_date: '2024-01-01',
      retrieved_at: '2026-09-01T00:00:00Z',
      source_hash: 'hash-2',
      status: 'inactive',
      version: 1,
      document_type: 'GUIDANCE',
      source_metadata: {}
    }
  ];

  const fakeDb = createFakeKnowledgeDb(rows);
  const results = await searchKnowledge({
    query: 'Is the GST invoice missing GSTIN and taxable value?',
    jurisdiction: 'IN',
    limit: 5,
    dbClient: fakeDb
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].chunk.source.title, 'GST Invoice Requirements');
  assert.equal(results[0].chunk.source.status, 'active');
});

test('builds grounding context and refuses unknown jurisdiction', async () => {
  const unknown = await buildTaxKnowledgeContext({
    invoice: { amount: '1000.00', currency: 'USD' },
    document: null,
    question: 'What GST should apply?'
  });

  assert.equal(unknown.status, 'UNKNOWN_JURISDICTION');

  const rows = [
    {
      id: 1,
      chunk_index: 0,
      heading: 'TDS Guidance',
      content: 'TDS may apply when the law requires deduction at source.',
      embedding: embedText('TDS guidance deduction at source'),
      metadata: {},
      source_id: 21,
      title: 'Income Tax TDS',
      url: 'https://incometax.gov.in/tds',
      publisher: 'Income Tax Department',
      jurisdiction: 'IN',
      effective_date: '2026-01-01',
      retrieved_at: '2026-09-01T00:00:00Z',
      source_hash: 'hash-21',
      status: 'active',
      version: 1,
      document_type: 'GUIDANCE',
      source_metadata: {}
    }
  ];

  const grounded = await buildTaxKnowledgeContext({
    invoice: { currency: 'INR', seller_gstin: '27ABCDE1234F2Z5' },
    document: { extracted_data: { invoice: { seller_gstin: '27ABCDE1234F2Z5' } } },
    question: 'Could this difference be TDS?',
    dbClient: createFakeKnowledgeDb(rows)
  });

  assert.equal(grounded.status, 'GROUNDING_AVAILABLE');
  assert.equal(grounded.citations[0].title, 'Income Tax TDS');
  assert.equal(grounded.citations[0].jurisdiction, 'IN');
});
