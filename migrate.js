// migrate.js — applies schema.sql to DATABASE_URL
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  const client = await pool.connect();
  try {
    console.log(`Connecting to: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}`);
    await client.query(sql);
    console.log('✔ Schema applied successfully (users, packages, package_guides, bookings, payments, reviews, documents).');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('✘ Migration failed:', err.message);
  process.exit(1);
});
