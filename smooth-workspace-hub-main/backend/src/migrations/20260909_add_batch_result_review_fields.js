exports.up = async function (knex) {
  await knex.schema.alterTable('reconciliation_matches', (table) => {
    table.string('review_status', 30).nullable();
    table.text('review_note').nullable();
    table.integer('selected_transaction_id').references('id').inTable('bank_transactions').onDelete('SET NULL');
  });
  await knex.raw('CREATE UNIQUE INDEX reconciliation_matches_run_invoice_unique ON reconciliation_matches(run_id, invoice_id) WHERE run_id IS NOT NULL AND invoice_id IS NOT NULL');
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS reconciliation_matches_run_invoice_unique');
  await knex.schema.alterTable('reconciliation_matches', (table) => {
    table.dropColumn('selected_transaction_id');
    table.dropColumn('review_note');
    table.dropColumn('review_status');
  });
};
