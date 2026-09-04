exports.up = async function (knex) {
  await knex.schema.alterTable('reconciliation_runs', (table) => {
    table.string('mode', 20).notNullable().defaultTo('SINGLE');
    table.string('parent_run_id', 100).nullable();
    table.jsonb('metrics').notNullable().defaultTo('{}');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('reconciliation_runs', (table) => {
    table.dropColumn('metrics');
    table.dropColumn('parent_run_id');
    table.dropColumn('mode');
  });
};
