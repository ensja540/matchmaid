// Non-destructive, idempotent: hold a proposed date on an enquiry while the two
// parties agree one in the chat.
//
//   cd server && node migrate-date-proposal.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query, pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
await query(await readFile(join(here, 'migrations', '012_enquiry_date_proposal.sql'), 'utf8'));

const cols = (await query(
  `select column_name from information_schema.columns
    where table_name = 'enquiries' and column_name in ('proposed_date', 'proposed_by')
    order by column_name`
)).rows.map((r) => r.column_name);
console.log('enquiries columns present:', cols.join(', ') || '(none)');

// Nothing is backfilled: an accepted enquiry already has its date in
// scheduled_on, and a pending one has nothing to propose yet.
const { rows } = await query(
  `select status, count(*)::int as n,
          count(scheduled_on)::int as booked,
          count(proposed_date)::int as proposed
     from enquiries group by status order by status`
);
console.table(rows);

await pool.end();
