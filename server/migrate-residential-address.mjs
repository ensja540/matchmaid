// Non-destructive, idempotent: a cleaner's residential address, captured so the
// admin can check it (with the legal name already on the account) against the
// verification documents the cleaner uploads.
import { query } from './db.js';

await query('alter table cleaner_profiles add column if not exists residential_address text');

console.log('cleaner_profiles.residential_address ensured.');
process.exit(0);
