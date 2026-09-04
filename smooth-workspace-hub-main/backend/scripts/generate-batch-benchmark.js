const fs = require('fs');
const path = require('path');

const invoices = [];
const transactions = [];
const groundTruth = {};
for (let index = 1; index <= 50; index += 1) {
  const id = `BENCH-INV-${String(index).padStart(3, '0')}`;
  const amount = 10000 + index * 137;
  invoices.push({ invoice_id: id, invoice_number: id, customer_name: `Customer ${String.fromCharCode(65 + (index % 10))}`, invoice_date: '2026-09-01', due_date: '2026-09-30', subtotal: amount, tax_amount: 0, amount, currency: 'INR', status: 'PENDING' });
  if (index <= 30 || index > 34 && index <= 38) {
    const txId = `BENCH-TXN-${String(index).padStart(3, '0')}`;
    transactions.push({ transaction_id: txId, transaction_date: '2026-09-05', amount, description: `Payment ${id}`, reference: id, currency: 'INR', status: 'PENDING' });
    groundTruth[id] = { expected_match_type: 'SINGLE', expected_transaction_ids: [txId] };
  } else if (index <= 48) {
    transactions.push({ transaction_id: `BENCH-TXN-${String(index).padStart(3, '0')}`, transaction_date: '2026-09-05', amount: amount - 100, description: `Payment Customer ${index}`, reference: '', currency: 'INR', status: 'PENDING' });
    groundTruth[id] = { expected_match_type: 'NONE', expected_transaction_ids: [] };
  } else {
    groundTruth[id] = { expected_match_type: 'NONE', expected_transaction_ids: [] };
  }
}
while (transactions.length < 68) transactions.push({ transaction_id: `BENCH-TXN-FILL-${transactions.length + 1}`, transaction_date: '2026-09-05', amount: 3210, description: 'Unrelated settlement', reference: '', currency: 'INR', status: 'PENDING' });
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'fixtures'), { recursive: true });
fs.writeFileSync(path.join(root, 'fixtures', 'batch-benchmark-ground-truth.json'), `${JSON.stringify(groundTruth, null, 2)}\n`);
console.log(JSON.stringify({ invoices, transactions, groundTruth }, null, 2));
