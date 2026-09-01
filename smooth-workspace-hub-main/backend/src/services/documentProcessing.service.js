const crypto = require('crypto');
const db = require('../db/knex');
const { AppError } = require('../utils/api');
const {
  getDocumentByDocumentId,
  getDocumentsForProcessingBySessionId,
  insertAuditLog,
  storeDocumentExtraction,
  updateDocumentProcessingStatus
} = require('./document.service');
const { extractWithGemini } = require('./geminiOcr.service');

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8001';
const OCR_SERVICE_INTERNAL_TOKEN = process.env.OCR_SERVICE_INTERNAL_TOKEN || '';
const OCR_SERVICE_TIMEOUT_MS = Number(process.env.OCR_SERVICE_TIMEOUT_MS || 120000);

function toMoneyString(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return String(value);
}

function getInvoiceDocumentNumber(document) {
  return `INV-${document.document_id}`;
}

function getDeterministicTransactionId({
  documentId,
  index,
  transactionDate,
  description,
  reference,
  amount
}) {
  const seed = [
    documentId,
    index,
    transactionDate || '',
    description || '',
    reference || '',
    amount || ''
  ].join('|');
  const digest = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
  return `BTX-${digest}`;
}

function buildOcrRequestPayload(document) {
  return {
    documentId: document.document_id
  };
}

async function callOcrService(document) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OCR_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${OCR_SERVICE_URL}/internal/process-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OCR_SERVICE_INTERNAL_TOKEN
          ? { 'X-Internal-Token': OCR_SERVICE_INTERNAL_TOKEN }
          : {})
      },
      body: JSON.stringify(buildOcrRequestPayload(document)),
      signal: controller.signal
    });

    const text = await response.text();
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        payload = null;
      }
    }

    if (!response.ok) {
      throw new AppError(
        payload?.error?.code || 'OCR_SERVICE_ERROR',
        payload?.error?.message || 'OCR service failed.',
        response.status >= 500 ? 502 : response.status
      );
    }

    if (!payload || payload.success !== true) {
      throw new AppError(
        'OCR_SERVICE_ERROR',
        payload?.error?.message || 'OCR service returned an invalid response.',
        502
      );
    }

    return {
      ...payload.data,
      ocr_provider: 'ocr.space',
      ocr: {
        ...(payload.data.ocr || {}),
        provider: 'ocr.space',
        fallback_used: false
      }
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AppError(
        'OCR_SERVICE_TIMEOUT',
        'OCR service timed out while processing the document.',
        504
      );
    }

    throw error instanceof AppError
      ? error
      : new AppError(
          'OCR_SERVICE_UNAVAILABLE',
          error?.message || 'OCR service is unavailable.',
          503
        );
  } finally {
    clearTimeout(timeout);
  }
}

function isFallbackEligible(error) {
  return [
    'OCR_PROVIDER_ERROR',
    'OCR_MALFORMED_RESPONSE',
    'OCR_EMPTY_RESULT',
    'OCR_API_TIMEOUT',
    'OCR_SERVICE_TIMEOUT',
    'OCR_RATE_LIMITED'
  ].includes(error?.code);
}

function safeProviderReason(error) {
  return error?.code || 'PROVIDER_ERROR';
}

