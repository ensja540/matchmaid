// Non-destructive, idempotent: optional per-hour surcharge on specialist cleans.
//
// A cleaner may elect to charge extra per hour for a deep clean, an end-of-
// tenancy clean or a one-off, on top of their normal hourly rate. Stored as
// [{ slug, extra }] where `extra` is dollars PER HOUR.
//
// Deliberately not folded into cleaner_profiles.addons: those are flat one-off
// amounts ("Oven +$5"), a different unit. Mixing them would silently mis-price.
import { query } from './db.js';

await query(`alter table cleaner_profiles
             add column if not exists service_surcharges jsonb not null default '[]'::jsonb`);

const r = await query(
  `select count(*)::int n,
          count(*) filter (where jsonb_array_length(service_surcharges) > 0)::int with_any
     from cleaner_profiles`
);
console.log(`service_surcharges ensured — ${r.rows[0].with_any}/${r.rows[0].n} cleaners have set one.`);
process.exit(0);
