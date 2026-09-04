const { asyncHandler, AppError } = require('../utils/api');
const db = require('../db/knex');

async function review(req, res, approved) {
  const match = await db('reconciliation_matches as m').join('invoices as i', 'i.id', 'm.invoice_id').where({ 'm.id': req.params.matchId, 'i.user_id': req.currentUserId }).select('m.*', 'i.user_id').first();
  if (!match) throw new AppError('MATCH_NOT_FOUND', 'Reconciliation match was not found.', 404);
  if (match.match_type !== 'MANUAL_REVIEW') throw new AppError('MATCH_NOT_REVIEWABLE', 'Only manual-review matches can be reviewed.', 400);
  const selectedId = req.body?.selectedTransactionId || match.transaction_id;
  if (approved && selectedId) {
    const conflict = await db('reconciliation_matches as m').join('invoices as i', 'i.id', 'm.invoice_id').where({ 'i.user_id': req.currentUserId, 'm.transaction_id': selectedId, 'm.status': 'MATCHED' }).whereNot('m.id', match.id).first();
    if (conflict) throw new AppError('TRANSACTION_ALREADY_USED', 'The selected transaction is already confirmed for another invoice.', 409);
  }
  const now = db.fn.now();
  const [updated] = await db('reconciliation_matches').where({ id: match.id }).update({ status: approved ? 'MATCHED' : 'PENDING_REVIEW', review_status: approved ? 'APPROVED' : 'REJECTED', reviewed_by: req.currentUserId, reviewed_at: now, review_note: req.body?.note || null, selected_transaction_id: approved ? selectedId : null }, '*');
  if (approved) await db('exceptions').where({ invoice_id: match.invoice_id }).whereIn('exception_type', ['LOW_CONFIDENCE_MATCH', 'MULTIPLE_POSSIBLE_MATCHES']).whereNull('resolved_at').update({ resolved_at: now });
  await db('audit_log').insert({ action: approved ? 'MANUAL_MATCH_APPROVED' : 'MANUAL_MATCH_REJECTED', table_name: 'reconciliation_matches', record_id: match.id, user_id: req.currentUserId, old_value: { status: match.status, review_status: match.review_status || null }, new_value: { status: updated.status, review_status: updated.review_status, selectedTransactionId: selectedId || null, note: req.body?.note || null } });
  return res.json({ success: true, data: { matchId: updated.id, status: updated.status, reviewStatus: updated.review_status, reviewedBy: updated.reviewed_by, reviewedAt: updated.reviewed_at } });
}

const approve = asyncHandler((req, res) => review(req, res, true));
const reject = asyncHandler((req, res) => review(req, res, false));
module.exports = { approve, reject };
