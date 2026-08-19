// Non-destructive, idempotent: one exception row per cleaner per date.
//
//   cd server && node migrate-availability-exceptions.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query, pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
await query(await readFile(join(here, 'migrations', '011_availability_exception_unique.sql'), 'utf8'));

const n = (await query('select count(*)::int as n from availability_exceptions')).rows[0].n;
const idx = (await query(
  `select indexname from pg_indexes
    where tablename = 'availability_exceptions'
      and indexname = 'availability_exceptions_cleaner_date_idx'`
)).rows.length;
console.log(`exception rows: ${n}`);
console.log('unique (cleaner, date) index present:', idx === 1);

await pool.end();
