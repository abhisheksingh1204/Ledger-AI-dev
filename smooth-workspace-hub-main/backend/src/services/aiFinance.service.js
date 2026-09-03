const Decimal = require('decimal.js');
const crypto = require('crypto');
const db = require('../db/knex');
const { AppError } = require('../utils/api');
const {
  buildTaxKnowledgeContext,
  inferJurisdictionFromInvoice
} = require('./knowledge.service');

const SYSTEM_PROMPT = [
  'You are the AI Finance Controller.',
  'Answer using only verified invoice/database facts, deterministic calculations supplied by the backend, and retrieved authoritative knowledge.',
  'Never invent invoice values.',
  'Never modify reconciliation scores.',
  'Never claim a possible cause is confirmed unless data proves it.',
  'For taxation and regulatory questions, cite retrieved authoritative sources.',
  'If authoritative information is insufficient, say that clearly.',
  'Separate facts, calculations, possible explanations, regulatory guidance, and recommended actions.',
  'Never fabricate GST rates, TDS rates, legal requirements, or source citations.'
].join(' ');

function money(value) {
  return value === null || value === undefined || value === '' ? null : new Decimal(value);
}

function formatMoney(value) {
  return money(value) ? money(value).toFixed(2) : null;
}

function isTaxQuestion(question) {
  return /gst|cgst|sgst|igst|tds|hsn|sac|invoice\s+tax|taxation|tax\s+invoice|jurisdiction|compliance|arithmetic/i.test(
    String(question || '')
  );
}

function classifyQuestion(question) {
  const text = String(question || '').toLowerCase();
  if (/\b(legally|legal|law|compliance|applicable|applicability|gst rate|tds required|regulatory|rule)\b/.test(text)) return 'TAX_REGULATORY';
  if (/\b(gst|cgst|sgst|igst|vat|tax|arithmetic|calculation|subtotal|total)\b/.test(text) && /\b(correct|calculation|arithmetic|equal|add|rate|charged|math)/.test(text)) return 'TAX_ARITHMETIC';
  if (/\b(unmatch|match|manual review|confidence|exception|reconcil|candidate|score)/.test(text)) return 'RECONCILIATION';
  if (/\b(payment|paid|settlement|transaction|bank|utr|reference|narration)/.test(text)) return 'PAYMENT';
  if (/\b(history|previous|before|earlier|version|recheck)/.test(text)) return 'HISTORY';
  if (/\b(total|amount|invoice number|invoice no|customer|vendor|seller|due date|invoice date|tax amount|subtotal|currency)/.test(text)) return 'INVOICE_FACT';
  return 'GENERAL';
}

function taxValidation(invoice = {}, extracted = {}) {
  const tax = extracted.invoice || extracted;
  const subtotal = money(invoice.subtotal || tax.subtotal);
  const total = money(invoice.amount || tax.total_amount || tax.grand_total);
  const actualTax = money(invoice.tax_amount || tax.tax_amount);
  const shipping = money(tax.shipping || tax.shipping_amount || tax.freight || 0) || new Decimal(0);

  if (!subtotal || !total || !actualTax) {
    return {
      status: 'INSUFFICIENT_DATA',
      arithmeticStatus: 'INSUFFICIENT_DATA'
    };
  }

  const expectedTotal = subtotal.plus(actualTax).plus(shipping);
  const status = expectedTotal.eq(total) ? 'VALID' : 'INVALID';

  return {
    status,
    arithmeticStatus: status,
    subtotal: subtotal.toFixed(2),
    actual_tax: actualTax.toFixed(2),
    expected_tax: actualTax.toFixed(2),
    shipping: shipping.toFixed(2),
    actual_total: total.toFixed(2),
    expected_total: expectedTotal.toFixed(2),
    grandTotal: total.toFixed(2)
  };
}

function taxKind(invoice = {}, document) {
  const extracted = document?.extracted_data?.invoice || {};
  if (extracted.gst || extracted.gst_amount || extracted.cgst || extracted.sgst || extracted.igst || invoice.gstin || invoice.seller_gstin || invoice.customer_gstin) return 'GST';
  if (extracted.vat || extracted.vat_amount) return 'VAT';
  return invoice.tax_amount || extracted.tax_amount ? 'GENERIC_TAX' : 'NONE';
}

