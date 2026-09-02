const test = require('node:test');
const assert = require('node:assert/strict');
const { taxValidation } = require('../src/services/aiFinance.service');
const { buildReportingPayload } = require('../src/services/reporting.service');
const { buildTaxKnowledgeContext } = require('../src/services/knowledge.service');
const { embedText } = require('../src/services/embedding.service');

function createKnowledgeDb(rows) {
  return function db() {
    const filters = { jurisdiction: null, status: null };
    const builder = {
      join() {
        return builder;
      },
      select() {
        return builder;
      },
      where(column, value) {
        if (column === 'ks.jurisdiction') {
          filters.jurisdiction = value;
        }
        if (column === 'ks.status') {
          filters.status = value;
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
      then(resolve) {
        resolve(
          rows.filter((row) => {
            if (filters.jurisdiction && row.jurisdiction !== filters.jurisdiction) {
              return false;
            }
            if (filters.status && row.status !== filters.status) {
              return false;
            }
            return true;
          })
        );
      }
    };
    return builder;
  };
}

test('phase 5 synthetic end-to-end flow stays deterministic', async () => {
  const invoices = [
    {
      id: 1,
      invoice_id: 'INV-1001',
      customer_name: 'ABC Technologies',
      seller_name: 'ABC Technologies',
      amount: '59000.00',
      subtotal: '50000.00',
      tax_amount: '9000.00',
      invoice_date: '2026-08-01',
      due_date: '2026-08-15',
      currency: 'INR'
    }
  ];

  const transactions = [
    { id: 101, transaction_id: 'BTX-101', amount: '59000.00', transaction_date: '2026-08-01' }
  ];

  const matches = [
    {
      id: 1,
      invoice_id: 1,
      transaction_id: 101,
      match_type: 'AUTO_MATCH',
      status: 'MATCHED',
      confidence_score: '98.00',
      matched_at: '2026-08-01T12:00:00Z',
      reason: { transactionIds: [101] }
    }
  ];

  const report = buildReportingPayload({ invoices, transactions, matches, exceptions: [] });
  assert.equal(report.overview.reconciliation.reconciliationRate, 100);
  assert.equal(report.overview.financial.outstanding, '0.00');

  const validation = taxValidation(invoices[0], { invoice: invoices[0] });
  assert.equal(validation.status, 'VALID');

  const knowledge = await buildTaxKnowledgeContext({
    invoice: invoices[0],
    document: { extracted_data: { invoice: { seller_gstin: '27ABCDE1234F2Z5' } } },
    question: 'Explain this GST line',
    dbClient: createKnowledgeDb([
      {
        id: 1,
        chunk_index: 0,
        heading: 'GST Invoice Rules',
        content: 'Tax invoices should show GSTIN and the taxable value.',
        embedding: embedText('GSTIN taxable value tax invoice'),
        metadata: {},
        source_id: 1,
        title: 'GST Invoice Rules',
        url: 'https://cbic-gst.gov.in/invoice-rules',
        publisher: 'CBIC',
        jurisdiction: 'IN',
        effective_date: '2026-01-01',
        retrieved_at: '2026-09-01T00:00:00Z',
        source_hash: 'hash',
        status: 'active',
        version: 1,
        document_type: 'GUIDANCE',
        source_metadata: {}
      }
    ])
  });

  assert.equal(knowledge.status, 'GROUNDING_AVAILABLE');
  assert.equal(knowledge.citations[0].title, 'GST Invoice Rules');
  assert.equal(knowledge.citations[0].publisher, 'CBIC');
});
