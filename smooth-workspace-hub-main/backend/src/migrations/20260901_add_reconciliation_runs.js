exports.up = async function (knex) {
  await knex.schema.createTable('reconciliation_runs', (table) => {
    table.increments('id').primary();
    table.string('run_id', 100).unique().notNullable();
    table.integer('session_id').references('id').inTable('reconciliation_sessions').onDelete('CASCADE');
    table.string('user_id', 100).notNullable();
    table.string('status', 30).notNullable().defaultTo('RUNNING');
    table.timestamp('started_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();
  });
  await knex.schema.alterTable('reconciliation_matches', (table) => table.integer('run_id').references('id').inTable('reconciliation_runs').onDelete('CASCADE'));
  await knex.schema.alterTable('exceptions', (table) => table.integer('run_id').references('id').inTable('reconciliation_runs').onDelete('CASCADE'));
};

exports.down = async function (knex) {
  await knex.schema.alterTable('exceptions', (table) => table.dropColumn('run_id'));
  await knex.schema.alterTable('reconciliation_matches', (table) => table.dropColumn('run_id'));
  await knex.schema.dropTableIfExists('reconciliation_runs');
};