function deterministicFactAnswer(question, invoice, validation) {
  const text = String(question || '').toLowerCase();
  const safe = normalizeSafeInvoice(invoice);
  if (/\b(customer|vendor|seller)\b/.test(text)) return `The customer is ${safe.customerName || 'not available in the invoice data'}.`;
  if (/\b(invoice number|invoice no)\b/.test(text)) return `The invoice number is ${safe.invoiceNumber || 'not available in the invoice data'}.`;
  if (/\bdue date\b/.test(text)) return `The due date is ${safe.dueDate || 'not available in the invoice data'}.`;
  if (/\binvoice date\b/.test(text)) return `The invoice date is ${safe.invoiceDate || 'not available in the invoice data'}.`;
  if (/\btax amount\b/.test(text)) return `The tax amount is ${safe.taxAmount || 'not available in the invoice data'}${safe.currency ? ` ${safe.currency}` : ''}.`;
  if (/\bsubtotal\b/.test(text)) return `The subtotal is ${safe.subtotal || 'not available in the invoice data'}${safe.currency ? ` ${safe.currency}` : ''}.`;
  return `The total invoice amount is ${safe.amount || 'not available in the invoice data'}${safe.currency ? ` ${safe.currency}` : ''}.`;
}

function deterministicTaxAnswer(question, invoice, document, validation) {
  const kind = taxKind(invoice, document);
  if (validation.status === 'INSUFFICIENT_DATA') return { answer: 'I cannot verify the invoice arithmetic because subtotal, tax, and total are not all available.', kind };
  const expression = `${validation.subtotal} + ${validation.actual_tax} + ${validation.shipping} = ${validation.expected_total}`;
  const arithmetic = validation.status === 'VALID' ? 'The invoice arithmetic is mathematically correct.' : `The invoice arithmetic does not balance: the calculated total is ${validation.expected_total}, but the invoice total is ${validation.actual_total}.`;
  const label = kind === 'GST' ? 'GST-specific fields are present.' : kind === 'VAT' ? 'The invoice contains VAT fields.' : 'This invoice does not contain GST-specific fields; it contains a generic tax amount.';
  return { answer: `${label}\n\n${arithmetic}\n\nSubtotal + Tax + Shipping: ${expression}.`, kind };
}

function deterministicReconciliationAnswer(context) {
  const match = context.reconciliationSummary;
  if (!match) return 'This invoice has not been reconciled yet, so there is no match status available.';
  const status = match.match_type || match.status || 'UNKNOWN';
  const lines = [`The authoritative reconciliation status is ${status} with ${Number(match.confidence_score || 0).toFixed(2)}% confidence.`];
  const candidate = match.best_candidate || match.transaction_snapshot;
  if (candidate) {
    const amount = candidate.amount ?? candidate.transaction_amount;
    lines.push('', `Best candidate: ${candidate.transaction_id || candidate.transactionId || 'not available'}`);
    lines.push(`Invoice amount: ${formatMoney(context.invoice.amount) || 'not available'}`);
    lines.push(`Settlement amount: ${formatMoney(amount) || 'not available'}`);
    if (context.invoice.amount != null && amount != null) lines.push(`Difference: ${formatMoney(new Decimal(context.invoice.amount).minus(amount).abs())}`);
    lines.push(`Reference score: ${match.reference_score ?? 'not available'}%`, `Customer/name score: ${match.name_score ?? 'not available'}%`, `Date score: ${match.date_score ?? 'not available'}%`);
  }
  if (match.amount_score != null) lines.push(`Amount score: ${match.amount_score}%`);
  if (match.semantic_score != null) lines.push(`Semantic score: ${match.semantic_score}%`);
  const warnings = match.reason?.warnings || [];
  const exceptions = context.exceptions.map((item) => item.exception_type).filter(Boolean);
  if (exceptions.length || warnings.length) lines.push('', `Exceptions: ${Array.from(new Set([...exceptions, ...warnings.map((item) => item.type)])).join(', ')}`);
  if (match.reason?.summary) lines.push('', `Reason: ${match.reason.summary}`);
  return lines.join('\n');
}

function deterministicConfidenceAnswer(context) {
  const match = context.reconciliationSummary;
  if (!match) return 'This invoice has not been reconciled yet, so no confidence score is available.';
  return [`Final confidence: ${Number(match.confidence_score || 0).toFixed(2)}%`, `Amount: ${match.amount_score ?? '-'}%`, `Reference: ${match.reference_score ?? '-'}%`, `Name: ${match.name_score ?? '-'}%`, `Semantic: ${match.semantic_score ?? '-'}%`, `Date: ${match.date_score ?? '-'}%`, 'The score is the weighted combination of these deterministic signals.'].join('\n');
}

