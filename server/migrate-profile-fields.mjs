// Non-destructive, idempotent. Two new cleaner_profiles fields:
//
//  - residential_address: the cleaner's address, so the admin can check it
//    (with the legal name on the account) against their verification documents.
//  - clean_rates: per-clean-type hourly fee, e.g. { "regular": 35, "deep": 45,
//    "end-of-tenancy": 50 }. Replaces the single "desired rate" + surcharges.
//    A clean type with no entry here is one the cleaner does not offer.
//
// Supersedes migrate-residential-address.mjs (which added only the first column).
import { query } from './db.js';

await query('alter table cleaner_profiles add column if not exists residential_address text');
await query("alter table cleaner_profiles add column if not exists clean_rates jsonb not null default '{}'::jsonb");

console.log('cleaner_profiles.residential_address and clean_rates ensured.');
process.exit(0);
