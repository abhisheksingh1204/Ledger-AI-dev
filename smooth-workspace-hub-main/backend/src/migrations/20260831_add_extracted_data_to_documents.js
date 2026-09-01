exports.up = async function (knex) {
  await knex.schema.alterTable('documents', (table) => {
    table.jsonb('extracted_data').nullable();
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_documents_extracted_data
      ON documents
      USING GIN (extracted_data);
  `);
};

exports.down = async function (knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_documents_extracted_data;
  `);

  await knex.schema.alterTable('documents', (table) => {
    table.dropColumn('extracted_data');
  });
};
