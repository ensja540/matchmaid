// Cleaners bring their own products and equipment by default, unless they say
// otherwise. Flips the column default and backfills existing rows.
//
// Safe to backfill: brings_products shipped defaulting to false, so a false row
// means "never chose", not "deliberately opted out".
import { query } from './db.js';

await query('alter table cleaner_profiles alter column brings_products set default true');
const r = await query('update cleaner_profiles set brings_products = true where brings_products = false');
const t = await query('select count(*) filter (where brings_products)::int y, count(*)::int n from cleaner_profiles');
console.log(`default flipped to true; backfilled ${r.rowCount} row(s).`);
console.log(`${t.rows[0].y}/${t.rows[0].n} cleaners now bring their own products.`);
process.exit(0);
