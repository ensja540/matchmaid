// Non-destructive, idempotent: lets a cleaner refer CUSTOMERS as well as other
// cleaners.
//
//   cd server && node migrate-client-referrals.mjs
//
// The same referrals table carries both, because they pay into the same pot: a
// cleaner's credit balance is the sum of their referral rows, and splitting the
// two schemes into two tables would mean summing two places to answer "what do
// I have". So a row now points at EITHER a referred cleaner or a referred
// client, never both and never neither.
//
// The cleaner's existing referral_code does both jobs - it is the role on the
// signup link that decides which scheme a new account joins, not the code. One
// code is one less thing for a cleaner to keep track of, and a code that only
// worked on one of the two links would be a support question forever.
import { query, pool } from './db.js';

await query('alter table referrals add column if not exists referred_client_id uuid references client_profiles(id) on delete cascade');

// referred_cleaner_id was `not null unique`. Both have to go: a client referral
// leaves it null, and a bare UNIQUE over a nullable column would still be right
// in Postgres but says less than the partial index that replaces it.
await query('alter table referrals alter column referred_cleaner_id drop not null');
await query('alter table referrals drop constraint if exists referrals_referred_cleaner_id_key');
await query(`create unique index if not exists referrals_referred_cleaner_uniq
               on referrals (referred_cleaner_id) where referred_cleaner_id is not null`);
// The same rule for customers: a customer can only ever be referred once, by
// one cleaner. Whoever's link they actually used keeps them.
await query(`create unique index if not exists referrals_referred_client_uniq
               on referrals (referred_client_id) where referred_client_id is not null`);
await query('create index if not exists referrals_referred_client_idx on referrals (referred_client_id)');

// Exactly one referee per row. Without this a row could carry both (paying two
// schemes for one signup) or neither (a credit owed to nobody).
await query('alter table referrals drop constraint if exists referrals_one_referee');
await query(`alter table referrals add constraint referrals_one_referee
               check ((referred_cleaner_id is null) <> (referred_client_id is null))`);

const n = await query(`
  select count(*) filter (where referred_cleaner_id is not null)::int as cleaners,
         count(*) filter (where referred_client_id  is not null)::int as clients,
         coalesce(sum(credit_cents), 0)::int as cents
    from referrals`);
const r = n.rows[0];
console.log(`referrals ready: ${r.cleaners} cleaner referral(s), ${r.clients} customer referral(s).`);
console.log(`$${(r.cents / 100).toFixed(2)} of credit awarded so far.`);

await pool.end();
