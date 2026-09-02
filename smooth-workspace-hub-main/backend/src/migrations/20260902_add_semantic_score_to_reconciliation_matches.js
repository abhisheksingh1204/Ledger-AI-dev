exports.up = async function (knex) {
  await knex.schema.alterTable('reconciliation_matches', (table) => {
    table.decimal('semantic_score', 5, 2).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('reconciliation_matches', (table) => {
    table.dropColumn('semantic_score');
  });
};
