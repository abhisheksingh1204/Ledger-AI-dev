const { GoogleGenAI, Type } = require('@google/genai');
const { AppError } = require('../utils/api');

const GEMINI_MODEL = process.env.GEMINI_OCR_MODEL || 'gemini-3.6-flash';
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_OCR_TIMEOUT_MS || 120000);
const OCR_INSTRUCTION = [
  'Extract all visible text from this financial document.',
  'Do not summarize, explain, calculate, or infer missing values.',
  'Do not change invoice numbers, bank references, dates, GST values, or financial amounts.',
  'Preserve table rows and reading order as accurately as possible.',
  'Return only JSON matching the requested schema.'
].join(' ');

function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function normalizeGeminiResponse(value, documentType) {
  let payload = value;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (error) {
      throw new AppError('GEMINI_MALFORMED_RESPONSE', 'Gemini returned invalid JSON.', 502);
    }
  }

  const rawText = typeof payload?.raw_text === 'string' ? payload.raw_text.trim() : '';
  const pages = Array.isArray(payload?.pages)
    ? payload.pages
        .filter((page) => page && typeof page.text === 'string')
        .map((page, index) => ({
          page_number: Number(page.page_number) || index + 1,
          parsed_text: page.text
        }))
    : [];

  if (!rawText) {
    throw new AppError('GEMINI_EMPTY_RESULT', 'Gemini returned no readable text.', 502);
  }

  return {
    provider: 'gemini',
    document_type: documentType,
    raw_text: rawText,
    pages,
    metadata: { model: GEMINI_MODEL }
  };
}

async function extractWithGemini({ buffer, mimeType, documentType, documentId = 'unknown' }) {
  if (!isGeminiConfigured()) {
    throw new AppError('GEMINI_NOT_CONFIGURED', 'GEMINI_API_KEY is not configured.', 503);
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const startedAt = Date.now();
  console.info('Gemini OCR fallback started document=%s', documentId);

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: 'user',
        parts: [
          { text: OCR_INSTRUCTION },
          { inlineData: { mimeType, data: Buffer.from(buffer).toString('base64') } }
        ]
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['provider', 'document_type', 'raw_text', 'pages'],
          properties: {
            provider: { type: Type.STRING },
            document_type: { type: Type.STRING },
            raw_text: { type: Type.STRING },
            pages: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['page_number', 'text'],
                properties: {
                  page_number: { type: Type.INTEGER },
                  text: { type: Type.STRING }
                }
              }
            }
          }
        }
      },
      signal: controller.signal
    });

    const result = normalizeGeminiResponse(response.text, documentType);
    console.info('Gemini OCR completed document=%s duration_ms=%s', documentId, Date.now() - startedAt);
    return result;
  } catch (error) {
    const status = Number(error.status || error.statusCode || error.response?.status);
    const message = String(error?.message || 'Gemini OCR provider failed.')
      .replace(/AIza[\w-]+/g, '[redacted]')
      .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]');
    if (error.name === 'AbortError') {
      console.warn('Gemini OCR failed document=%s reason=GEMINI_TIMEOUT duration_ms=%s', documentId, Date.now() - startedAt);
      throw new AppError('GEMINI_TIMEOUT', 'Gemini OCR timed out.', 504);
    }
    if (error instanceof AppError) throw error;

    if (status === 429) {
      console.warn('Gemini OCR failed document=%s reason=GEMINI_RATE_LIMIT duration_ms=%s', documentId, Date.now() - startedAt);
      throw new AppError('GEMINI_RATE_LIMIT', 'Gemini OCR rate limit reached.', 429);
    }
    if (status === 401 || status === 403) {
      console.warn('Gemini OCR failed document=%s reason=GEMINI_AUTH_ERROR duration_ms=%s', documentId, Date.now() - startedAt);
      throw new AppError('GEMINI_AUTH_ERROR', 'Gemini OCR authentication failed.', 502);
    }
    if ((status === 400 && /model|invalid|not found/i.test(message)) || status === 404) {
      console.warn('Gemini OCR failed document=%s reason=GEMINI_INVALID_MODEL duration_ms=%s', documentId, Date.now() - startedAt);
      throw new AppError('GEMINI_INVALID_MODEL', 'The configured Gemini OCR model is invalid.', 502);
    }
    console.warn('Gemini OCR failed document=%s reason=GEMINI_PROVIDER_ERROR status=%s duration_ms=%s', documentId, status || 'unknown', Date.now() - startedAt);
    throw new AppError('GEMINI_PROVIDER_ERROR', 'Gemini OCR provider failed.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { extractWithGemini, isGeminiConfigured, normalizeGeminiResponse };
