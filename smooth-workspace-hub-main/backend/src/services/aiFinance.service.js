const Decimal = require('decimal.js');
const crypto = require('crypto');
const db = require('../db/knex');
const { AppError } = require('../utils/api');

const SYSTEM_PROMPT = 'You are an AI Finance Controller assistant. Analyze only backend-provided facts. Never invent values, alter deterministic scores, or claim payment without evidence. Use backend calculations for arithmetic. Distinguish facts, possible causes, and recommendations. Do not provide authoritative tax/legal advice. Keep answers concise.';

function money(value) { return value === null || value === undefined || value === '' ? null : new Decimal(value); }
function taxValidation(invoice, extracted = {}) {
  const tax = extracted.invoice || extracted; const subtotal = money(invoice.subtotal || tax.subtotal); const total = money(invoice.amount || tax.total_amount); const actualTax = money(invoice.tax_amount || tax.tax_amount);
  if (!subtotal || !total || !actualTax) return { status: 'INSUFFICIENT_DATA' };
  const expectedTotal = subtotal.plus(actualTax); return { status: expectedTotal.eq(total) ? 'VALID' : 'INVALID', subtotal: subtotal.toFixed(2), actual_tax: actualTax.toFixed(2), expected_tax: actualTax.toFixed(2), actual_total: total.toFixed(2), expected_total: expectedTotal.toFixed(2) };
}
function mask(value) { const s = String(value || ''); return s.length > 4 ? `${'*'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}` : s; }
async function getInvoiceContext(invoiceId, userId) {
  const invoice = await db('invoices').where({ invoice_id: invoiceId, user_id: userId }).first();
  if (!invoice) throw new AppError('INVOICE_NOT_FOUND', 'Invoice not found.', 404);
  const document = invoice.document_id ? await db('documents').where({ id: invoice.document_id, user_id: userId }).first() : null;
  const matches = await db('reconciliation_matches').where({ invoice_id: invoice.id }).orderBy('matched_at', 'desc').limit(5);
  const exceptions = await db('exceptions').where({ invoice_id: invoice.id }).orderBy('created_at', 'desc').limit(20);
  const transactions = matches.length ? await db('bank_transactions').whereIn('id', matches.map((m) => m.transaction_id)).where({ user_id: userId }) : [];
  return { invoice, document, matches, exceptions, transactions };
}
function safeContext(context) {
  const { invoice, document, matches, exceptions, transactions } = context;
  return { invoice: { invoice_number: invoice.invoice_number || invoice.invoice_id, customer_name: invoice.customer_name, seller_name: invoice.seller_name, amount: invoice.amount, subtotal: invoice.subtotal, tax_amount: invoice.tax_amount, invoice_date: invoice.invoice_date, due_date: invoice.due_date, currency: invoice.currency }, extracted_invoice: document?.extracted_data?.invoice || null, reconciliation: matches.map((m) => ({ match_type: m.match_type, status: m.status, confidence_score: m.confidence_score, amount_score: m.amount_score, reference_score: m.reference_score, name_score: m.name_score, date_score: m.date_score, reason: m.reason })), exceptions: exceptions.map((e) => ({ exception_type: e.exception_type, severity: e.severity, description: e.description })), transactions: transactions.map((t) => ({ transaction_id: t.transaction_id, amount: t.amount, transaction_date: t.transaction_date, description: t.description, reference: t.reference, bank_account: mask(t.bank_account) })) };
}
async function groq(messages) {
  if (!process.env.GROQ_API_KEY) throw new AppError('GROQ_AUTH_FAILED', 'GROQ_API_KEY is not configured.', 503);
  let response;
  try { response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', temperature: 0, response_format: { type: 'json_object' }, messages }), signal: AbortSignal.timeout(Number(process.env.GROQ_TIMEOUT_MS || 30000)) }); } catch (e) { if (e.name === 'TimeoutError') throw new AppError('GROQ_TIMEOUT', 'Groq request timed out.', 504); throw new AppError('GROQ_UNAVAILABLE', 'Groq service is unavailable.', 502); }
  const payload = await response.json().catch(() => null); if (response.status === 401) throw new AppError('GROQ_AUTH_FAILED', 'Groq authentication failed.', 502); if (response.status === 429) throw new AppError('GROQ_RATE_LIMITED', 'Groq rate limit reached.', 429); if (!response.ok) throw new AppError('GROQ_FAILED', 'Groq request failed.', 502);
  const text = payload?.choices?.[0]?.message?.content; if (!text) throw new AppError('AI_RESPONSE_INVALID', 'Groq returned an empty response.', 502); try { return JSON.parse(text); } catch { throw new AppError('AI_RESPONSE_INVALID', 'Groq returned malformed JSON.', 502); }
}
async function askInvoice({ invoiceId, userId, question, conversationId }) {
  const context = await getInvoiceContext(invoiceId, userId); const validation = taxValidation(context.invoice, context.document?.extracted_data || {});
  let conversation = conversationId ? await db('ai_conversations').where({ conversation_id: conversationId, user_id: userId, invoice_id: context.invoice.id }).first() : null;
  if (!conversation) { conversation = (await db('ai_conversations').insert({ conversation_id: `CONV-${crypto.randomUUID()}`, user_id: userId, invoice_id: context.invoice.id, session_id: context.invoice.session_id }).returning('*'))[0]; }
  const history = await db('ai_messages').where({ conversation_id: conversation.id }).orderBy('created_at', 'desc').limit(8); const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history.reverse().map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: JSON.stringify({ question, invoice: safeContext(context), deterministic_tax_validation: validation }) }];
  const answer = await groq(messages); await db('ai_messages').insert([{ conversation_id: conversation.id, role: 'user', content: question }, { conversation_id: conversation.id, role: 'assistant', content: JSON.stringify(answer) }]); await db('ai_conversations').where({ id: conversation.id }).update({ updated_at: db.fn.now() });
  return { ...answer, conversationId: conversation.conversation_id, sources: ['invoice extracted data', 'deterministic reconciliation data', 'backend tax validation'] };
}
async function analyzeReconciliation({ invoiceId, userId, question }) { const context = await getInvoiceContext(invoiceId, userId); return groq([{ role: 'system', content: `${SYSTEM_PROMPT} Return JSON with summary, matched_factors, mismatches, possible_causes, recommended_actions, requires_manual_review. Never change scores.` }, { role: 'user', content: JSON.stringify({ question: question || 'Explain this reconciliation.', data: safeContext(context) }) }]); }
module.exports = { askInvoice, analyzeReconciliation, getInvoiceContext, safeContext, taxValidation, money };
