exports.up = async function (knex) {
  await knex.schema.alterTable('invoices', (table) => {
    table.string('currency', 3).defaultTo('INR').alter();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('invoices', (table) => {
    table.string('currency', 3).defaultTo('USD').alter();
  });
};