function deterministicFallbackAnswer(question, context) {
  const category = classifyQuestion(question);
  if (category === 'RECONCILIATION' || category === 'HISTORY') return deterministicReconciliationAnswer(context);
  if (category === 'INVOICE_FACT') return deterministicFactAnswer(question, context.invoice);
  if (category === 'TAX_ARITHMETIC') return deterministicTaxAnswer(question, context.invoice, context.document, buildInvoiceCheckSummary(context.invoice, context.document)).answer;
  const transaction = context.transactions[0];
  if (category === 'PAYMENT' && transaction) return `The relevant transaction is ${transaction.transaction_id || 'not available'} for ${formatMoney(transaction.amount) || 'an unavailable amount'} on ${transaction.transaction_date || 'an unavailable date'}.`;
  return 'I could not generate an extended explanation, but the selected invoice facts remain available in this response.';
}

function mask(value) {
  const text = String(value || '');
  return text.length > 4 ? `${'*'.repeat(Math.max(0, text.length - 4))}${text.slice(-4)}` : text;
}

function normalizeSafeInvoice(invoice = {}) {
  return {
    invoiceId: invoice.invoice_id || invoice.invoiceId || null,
    invoiceNumber: invoice.invoice_number || invoice.invoiceId || invoice.invoice_id || null,
    customerName: invoice.customer_name || null,
    sellerName: invoice.seller_name || null,
    amount: formatMoney(invoice.amount),
    subtotal: formatMoney(invoice.subtotal),
    taxAmount: formatMoney(invoice.tax_amount),
    invoiceDate: invoice.invoice_date || null,
    dueDate: invoice.due_date || null,
    currency: invoice.currency || null,
    paymentReference: invoice.payment_reference || null
  };
}

async function getInvoiceContext(invoiceId, userId) {
  const invoice = await db('invoices').where({ invoice_id: invoiceId, user_id: userId }).first();
  if (!invoice) {
    throw new AppError('INVOICE_NOT_FOUND', 'Invoice not found.', 404);
  }

  const document = invoice.document_id
    ? await db('documents').where({ id: invoice.document_id, user_id: userId }).first()
    : null;

  const matches = await db('reconciliation_matches as rm')
    .join('invoices as i', 'i.id', 'rm.invoice_id')
    .where('i.id', invoice.id)
    .andWhere('i.user_id', userId)
    .select('rm.*')
    .orderBy([{ column: 'rm.matched_at', order: 'desc' }, { column: 'rm.id', order: 'desc' }])
    .limit(10);

  const exceptions = await db('exceptions as e')
    .join('invoices as i', 'i.id', 'e.invoice_id')
    .where('i.id', invoice.id)
    .andWhere('i.user_id', userId)
    .select('e.*')
    .orderBy([{ column: 'e.created_at', order: 'desc' }, { column: 'e.id', order: 'desc' }])
    .limit(20);

  const transactions = matches.length
    ? await db('bank_transactions')
        .where({ user_id: userId })
        .whereIn(
          'id',
          Array.from(
            new Set(
              matches.flatMap((match) =>
                Array.isArray(match.reason?.transactionIds) && match.reason.transactionIds.length
                  ? match.reason.transactionIds
                  : match.transaction_id
                    ? [match.transaction_id]
                    : []
              )
            )
          )
        )
    : [];

  const reconciliationSummary = matches[0]
    ? {
        match_type: matches[0].match_type,
        status: matches[0].status,
        confidence_score: matches[0].confidence_score,
        amount_score: matches[0].amount_score,
        reference_score: matches[0].reference_score,
        name_score: matches[0].name_score,
        semantic_score: matches[0].semantic_score,
        date_score: matches[0].date_score,
        reason: matches[0].reason,
        best_candidate: matches[0].best_candidate || matches[0].transaction_snapshot || null,
        transaction_snapshot: matches[0].transaction_snapshot || null
      }
    : null;

  return { invoice, document, matches, exceptions, transactions, reconciliationSummary };
}

function safeContext(context) {
  const { invoice, document, matches, exceptions, transactions, reconciliationSummary } = context;

  return {
    invoice: normalizeSafeInvoice(invoice),
    extracted_invoice: document?.extracted_data?.invoice || null,
    reconciliation: reconciliationSummary,
    reconciliation_history: matches.slice(0, 5).map((match) => ({
      match_type: match.match_type,
      status: match.status,
      confidence_score: match.confidence_score,
      amount_score: match.amount_score,
      reference_score: match.reference_score,
      name_score: match.name_score,
      semantic_score: match.semantic_score,
      date_score: match.date_score,
      amount_difference: match.amount_difference,
      reason: match.reason,
      best_candidate: match.best_candidate || match.transaction_snapshot || null
    })),
    exceptions: exceptions.map((exception) => ({
      exception_type: exception.exception_type,
      severity: exception.severity,
      description: exception.description
    })),
    transactions: transactions.map((transaction) => ({
      transaction_id: transaction.transaction_id,
      amount: formatMoney(transaction.amount),
      transaction_date: transaction.transaction_date,
      description: transaction.description,
      reference: transaction.reference,
      bank_account: mask(transaction.bank_account)
    }))
  };
}

