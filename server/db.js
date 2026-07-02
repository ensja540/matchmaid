// Single shared connection pool to the Neon (or any) Postgres database.
// The connection string lives in .env as DATABASE_URL and is never committed.
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error(
    '\n  Missing DATABASE_URL.\n' +
      '  Create server/.env with a line like:\n' +
      '    DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require\n'
  );
  process.exit(1);
}

// Neon and most hosted Postgres require SSL. `sslmode=require` in the URL plus
// this relaxed setting keeps the mock simple without a CA cert file.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const query = (text, params) => pool.query(text, params);
