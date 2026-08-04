// Non-destructive, idempotent: adds the nudge log and the opt-out flag.
//
//   cd server && node migrate-nudges.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query, pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
await query(await readFile(join(here, 'migrations', '009_nudges.sql'), 'utf8'));

const n = (await query('select count(*)::int as n from nudges')).rows[0].n;
const opted = (await query('select count(*)::int as n from users where nudge_opt_out')).rows[0].n;
console.log(`nudges logged: ${n}`);
console.log(`users opted out: ${opted}`);

await pool.end();
