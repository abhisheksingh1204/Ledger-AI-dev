const knex = require('knex');
const { getDatabaseConfig } = require('../config/database');

module.exports = knex(getDatabaseConfig());
