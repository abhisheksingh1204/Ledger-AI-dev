exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('bank_transactions', 'invoice_reference');
  if (!hasColumn) {
    await knex.schema.alterTable('bank_transactions', (table) => {
      table.string('invoice_reference', 150).nullable();
    });
  }
};

exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('bank_transactions', 'invoice_reference');
  if (hasColumn) {
    await knex.schema.alterTable('bank_transactions', (table) => {
      table.dropColumn('invoice_reference');
    });
  }
};