function buildInvoiceCheckSummary(invoice, document) {
  const validation = taxValidation(invoice, document?.extracted_data || {});
  const jurisdiction = inferJurisdictionFromInvoice(invoice, document);

  return {
    ...validation,
    jurisdiction
  };
}

async function groq(messages) {
  if (!process.env.GROQ_API_KEY) {
    throw new AppError('GROQ_AUTH_FAILED', 'GROQ_API_KEY is not configured.', 503);
  }

  let response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages
      }),
      signal: AbortSignal.timeout(Number(process.env.GROQ_TIMEOUT_MS || 30000))
    });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new AppError('GROQ_TIMEOUT', 'Groq request timed out.', 504);
    }

    throw new AppError('GROQ_UNAVAILABLE', 'Groq service is unavailable.', 502);
  }

  const payload = await response.json().catch(() => null);
  if (response.status === 401) {
    throw new AppError('GROQ_AUTH_FAILED', 'Groq authentication failed.', 502);
  }
  if (response.status === 429) {
    throw new AppError('GROQ_RATE_LIMITED', 'Groq rate limit reached.', 429);
  }
  if (!response.ok) {
    throw new AppError('GROQ_FAILED', 'Groq request failed.', 502);
  }

  const text = payload?.choices?.[0]?.message?.content;
  if (!text) {
    throw new AppError('AI_RESPONSE_INVALID', 'Groq returned an empty response.', 502);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new AppError('AI_RESPONSE_INVALID', 'Groq returned malformed JSON.', 502);
  }
}

function normalizeAnswerPayload(answer, fallback) {
  if (answer && typeof answer === 'object') {
    return {
      answer: answer.answer || answer.summary || answer.response || fallback.answer,
      invoiceChecks: answer.invoiceChecks || fallback.invoiceChecks,
      taxKnowledge: answer.taxKnowledge || fallback.taxKnowledge,
      sources: Array.isArray(answer.sources) ? answer.sources : fallback.sources,
      confidence: answer.confidence || fallback.confidence,
      requiresProfessionalReview:
        typeof answer.requiresProfessionalReview === 'boolean'
          ? answer.requiresProfessionalReview
          : fallback.requiresProfessionalReview
    };
  }

  return fallback;
}

