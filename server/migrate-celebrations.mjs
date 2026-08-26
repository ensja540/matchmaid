// Non-destructive, idempotent: remember which perfect reviews have already
// been celebrated to the cleaner.
//
//   cd server && node migrate-celebrations.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query, pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
await query(await readFile(join(here, 'migrations', '014_review_celebrated.sql'), 'utf8'));

const col = (await query(
  `select column_name from information_schema.columns
    where table_name = 'reviews' and column_name = 'celebrated_at'`
)).rows.length;
console.log('reviews.celebrated_at present:', col === 1);

const { rows } = await query(
  `select count(*)::int as reviews,
          count(*) filter (where overall >= 5)::int as perfect,
          count(*) filter (where overall >= 5 and celebrated_at is null)::int as pending
     from reviews where status = 'published'`
);
console.table(rows);
console.log(
  `${rows[0].pending} perfect review(s) will celebrate the next time that cleaner logs in.`
);

await pool.end();
