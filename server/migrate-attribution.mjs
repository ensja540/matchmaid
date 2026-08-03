// Non-destructive, idempotent: adds first-touch signup attribution to users.
//
//   cd server && node migrate-attribution.mjs
//
// Everyone who signed up before this keeps NULL across all five columns. They
// are reported as "unknown", never back-filled to "direct" - we don't know, and
// guessing would quietly overstate whichever channel we guessed.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query, pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
const sql = await readFile(join(here, 'migrations', '008_signup_attribution.sql'), 'utf8');
await query(sql);

const { rows } = await query(
  `select count(*)::int as total,
          count(acq_source)::int as attributed,
          count(*) filter (where acq_source is null)::int as unknown
     from users where role in ('client','cleaner')`
);
const r = rows[0];
console.log(`users: ${r.total} total, ${r.attributed} attributed, ${r.unknown} unknown (pre-existing)`);

const cols = await query(
  `select column_name from information_schema.columns
    where table_name = 'users' and column_name like 'acq_%' order by column_name`
);
console.log('columns now present:', cols.rows.map((c) => c.column_name).join(', '));

await pool.end();
