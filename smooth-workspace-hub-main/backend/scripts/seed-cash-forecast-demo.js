const db = require('../src/db/knex');

const USER_ID = 'demo-user';
const SESSION_KEY = 'DEMO-FORECAST-SESSION';
const CURRENCY = 'INR';

function dateAtOffset(offset) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function seed() {
  await db.transaction(async (trx) => {
    await trx('reconciliation_sessions').where({ user_id: USER_ID, session_id: SESSION_KEY }).del();

    const [session] = await trx('reconciliation_sessions').insert({
      session_id: SESSION_KEY,
      user_id: USER_ID,
      status: 'COMPLETED'
    }).returning('*');

    const historical = [
      ['DEMO-CASH-HIST-A1', 'Customer A', -30, 2],
      ['DEMO-CASH-HIST-A2', 'Customer A', -60, 5],
      ['DEMO-CASH-HIST-A3', 'Customer A', -90, -1],
      ['DEMO-CASH-HIST-B1', 'Customer B', -45, 7],
      ['DEMO-CASH-HIST-C1', 'Customer C', -75, 15]
    ];
    const open = [
      ['DEMO-CASH-001', 'Customer A', 10000, 2],
      ['DEMO-CASH-002', 'Customer B', 20000, 9],
      ['DEMO-CASH-003', 'Customer C', 30000, 31],
      ['DEMO-CASH-004', 'Customer D', 40000, 84]
    ];
    const invoices = [];
    for (const [invoiceId, customer, dueOffset, delay] of historical) {
      invoices.push({ invoice_id: invoiceId, invoice_number: invoiceId, user_id: USER_ID, session_id: session.id, customer_name: customer, amount: '100.00', invoice_date: dateAtOffset(dueOffset - 30), due_date: dateAtOffset(dueOffset), currency: CURRENCY, status: 'PAID' });
    }
    for (const [invoiceId, customer, amount, dueOffset] of open) {
      invoices.push({ invoice_id: invoiceId, invoice_number: invoiceId, user_id: USER_ID, session_id: session.id, customer_name: customer, amount: amount.toFixed(2), invoice_date: dateAtOffset(dueOffset - 30), due_date: dateAtOffset(dueOffset), currency: CURRENCY, status: 'PENDING' });
    }
    const insertedInvoices = await trx('invoices').insert(invoices).returning('*');
    const historicalInvoices = insertedInvoices.slice(0, historical.length);
    const transactions = [];
    for (let index = 0; index < historical.length; index += 1) {
      const [, , dueOffset, delay] = historical[index];
      transactions.push({ transaction_id: `DEMO-CASH-TX-${index + 1}`, user_id: USER_ID, session_id: session.id, description: `DEMO_FORECAST payment ${historical[index][0]}`, amount: '100.00', transaction_date: dateAtOffset(dueOffset + delay), currency: CURRENCY, status: 'RECONCILED' });
    }
    const insertedTransactions = await trx('bank_transactions').insert(transactions).returning('*');
    const [run] = await trx('reconciliation_runs').insert({ run_id: `DEMO-CASH-RUN-${Date.now()}`, session_id: session.id, user_id: USER_ID, status: 'COMPLETED', completed_at: trx.fn.now() }).returning('*');
    await trx('reconciliation_matches').insert(historicalInvoices.map((invoice, index) => ({ run_id: run.id, session_id: session.id, invoice_id: invoice.id, transaction_id: insertedTransactions[index].id, confidence_score: 100, amount_score: 100, reference_score: 100, name_score: 100, date_score: 100, amount_difference: '0.00', match_type: 'AUTO_MATCH', status: 'MATCHED', reason: { source: 'DEMO_FORECAST', transactionIds: [insertedTransactions[index].id] } })));
  });
  console.log('Seeded DEMO_FORECAST cash forecast data for demo-user.');
}

seed().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.destroy());
