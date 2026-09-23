// db.js — PostgreSQL connection layer.
// Every route calls only `query()` (or `getClient()` for transactions) from here,
// so this is the single file that would change if you ever moved providers.
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function getClient() {
  return pool.connect(); // caller must call client.release()
}

module.exports = { query, getClient, pool };
