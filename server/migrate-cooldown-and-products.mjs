// Two small, idempotent, non-destructive schema tweaks:
//  1. users.removed_at — when an account was closed, so cleaners face a
//     cooling-off period before they can reactivate (customers are exempt).
//  2. client_profiles.needs_products default true — customers now default to
//     "cleaner brings products" ticked. Existing rows are left as-is so any
//     choice already made is respected; only new profiles get the new default.
// Run locally against the prod DB: `node server/migrate-cooldown-and-products.mjs`
import 'dotenv/config';
import { query } from './db.js';

await query(`alter table users add column if not exists removed_at timestamptz`);
await query(`alter table client_profiles alter column needs_products set default true`);

console.log('users.removed_at ensured; client_profiles.needs_products now defaults to true.');
process.exit(0);
