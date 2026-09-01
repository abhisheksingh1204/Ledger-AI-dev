exports.up = async function (knex) {
  await knex.schema.alterTable('invoices', (table) => {
    table.string('invoice_number', 150).nullable();
    table.string('seller_name', 255).nullable();
    table.decimal('subtotal', 15, 2).nullable();
    table.decimal('tax_amount', 15, 2).nullable();
    table.string('payment_reference', 150).nullable();
  });

  await knex.schema.alterTable('bank_transactions', (table) => {
    table.string('reference', 150).nullable();
    table.string('direction', 20).nullable();
    table.decimal('debit', 15, 2).nullable();
    table.decimal('credit', 15, 2).nullable();
    table.decimal('balance', 15, 2).nullable();
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number
      ON invoices(invoice_number);
  `);
};

exports.down = async function (knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_invoices_invoice_number;
  `);

  await knex.schema.alterTable('bank_transactions', (table) => {
    table.dropColumn('balance');
    table.dropColumn('credit');
    table.dropColumn('debit');
    table.dropColumn('direction');
    table.dropColumn('reference');
  });

  await knex.schema.alterTable('invoices', (table) => {
    table.dropColumn('payment_reference');
    table.dropColumn('tax_amount');
    table.dropColumn('subtotal');
    table.dropColumn('seller_name');
    table.dropColumn('invoice_number');
  });
};
