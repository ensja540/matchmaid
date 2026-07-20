// Non-destructive, idempotent: loads the nationwide town/suburb list.
//
// Run this against a live database instead of `npm run migrate` - that script
// DROPS THE PUBLIC SCHEMA before rebuilding, which would wipe real accounts.
// This one only inserts, and `on conflict (name, region) do nothing` means it
// is safe to run as many times as you like.
//
//   cd server && node migrate-nz-locations.mjs
//
// Suburb names repeat across regions (four Richmonds, two Bishopdales), which
// the unique (name, region) constraint handles - and is why the app resolves
// suburbs by id rather than by name.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query, pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));

const before = await query('select count(*)::int as n from suburbs');

const sql = await readFile(join(here, 'migrations', '004_nz_locations.sql'), 'utf8');
await query(sql);

const after = await query('select count(*)::int as n from suburbs');
const regions = await query('select region, count(*)::int as n from suburbs group by region order by region');

console.log(`suburbs: ${before.rows[0].n} -> ${after.rows[0].n} (+${after.rows[0].n - before.rows[0].n})`);
for (const r of regions.rows) console.log(`  ${r.region}: ${r.n}`);

await pool.end();
