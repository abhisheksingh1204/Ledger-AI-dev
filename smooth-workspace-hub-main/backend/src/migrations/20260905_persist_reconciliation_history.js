exports.up = async function up(knex) {
  await knex.schema.alterTable('reconciliation_runs', (table) => {
    table.integer('version').notNullable().defaultTo(1);
    table.integer('total_invoices').notNullable().defaultTo(0);
    table.integer('auto_matched_count').notNullable().defaultTo(0);
    table.integer('manual_review_count').notNullable().defaultTo(0);
    table.integer('unmatched_count').notNullable().defaultTo(0);
    table.integer('exception_count').notNullable().defaultTo(0);
    table.decimal('average_confidence', 5, 2).nullable();
    table.decimal('match_rate', 5, 2).nullable();
    table.integer('processing_time_ms').nullable();
    table.decimal('average_processing_time_ms', 12, 2).nullable();
    table.jsonb('weights').notNullable().defaultTo('{}');
    table.jsonb('thresholds').notNullable().defaultTo('{}');
  });

  await knex.schema.alterTable('reconciliation_matches', (table) => {
    table.decimal('amount_difference_percent', 8, 2).nullable();
    table.jsonb('best_candidate').nullable();
    table.jsonb('invoice_snapshot').nullable();
    table.jsonb('transaction_snapshot').nullable();
  });

  await knex.raw('CREATE INDEX IF NOT EXISTS reconciliation_runs_user_created_idx ON reconciliation_runs(user_id, started_at DESC)');
  await knex.raw('CREATE INDEX IF NOT EXISTS reconciliation_runs_session_version_idx ON reconciliation_runs(session_id, version DESC)');
  await knex.raw('CREATE INDEX IF NOT EXISTS reconciliation_matches_run_idx ON reconciliation_matches(run_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS exceptions_run_idx ON exceptions(run_id)');
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS exceptions_run_idx');
  await knex.raw('DROP INDEX IF EXISTS reconciliation_matches_run_idx');
  await knex.raw('DROP INDEX IF EXISTS reconciliation_runs_session_version_idx');
  await knex.raw('DROP INDEX IF EXISTS reconciliation_runs_user_created_idx');
  await knex.schema.alterTable('reconciliation_matches', (table) => {
    table.dropColumn('transaction_snapshot');
    table.dropColumn('invoice_snapshot');
    table.dropColumn('best_candidate');
    table.dropColumn('amount_difference_percent');
  });
  await knex.schema.alterTable('reconciliation_runs', (table) => {
    table.dropColumn('thresholds');
    table.dropColumn('weights');
    table.dropColumn('average_processing_time_ms');
    table.dropColumn('processing_time_ms');
    table.dropColumn('match_rate');
    table.dropColumn('average_confidence');
    table.dropColumn('exception_count');
    table.dropColumn('unmatched_count');
    table.dropColumn('manual_review_count');
    table.dropColumn('auto_matched_count');
    table.dropColumn('total_invoices');
    table.dropColumn('version');
  });
};