async function askInvoice({ invoiceId, userId, question, conversationId }) {
  const context = await getInvoiceContext(invoiceId, userId);
  const questionType = classifyQuestion(question);
  const validation = buildInvoiceCheckSummary(context.invoice, context.document);
  let taxKnowledge = { status: 'NOT_REQUIRED', jurisdiction: null, sources: [], citations: [], chunks: [] };
  if (questionType === 'TAX_REGULATORY') {
    taxKnowledge = await buildTaxKnowledgeContext({ invoice: context.invoice, document: context.document, question, dbClient: db });
  }

  const safeId = context.invoice.invoice_id || invoiceId;
  console.info('QA request invoice=%s question_type=%s invoice_loaded=%s reconciliation_loaded=%s exceptions_loaded=%s rag_required=%s', safeId, questionType, true, Boolean(context.reconciliationSummary), context.exceptions.length > 0, questionType === 'TAX_REGULATORY');

  let conversation = conversationId
    ? await db('ai_conversations')
        .where({
          conversation_id: conversationId,
          user_id: userId,
          invoice_id: context.invoice.id
        })
        .first()
    : null;

  if (!conversation) {
    conversation = (
      await db('ai_conversations')
        .insert({
          conversation_id: `CONV-${crypto.randomUUID()}`,
          user_id: userId,
          invoice_id: context.invoice.id,
          session_id: context.invoice.session_id
        })
        .returning('*')
    )[0];
  }

  const history = await db('ai_messages')
    .where({ conversation_id: conversation.id })
    .orderBy('created_at', 'desc')
    .limit(8);

  const promptPayload = {
    question,
    invoice: safeContext(context),
    deterministic_tax_validation: validation,
    authoritative_tax_knowledge: taxKnowledge
  };

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.reverse().map((message) => ({
      role: message.role,
      content: message.content
    })),
    {
      role: 'user',
      content: JSON.stringify(promptPayload)
    }
  ];

  let answer;
  let answerType = 'AI_EXPLANATION';
  let grounded = true;
  let limitations = [];
  if (questionType === 'INVOICE_FACT') {
    answer = { answer: deterministicFactAnswer(question, context.invoice, validation), answerType: 'DETERMINISTIC' };
  } else if (questionType === 'RECONCILIATION' || /confidence score/i.test(question)) {
    answer = { answer: /confidence/i.test(question) ? deterministicConfidenceAnswer(context) : deterministicReconciliationAnswer(context), answerType: 'DETERMINISTIC' };
  } else if (questionType === 'TAX_ARITHMETIC') {
    const deterministic = deterministicTaxAnswer(question, context.invoice, context.document, validation);
    answer = { answer: deterministic.answer, answerType: 'DETERMINISTIC' };
  } else if (questionType === 'TAX_REGULATORY' && taxKnowledge.status !== 'GROUNDING_AVAILABLE') {
    answer = { answer: `I can verify the arithmetic, but I cannot confirm the legal applicability of this tax rate from the available authoritative sources.`, answerType: 'DETERMINISTIC' };
    limitations = ['Authoritative tax evidence was unavailable.'];
    grounded = false;
  } else {
    try {
      answer = await groq(messages);
      answerType = questionType === 'TAX_REGULATORY' ? 'RAG_GROUNDED' : 'AI_EXPLANATION';
      console.info('QA request invoice=%s groq_called=true groq_status=success fallback_reason=none', safeId);
    } catch (error) {
      console.warn('QA request invoice=%s groq_called=true groq_status=failed fallback_reason=%s', safeId, error.code || 'GROQ_FAILURE');
      answer = {
        answer: questionType === 'TAX_REGULATORY'
          ? 'The authoritative tax context was retrieved, but the extended explanation service is temporarily unavailable. Review the attached authoritative sources for the legal guidance.'
          : deterministicFallbackAnswer(question, context),
        answerType: questionType === 'TAX_REGULATORY' ? 'RAG_GROUNDED' : 'DETERMINISTIC'
      };
      limitations = ['Extended AI explanation is temporarily unavailable.'];
    }
  }

  const normalized = normalizeAnswerPayload(answer, {
    answer: '',
    invoiceChecks: validation,
    taxKnowledge: {
      status: taxKnowledge.status,
      jurisdiction: taxKnowledge.jurisdiction
    },
    sources: taxKnowledge.sources,
    confidence: taxKnowledge.status === 'GROUNDING_AVAILABLE' ? 'HIGH' : 'MEDIUM',
    requiresProfessionalReview:
      taxKnowledge.status !== 'GROUNDING_AVAILABLE' || validation.status !== 'VALID'
  });
  normalized.answerType = answer.answerType || answer_type(answerType);
  normalized.grounded = grounded;
  normalized.facts = safeContext(context).invoice;
  normalized.reconciliation = safeContext(context).reconciliation;
  normalized.limitations = limitations;

  await db('ai_messages').insert([
    { conversation_id: conversation.id, role: 'user', content: question },
    { conversation_id: conversation.id, role: 'assistant', content: JSON.stringify(normalized) }
  ]);
  await db('ai_conversations').where({ id: conversation.id }).update({ updated_at: db.fn.now() });

  return {
    ...normalized,
    invoiceChecks: normalized.invoiceChecks || validation,
    taxKnowledge: normalized.taxKnowledge || {
      status: taxKnowledge.status,
      jurisdiction: taxKnowledge.jurisdiction
    },
    sources: normalized.sources || taxKnowledge.sources,
    conversationId: conversation.conversation_id
  };
}

function answer_type(value) {
  return value === 'RAG_GROUNDED' ? 'RAG_GROUNDED' : value === 'DETERMINISTIC' ? 'DETERMINISTIC' : 'AI_EXPLANATION';
}

async function analyzeReconciliation({ invoiceId, userId, question }) {
  const context = await getInvoiceContext(invoiceId, userId);
  return groq([
    {
      role: 'system',
      content: `${SYSTEM_PROMPT} Return JSON with summary, matched_factors, mismatches, possible_causes, recommended_actions, requires_manual_review. Never change scores.`
    },
    {
      role: 'user',
      content: JSON.stringify({
        question: question || 'Explain this reconciliation.',
        data: safeContext(context)
      })
    }
  ]);
}

module.exports = {
  analyzeReconciliation,
  askInvoice,
  buildInvoiceCheckSummary,
  getInvoiceContext,
  groq,
  isTaxQuestion,
  classifyQuestion,
  deterministicFactAnswer,
  deterministicTaxAnswer,
  deterministicReconciliationAnswer,
  deterministicConfidenceAnswer,
  deterministicFallbackAnswer,
  money,
  normalizeSafeInvoice,
  safeContext,
  taxValidation
};
