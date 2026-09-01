exports.up = async function (knex) {
  await knex.raw(`

    CREATE TABLE reconciliation_sessions (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(100) UNIQUE NOT NULL,
      user_id VARCHAR(100) NOT NULL,
      status VARCHAR(30) DEFAULT 'CREATED',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );


    CREATE TABLE documents (
      id SERIAL PRIMARY KEY,
      document_id VARCHAR(100) UNIQUE NOT NULL,

      session_id INT
        REFERENCES reconciliation_sessions(id)
        ON DELETE CASCADE,

      user_id VARCHAR(100) NOT NULL,

      document_type VARCHAR(30) NOT NULL,

      original_filename VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100),
      file_size BIGINT,

      cloudinary_public_id VARCHAR(500) NOT NULL,
      cloudinary_asset_id VARCHAR(255),

      cloudinary_url TEXT NOT NULL,
      cloudinary_secure_url TEXT,

      cloudinary_resource_type VARCHAR(30),
      cloudinary_format VARCHAR(30),
      cloudinary_version BIGINT,

      upload_status VARCHAR(30) DEFAULT 'UPLOADED',
      processing_status VARCHAR(30) DEFAULT 'PENDING',

      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );


    CREATE TABLE invoices (
      id SERIAL PRIMARY KEY,

      invoice_id VARCHAR(100) NOT NULL,

      user_id VARCHAR(100) NOT NULL,

      session_id INT
        REFERENCES reconciliation_sessions(id)
        ON DELETE CASCADE,

      document_id INT
        REFERENCES documents(id)
        ON DELETE SET NULL,

      customer_name VARCHAR(255),

      amount DECIMAL(15, 2),

      invoice_date DATE,
      due_date DATE,

      currency VARCHAR(3) DEFAULT 'USD',

      status VARCHAR(30) DEFAULT 'PENDING',

      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),

      UNIQUE(user_id, invoice_id)
    );


    CREATE TABLE bank_transactions (
      id SERIAL PRIMARY KEY,

      transaction_id VARCHAR(100) NOT NULL,

      user_id VARCHAR(100) NOT NULL,

      session_id INT
        REFERENCES reconciliation_sessions(id)
        ON DELETE CASCADE,

      document_id INT
        REFERENCES documents(id)
        ON DELETE SET NULL,

      description VARCHAR(1000),

      amount DECIMAL(15, 2),

      transaction_date DATE,

      bank_account VARCHAR(100),

      currency VARCHAR(3),

      status VARCHAR(30) DEFAULT 'PENDING',

      created_at TIMESTAMP DEFAULT NOW(),

      UNIQUE(user_id, transaction_id)
    );


    CREATE TABLE reconciliation_matches (
      id SERIAL PRIMARY KEY,

      session_id INT
        REFERENCES reconciliation_sessions(id)
        ON DELETE CASCADE,

      invoice_id INT
        REFERENCES invoices(id)
        ON DELETE CASCADE,

      transaction_id INT
        REFERENCES bank_transactions(id)
        ON DELETE CASCADE,

      confidence_score DECIMAL(5, 2),

      amount_score DECIMAL(5, 2),
      reference_score DECIMAL(5, 2),
      name_score DECIMAL(5, 2),
      date_score DECIMAL(5, 2),

      amount_difference DECIMAL(15, 2),

      match_type VARCHAR(50),
      status VARCHAR(30),

      reason JSONB,

      matched_at TIMESTAMP DEFAULT NOW(),

      reviewed_by VARCHAR(100),
      reviewed_at TIMESTAMP
    );


    CREATE TABLE audit_log (
      id SERIAL PRIMARY KEY,

      action VARCHAR(50),

      table_name VARCHAR(50),

      record_id INT,

      old_value JSONB,
      new_value JSONB,

      user_id VARCHAR(100),

      created_at TIMESTAMP DEFAULT NOW()
    );


    CREATE TABLE exceptions (
      id SERIAL PRIMARY KEY,

      session_id INT
        REFERENCES reconciliation_sessions(id)
        ON DELETE CASCADE,

      invoice_id INT
        REFERENCES invoices(id)
        ON DELETE SET NULL,

      transaction_id INT
        REFERENCES bank_transactions(id)
        ON DELETE SET NULL,

      exception_type VARCHAR(50),

      severity VARCHAR(20),

      description TEXT,

      created_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP
    );


    CREATE INDEX idx_documents_session
      ON documents(session_id);

    CREATE INDEX idx_documents_user
      ON documents(user_id);

    CREATE INDEX idx_documents_type
      ON documents(document_type);

    CREATE INDEX idx_invoices_session
      ON invoices(session_id);

    CREATE INDEX idx_invoices_user
      ON invoices(user_id);

    CREATE INDEX idx_transactions_session
      ON bank_transactions(session_id);

    CREATE INDEX idx_transactions_user
      ON bank_transactions(user_id);

    CREATE INDEX idx_matches_session
      ON reconciliation_matches(session_id);

  `);
};


exports.down = async function (knex) {
  await knex.raw(`

    DROP TABLE IF EXISTS exceptions;
    DROP TABLE IF EXISTS audit_log;
    DROP TABLE IF EXISTS reconciliation_matches;
    DROP TABLE IF EXISTS bank_transactions;
    DROP TABLE IF EXISTS invoices;
    DROP TABLE IF EXISTS documents;
    DROP TABLE IF EXISTS reconciliation_sessions;

  `);
};
