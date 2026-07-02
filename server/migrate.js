// Runs the two migration files against the database in order.
// Safe to re-run: it drops the schema first so a fresh, clean copy is built
// every time (fine for a mock; do NOT do this on a real production DB).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));

const files = [
  join(here, 'migrations', '001_init.sql'),
  join(here, 'migrations', '002_seed.sql'),
  join(here, 'migrations', '003_availability_seed.sql'),
];

async function run() {
  const client = await pool.connect();
  try {
    console.log('Resetting schema (public)…');
    await client.query('drop schema if exists public cascade; create schema public;');

    for (const file of files) {
      const sql = await readFile(file, 'utf8');
      console.log(`Applying ${file.split(/[\\/]/).pop()}…`);
      await client.query(sql);
    }

    const { rows } = await client.query('select count(*)::int as n from cleaner_profiles');
    console.log(`\nDone. ${rows[0].n} sample cleaners loaded. Database is ready.`);
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
