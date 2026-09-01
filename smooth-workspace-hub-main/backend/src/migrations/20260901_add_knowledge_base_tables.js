exports.up = async function (knex) {
  await knex.schema.createTable('knowledge_sources', (table) => {
    table.increments('id').primary();
    table.string('title', 500).notNullable();
    table.text('url').notNullable().unique();
    table.string('publisher', 255).notNullable();
    table.string('jurisdiction', 10).notNullable().defaultTo('IN');
    table.date('effective_date').nullable();
    table.timestamp('retrieved_at').notNullable().defaultTo(knex.fn.now());
    table.string('source_hash', 128).notNullable().unique();
    table.string('status', 20).notNullable().defaultTo('active');
    table.integer('version').notNullable().defaultTo(1);
    table.string('document_type', 100).notNullable().defaultTo('GUIDANCE');
    table.jsonb('metadata').notNullable().defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('knowledge_chunks', (table) => {
    table.increments('id').primary();
    table.integer('source_id').notNullable().references('id').inTable('knowledge_sources').onDelete('CASCADE');
    table.integer('chunk_index').notNullable();
    table.string('heading', 500).nullable();
    table.text('content').notNullable();
    table.jsonb('embedding').notNullable();
    table.jsonb('metadata').notNullable().defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_knowledge_sources_jurisdiction_status
      ON knowledge_sources(jurisdiction, status);

    CREATE INDEX IF NOT EXISTS idx_knowledge_sources_document_type
      ON knowledge_sources(document_type);

    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source_id
      ON knowledge_chunks(source_id);

    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_chunk_index
      ON knowledge_chunks(source_id, chunk_index);
  `);
};

exports.down = async function (knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_knowledge_chunks_chunk_index;
    DROP INDEX IF EXISTS idx_knowledge_chunks_source_id;
    DROP INDEX IF EXISTS idx_knowledge_sources_document_type;
    DROP INDEX IF EXISTS idx_knowledge_sources_jurisdiction_status;
  `);

  await knex.schema.dropTableIfExists('knowledge_chunks');
  await knex.schema.dropTableIfExists('knowledge_sources');
};
