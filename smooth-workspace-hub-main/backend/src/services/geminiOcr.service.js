const { GoogleGenAI, Type } = require('@google/genai');
const { AppError } = require('../utils/api');

const GEMINI_MODEL = process.env.GEMINI_OCR_MODEL || 'gemini-2.5-flash';
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

async function extractWithGemini({ buffer, mimeType, documentType }) {
  if (!isGeminiConfigured()) {
    throw new AppError('GEMINI_NOT_CONFIGURED', 'GEMINI_API_KEY is not configured.', 503);
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

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

    return normalizeGeminiResponse(response.text, documentType);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AppError('GEMINI_TIMEOUT', 'Gemini OCR timed out.', 504);
    }
    if (error instanceof AppError) throw error;

    const status = Number(error.status || error.statusCode);
    if (status === 429) throw new AppError('GEMINI_RATE_LIMITED', 'Gemini OCR rate limit reached.', 429);
    if (status === 401 || status === 403) throw new AppError('GEMINI_AUTH_FAILED', 'Gemini OCR authentication failed.', 502);
    throw new AppError('GEMINI_PROVIDER_ERROR', 'Gemini OCR provider failed.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { extractWithGemini, isGeminiConfigured, normalizeGeminiResponse };
