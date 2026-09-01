const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function buildConnection() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'Finance',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'abhishek'
  };
}

function getDatabaseConfig() {
  return {
    client: 'pg',
    connection: buildConnection(),
    pool: {
      min: Number(process.env.DB_POOL_MIN || 2),
      max: Number(process.env.DB_POOL_MAX || 10)
    }
  };
}

module.exports = {
  buildConnection,
  getDatabaseConfig
};
