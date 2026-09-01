// Non-destructive, idempotent: the cleaner's short review of the household.
//
//   cd server && node migrate-client-reviews.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query, pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
await query(await readFile(join(here, 'migrations', '015_client_reviews.sql'), 'utf8'));

const cols = (await query(
  `select column_name from information_schema.columns
    where table_name = 'client_reviews' order by ordinal_position`
)).rows.map((r) => r.column_name);
console.log('client_reviews:', cols.join(', ') || '(missing)');

const prof = (await query(
  `select column_name from information_schema.columns
    where table_name = 'client_profiles' and column_name in ('avg_rating', 'review_count')
    order by column_name`
)).rows.map((r) => r.column_name);
console.log('client_profiles gained:', prof.join(', ') || '(none)');

const { rows } = await query(
  `select (select count(*)::int from client_reviews) as household_reviews,
          (select count(*)::int from conversations c
             join enquiries e on e.id = c.enquiry_id
            where e.status = 'completed') as completed_cleans`
);
console.table(rows);
console.log(
  `${rows[0].completed_cleans} completed clean(s) are eligible for a household review.`
);

await pool.end();
