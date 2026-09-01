const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGeminiResponse } = require('../src/services/geminiOcr.service');

test('normalizes structured Gemini OCR output without extracting financial fields', () => {
  const result = normalizeGeminiResponse(JSON.stringify({
    provider: 'gemini',
    document_type: 'INVOICE',
    raw_text: 'Invoice No: INV-001\nTotal: 100.00',
    pages: [{ page_number: 1, text: 'Invoice No: INV-001\nTotal: 100.00' }]
  }), 'INVOICE');

  assert.equal(result.provider, 'gemini');
  assert.equal(result.document_type, 'INVOICE');
  assert.equal(result.raw_text.includes('INV-001'), true);
  assert.deepEqual(result.pages[0], {
    page_number: 1,
    parsed_text: 'Invoice No: INV-001\nTotal: 100.00'
  });
});

test('rejects malformed Gemini JSON and empty OCR results', () => {
  assert.throws(() => normalizeGeminiResponse('{not-json}', 'INVOICE'), (error) => error.code === 'GEMINI_MALFORMED_RESPONSE');
  assert.throws(() => normalizeGeminiResponse({ provider: 'gemini', raw_text: '', pages: [] }, 'INVOICE'), (error) => error.code === 'GEMINI_EMPTY_RESULT');
});
