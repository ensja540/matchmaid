// Non-destructive, idempotent: cleaner-to-cleaner referrals.
//
// Every cleaner gets a short referral code. When someone who signed up with that
// code becomes FULLY verified — ID, police and insurance all approved — the
// referrer earns $10 of credit toward future subscription payments, once.
//
// The referrals row is created at signup with credit_cents = 0 and credited_at
// null; the credit is stamped on later, when the referee clears verification.
import { randomBytes } from 'node:crypto';
import { query } from './db.js';

await query('alter table cleaner_profiles add column if not exists referral_code text');
await query('create unique index if not exists cleaner_profiles_referral_code_uniq on cleaner_profiles (referral_code)');

await query(`
  create table if not exists referrals (
    id                   uuid primary key default gen_random_uuid(),
    referrer_cleaner_id  uuid not null references cleaner_profiles(id) on delete cascade,
    -- unique: a cleaner can only ever be referred by one person, once.
    referred_cleaner_id  uuid not null unique references cleaner_profiles(id) on delete cascade,
    credit_cents         integer not null default 0,
    credited_at          timestamptz,
    created_at           timestamptz not null default now(),
    constraint referrals_no_self check (referrer_cleaner_id <> referred_cleaner_id)
  )
`);
await query('create index if not exists referrals_referrer_idx on referrals (referrer_cleaner_id)');

// Backfill a code for every existing cleaner. Ambiguous characters removed so a
// code can be read aloud or copied off a screen without confusion.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => {
  const b = randomBytes(6);
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
};

const missing = await query('select id from cleaner_profiles where referral_code is null');
let made = 0;
for (const row of missing.rows) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await query('update cleaner_profiles set referral_code = $2 where id = $1', [row.id, makeCode()]);
      made++;
      break;
    } catch (err) {
      if (err.code !== '23505') throw err; // collision — try another code
    }
  }
}

const t = await query('select count(*)::int n from cleaner_profiles where referral_code is not null');
const r = await query('select count(*)::int n, coalesce(sum(credit_cents),0)::int c from referrals');
console.log(`referral_code backfilled for ${made} cleaner(s); ${t.rows[0].n} now have one.`);
console.log(`referrals table ready: ${r.rows[0].n} row(s), $${(r.rows[0].c / 100).toFixed(2)} credit awarded.`);
process.exit(0);
