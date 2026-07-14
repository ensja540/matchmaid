// Non-destructive, idempotent: records the date a clean is booked for.
//
// Until now the platform had no idea when a clean happened — the date lived
// only as prose inside chat messages, and the review prompt fired when the
// cleaner remembered to press "Mark clean complete". A cleaner who did a poor
// job never pressed it, so the reviews we collected were selected for cleans
// the cleaner felt good about.
//
// The date is captured when the cleaner accepts the enquiry, and a daily job
// posts the review prompt once it passes. The trigger is time, which nobody
// has an incentive to withhold.
//
// `enquiries.preferred_date` already exists but is dead — never written, never
// read. It means "the date the customer asked for", which is not the same as
// the date the two of them agreed on, so this is a new column rather than a
// revival of that one.
import 'dotenv/config';
import { query } from './db.js';

await query('alter table enquiries add column if not exists scheduled_on date');
await query('create index if not exists idx_enq_scheduled on enquiries (scheduled_on) where scheduled_on is not null');

const n = await query('select count(*)::int as n from enquiries where scheduled_on is not null');
console.log(`enquiries.scheduled_on ensured, ${n.rows[0].n} enquiry(s) carry a date.`);
process.exit(0);
