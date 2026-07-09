// Non-destructive, idempotent: cleaning-products preference on both sides.
//
//   cleaner_profiles.brings_products — "I bring my own cleaning products"
//   client_profiles.needs_products   — "I need the cleaner to bring products"
//
// A customer who needs products only matches cleaners who bring them; everyone
// else sees every cleaner. Defaults are false, so existing rows keep matching
// exactly as they did before.
import { query } from './db.js';

await query('alter table cleaner_profiles add column if not exists brings_products boolean not null default false');
await query('alter table client_profiles  add column if not exists needs_products  boolean not null default false');

const c = await query('select count(*) filter (where brings_products) ::int as n, count(*)::int as total from cleaner_profiles');
const l = await query('select count(*) filter (where needs_products)  ::int as n, count(*)::int as total from client_profiles');
console.log(`cleaner_profiles.brings_products ensured — ${c.rows[0].n}/${c.rows[0].total} bring products.`);
console.log(`client_profiles.needs_products   ensured — ${l.rows[0].n}/${l.rows[0].total} need products.`);
process.exit(0);