async function downloadForGemini(document) {
  const url = document.cloudinary_secure_url || document.cloudinary_url;
  if (!url) throw new AppError('CLOUDINARY_DOWNLOAD_FAILED', 'Cloudinary URL is missing for this document.', 502);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OCR_SERVICE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new AppError('CLOUDINARY_DOWNLOAD_FAILED', 'Failed to download document from Cloudinary.', 502);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.name === 'AbortError') throw new AppError('CLOUDINARY_DOWNLOAD_FAILED', 'Cloudinary document download timed out.', 504);
    throw new AppError('CLOUDINARY_DOWNLOAD_FAILED', 'Failed to download document from Cloudinary.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function parseGeminiText(document, ocrResult) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OCR_SERVICE_TIMEOUT_MS);
  try {
    const response = await fetch(`${OCR_SERVICE_URL}/internal/parse-document-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OCR_SERVICE_INTERNAL_TOKEN ? { 'X-Internal-Token': OCR_SERVICE_INTERNAL_TOKEN } : {})
      },
      body: JSON.stringify({
        documentId: document.document_id,
        rawText: ocrResult.raw_text,
        pages: ocrResult.pages
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      throw new AppError(payload?.error?.code || 'OCR_PARSE_SERVICE_ERROR', payload?.error?.message || 'OCR parser failed.', 502);
    }
    return {
      ...payload.data,
      ocr_provider: 'gemini',
      ocr: {
        ...(payload.data.ocr || {}),
        provider: 'gemini',
        fallback_used: true,
        model: ocrResult.metadata?.model
      }
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.name === 'AbortError') throw new AppError('OCR_PARSE_SERVICE_TIMEOUT', 'OCR parser timed out.', 504);
    throw new AppError('OCR_PARSE_SERVICE_UNAVAILABLE', 'OCR parser is unavailable.', 503);
  } finally {
    clearTimeout(timeout);
  }
}

async function callGeminiFallback(document, primaryError) {
  await insertAuditLog({
    action: 'OCR_FALLBACK_STARTED',
    tableName: 'documents',
    recordId: document.id,
    userId: document.user_id,
    newValue: { documentId: document.document_id, primaryProvider: 'ocr.space', fallbackProvider: 'gemini', failureCode: safeProviderReason(primaryError) }
  });

  try {
    const buffer = await downloadForGemini(document);
    const ocrResult = await extractWithGemini({
      buffer,
      mimeType: document.mime_type || 'application/octet-stream',
      documentType: document.document_type
    });
    const extraction = await parseGeminiText(document, ocrResult);
    console.info('Gemini OCR succeeded for documentId=%s', document.document_id);
    await insertAuditLog({
      action: 'OCR_FALLBACK_COMPLETED',
      tableName: 'documents',
      recordId: document.id,
      userId: document.user_id,
      newValue: { documentId: document.document_id, primaryProvider: 'ocr.space', fallbackProvider: 'gemini' }
    });
    return extraction;
  } catch (fallbackError) {
    await insertAuditLog({
      action: 'OCR_FALLBACK_FAILED',
      tableName: 'documents',
      recordId: document.id,
      userId: document.user_id,
      newValue: { documentId: document.document_id, primaryProvider: 'ocr.space', fallbackProvider: 'gemini', failureCode: safeProviderReason(fallbackError) }
    });
    if (fallbackError.code === 'CLOUDINARY_DOWNLOAD_FAILED') throw fallbackError;
    throw new AppError(
      'OCR_ALL_PROVIDERS_FAILED',
      'All OCR providers failed to extract this document.',
      502,
      { providers: [{ provider: 'ocr.space', reason: safeProviderReason(primaryError) }, { provider: 'gemini', reason: safeProviderReason(fallbackError) }] }
    );
  }
}

async function callOcrWithFallback(document) {
  try {
    return await callOcrService(document);
  } catch (primaryError) {
    if (!isFallbackEligible(primaryError)) throw primaryError;
    console.warn('OCR.Space failed for documentId=%s reason=%s fallback=gemini', document.document_id, safeProviderReason(primaryError));
    await insertAuditLog({
      action: 'OCR_PRIMARY_FAILED',
      tableName: 'documents',
      recordId: document.id,
      userId: document.user_id,
      newValue: { documentId: document.document_id, primaryProvider: 'ocr.space', failureCode: safeProviderReason(primaryError) }
    });
    return callGeminiFallback(document, primaryError);
  }
}

function buildInvoiceRow(document, extraction) {
  const invoice = extraction.invoice || {};

  return {
    invoice_id: getInvoiceDocumentNumber(document),
    invoice_number: invoice.invoice_number || null,
    user_id: document.user_id,
    session_id: document.session_id,
    document_id: document.id,
    customer_name: invoice.customer_name || null,
    seller_name: invoice.seller_name || null,
    amount: toMoneyString(invoice.total_amount || null),
    subtotal: toMoneyString(invoice.subtotal || null),
    tax_amount: toMoneyString(invoice.tax_amount || null),
    invoice_date: invoice.invoice_date || null,
    due_date: invoice.due_date || null,
    currency: invoice.currency || null,
    payment_reference: invoice.payment_reference || null,
    status: 'EXTRACTED',
    created_at: db.fn.now(),
    updated_at: db.fn.now()
  };
}

function buildBankTransactionRows(document, extraction) {
  const bankStatement = extraction.bank_statement || {};
  const transactions = Array.isArray(bankStatement.transactions)
    ? bankStatement.transactions
    : [];

  return transactions.map((transaction, index) => ({
    transaction_id:
      transaction.transaction_id ||
      getDeterministicTransactionId({
        documentId: document.document_id,
        index,
        transactionDate: transaction.transaction_date,
        description: transaction.description,
        reference: transaction.reference,
        amount: transaction.amount
      }),
    user_id: document.user_id,
    session_id: document.session_id,
    document_id: document.id,
    description: transaction.description || null,
    amount: toMoneyString(transaction.amount || null),
    transaction_date: transaction.transaction_date || null,
    bank_account: bankStatement.masked_account_number || null,
    currency: bankStatement.currency || null,
    status: 'EXTRACTED',
    reference: transaction.reference || null,
    direction: transaction.direction || null,
    debit: toMoneyString(transaction.debit || null),
    credit: toMoneyString(transaction.credit || null),
    balance: toMoneyString(transaction.balance || null),
    created_at: db.fn.now()
  }));
}

async function persistExtraction(document, extraction) {
  return db.transaction(async (trx) => {
    if (document.document_type === 'INVOICE') {
      await trx('invoices').where({ document_id: document.id }).del();

      const invoiceRow = buildInvoiceRow(document, extraction);
      await trx('invoices').insert(invoiceRow);
    }

    if (document.document_type === 'BANK_STATEMENT') {
      await trx('bank_transactions').where({ document_id: document.id }).del();

      const transactionRows = buildBankTransactionRows(document, extraction);
      if (transactionRows.length > 0) {
        await trx('bank_transactions').insert(transactionRows);
      }
    }

    await storeDocumentExtraction(document.id, extraction, trx);

    const [updatedDocument] = await trx('documents')
      .where({ id: document.id })
      .update(
        {
          processing_status: 'COMPLETED',
          updated_at: trx.fn.now()
        },
        [
          'id',
          'document_id',
          'document_type',
          'processing_status',
          'extracted_data'
        ]
      );

    await insertAuditLog(
      {
        action: 'DOCUMENT_PROCESSED',
        tableName: 'documents',
        recordId: document.id,
        userId: document.user_id,
        newValue: {
          documentId: document.document_id,
          documentType: document.document_type,
          processingStatus: 'COMPLETED'
        }
      },
      trx
    );

    return updatedDocument || {
      id: document.id,
      document_id: document.document_id,
      document_type: document.document_type,
      processing_status: 'COMPLETED',
      extracted_data: extraction
    };
  });
}

async function processSingleDocument(documentId, userId) {
  const document = await getDocumentByDocumentId(documentId, userId);

  if (document.processing_status === 'COMPLETED' && document.extracted_data) {
    return {
      documentId: document.document_id,
      documentType: document.document_type,
      processingStatus: document.processing_status,
      extractedData: document.extracted_data,
      skipped: true
    };
  }

  if (document.processing_status === 'OCR_PROCESSING' || document.processing_status === 'EXTRACTING') {
    throw new AppError(
      'DOCUMENT_ALREADY_PROCESSING',
      'This document is already being processed.',
      409
    );
  }

  await updateDocumentProcessingStatus(document.id, 'OCR_PROCESSING');

  try {
    const extraction = await callOcrWithFallback(document);

    await updateDocumentProcessingStatus(document.id, 'EXTRACTING');
    const persistedDocument = await persistExtraction(document, extraction);

    return {
      documentId: persistedDocument.document_id,
      documentType: persistedDocument.document_type,
      processingStatus: persistedDocument.processing_status,
      extractedData: persistedDocument.extracted_data,
      skipped: false
    };
  } catch (error) {
    try {
      await updateDocumentProcessingStatus(document.id, 'FAILED');
      await insertAuditLog({
        action: 'DOCUMENT_PROCESSING_FAILED',
        tableName: 'documents',
        recordId: document.id,
        userId,
        newValue: {
          documentId: document.document_id,
          documentType: document.document_type,
          processingStatus: 'FAILED'
        }
      });
    } catch (auditError) {
      console.error(auditError);
    }

    throw error instanceof AppError
      ? error
      : new AppError(
          'DOCUMENT_PROCESSING_FAILED',
          error?.message || 'Document processing failed.',
          500
        );
  }
}

async function processSessionDocuments(sessionId, userId) {
  const { session, documents } = await getDocumentsForProcessingBySessionId(sessionId, userId);
  const invoiceDocument = documents.find((document) => document.document_type === 'INVOICE');
  const bankStatementDocument = documents.find(
    (document) => document.document_type === 'BANK_STATEMENT'
  );

  if (!invoiceDocument || !bankStatementDocument) {
    throw new AppError(
      'SESSION_DOCUMENTS_MISSING',
      'Both an invoice and a bank statement must be uploaded before processing the session.',
      400
    );
  }

  const results = [];

  for (const document of [invoiceDocument, bankStatementDocument]) {
    try {
      const result = await processSingleDocument(document.document_id, userId);
      results.push({
        ...result,
        success: true
      });
    } catch (error) {
      results.push({
        documentId: document.document_id,
        documentType: document.document_type,
        success: false,
        error: {
          code: error.code || 'DOCUMENT_PROCESSING_FAILED',
          message: error.message
        }
      });
    }
  }

  return {
    sessionId: session.session_id,
    results
  };
}

module.exports = {
  callGeminiFallback,
  callOcrService,
  callOcrWithFallback,
  processSessionDocuments,
  processSingleDocument
};
