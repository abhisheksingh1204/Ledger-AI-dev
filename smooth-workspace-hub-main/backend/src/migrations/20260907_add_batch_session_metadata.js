exports.up = async function (knex) {
  await knex.schema.alterTable('reconciliation_sessions', (table) => {
    table.string('mode', 20).notNullable().defaultTo('SINGLE');
    table.integer('invoice_document_count').notNullable().defaultTo(0);
    table.integer('bank_document_count').notNullable().defaultTo(0);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('reconciliation_sessions', (table) => {
    table.dropColumn('bank_document_count');
    table.dropColumn('invoice_document_count');
    table.dropColumn('mode');
  });
};
