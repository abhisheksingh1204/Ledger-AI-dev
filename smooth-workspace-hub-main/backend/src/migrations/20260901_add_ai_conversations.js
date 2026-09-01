exports.up = async function (knex) {
  await knex.schema.createTable('ai_conversations', (table) => {
    table.increments('id').primary();
    table.string('conversation_id', 100).unique().notNullable();
    table.string('user_id', 100).notNullable();
    table.integer('invoice_id').references('id').inTable('invoices').onDelete('CASCADE');
    table.integer('session_id').references('id').inTable('reconciliation_sessions').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
  await knex.schema.createTable('ai_messages', (table) => {
    table.increments('id').primary();
    table.integer('conversation_id').references('id').inTable('ai_conversations').onDelete('CASCADE');
    table.string('role', 20).notNullable();
    table.text('content').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};
exports.down = async function (knex) { await knex.schema.dropTableIfExists('ai_messages'); await knex.schema.dropTableIfExists('ai_conversations'); };
