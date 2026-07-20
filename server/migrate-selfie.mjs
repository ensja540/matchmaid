// Non-destructive, idempotent: adds the selfie that accompanies an ID check.
//
//   cd server && node migrate-selfie.mjs
//
// Existing ID verifications keep a null selfie_url - they were approved under
// the old rules and are not retrospectively incomplete.
import { query, pool } from './db.js';

await query('alter table verifications add column if not exists selfie_url text');

const { rows } = await query(
  `select type, count(*)::int as n, count(selfie_url)::int as with_selfie
     from verifications group by type order by type`
);
console.log('verifications by type:');
for (const r of rows) console.log(`  ${r.type}: ${r.n} (${r.with_selfie} with a selfie)`);

await pool.end();
