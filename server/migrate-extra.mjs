// Non-destructive migration: add hourly rate range + the extra suburbs used by
// the location picker. Safe to run repeatedly (idempotent).
import { query } from './db.js';

const stmts = [
  `alter table cleaner_profiles add column if not exists hourly_rate_min numeric(8,2)`,
  `alter table cleaner_profiles add column if not exists hourly_rate_max numeric(8,2)`,
  `update cleaner_profiles
     set hourly_rate_min = coalesce(hourly_rate_min, greatest(hourly_rate - 4, 0)),
         hourly_rate_max = coalesce(hourly_rate_max, hourly_rate + 4)
   where hourly_rate is not null`,
];
for (const sql of stmts) {
  await query(sql);
  console.log('ok:', sql.split('\n')[0].trim());
}

const subs = [
  ['Merivale', 'Christchurch City'], ['Ilam', 'Christchurch City'], ['Addington', 'Christchurch City'],
  ['St Albans', 'Christchurch City'], ['Sydenham', 'Christchurch City'], ['Cashmere', 'Christchurch City'],
  ['Hornby', 'Christchurch City'], ['Prebbleton', 'Christchurch City'], ['West Melton', 'Christchurch City'],
  ['Woodend', 'Christchurch City'], ['Pegasus', 'Christchurch City'],
];
for (const [name, ta] of subs) {
  await query(
    `insert into suburbs (name, region, territorial_authority)
     values ($1, 'Canterbury', $2) on conflict (name, region) do nothing`,
    [name, ta]
  );
}
console.log('suburbs ensured:', subs.length);
process.exit(0);
