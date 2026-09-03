exports.up = async function up(knex) {
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_user_document_identity_idx
      ON invoices(user_id, document_id)
      WHERE document_id IS NOT NULL;
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS invoices_user_document_identity_idx;
  `);
};
