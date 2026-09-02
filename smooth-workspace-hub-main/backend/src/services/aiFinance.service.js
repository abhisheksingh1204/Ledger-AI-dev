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

function taxValidation(invoice = {}, extracted = {}) {
  const tax = extracted.invoice || extracted;
  const subtotal = money(invoice.subtotal || tax.subtotal);
  const total = money(invoice.amount || tax.total_amount || tax.grand_total);
  const actualTax = money(invoice.tax_amount || tax.tax_amount);

  if (!subtotal || !total || !actualTax) {
    return {
      status: 'INSUFFICIENT_DATA',
      arithmeticStatus: 'INSUFFICIENT_DATA'
    };
  }

  const expectedTotal = subtotal.plus(actualTax);
  const status = expectedTotal.eq(total) ? 'VALID' : 'INVALID';

  return {
    status,
    arithmeticStatus: status,
    subtotal: subtotal.toFixed(2),
    actual_tax: actualTax.toFixed(2),
    expected_tax: actualTax.toFixed(2),
    actual_total: total.toFixed(2),
    expected_total: expectedTotal.toFixed(2),
    grandTotal: total.toFixed(2)
  };
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
        reason: matches[0].reason
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
      reason: match.reason
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
  const validation = buildInvoiceCheckSummary(context.invoice, context.document);
  const taxKnowledge = await buildTaxKnowledgeContext({
    invoice: context.invoice,
    document: context.document,
    question,
    dbClient: db
  });

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
  try {
    answer = await groq(messages);
  } catch (error) {
    answer = {
      answer:
        isTaxQuestion(question) && taxKnowledge.status === 'AUTHORITATIVE_SOURCE_NOT_FOUND'
          ? 'AUTHORITATIVE_SOURCE_NOT_FOUND'
          : 'Unable to generate a grounded answer right now.',
      confidence: 'LOW',
      requiresProfessionalReview: true
    };
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
  money,
  normalizeSafeInvoice,
  safeContext,
  taxValidation
};
