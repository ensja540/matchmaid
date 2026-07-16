// Adds email-confirmation columns to users. Idempotent and non-destructive.
// Existing accounts are backfilled as verified so the hard gate never locks
// anyone who signed up before this shipped; only new signups start unverified.
// Run locally against the prod DB: `node server/migrate-email-verify.mjs`
import 'dotenv/config';
import { query } from './db.js';

await query(`alter table users add column if not exists email_verified boolean not null default false`);
await query(`alter table users add column if not exists verify_code text`);
await query(`alter table users add column if not exists verify_expires timestamptz`);
// Backfill: everyone who already exists is treated as confirmed.
await query(`update users set email_verified = true where email_verified = false and created_at < now()`);

console.log('users.email_verified, verify_code, verify_expires ensured (existing rows backfilled verified).');
process.exit(0);
