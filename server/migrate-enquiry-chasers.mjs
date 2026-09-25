// Non-destructive, idempotent: lets the reminder sweep remember how many times
// it has already chased a cleaner about an unanswered enquiry.
//
//   cd server && node migrate-enquiry-chasers.mjs
//
// Counted rather than timestamped alone, because the cadence escalates and then
// STOPS. Without the count, a daily sweep has no way to tell "chase them again
// tomorrow" from "this one has had its three and is now being ignored on
// purpose", and mail that never gives up is how a marketplace teaches its
// cleaners to filter it.
//
// conversations.last_notified_at already exists and is NOT this. That one is
// the new-message notifier's quiet period, driven by someone sending something;
// this one is driven by nobody sending anything, which is the whole point.
import { query, pool } from './db.js';

await query('alter table conversations add column if not exists chaser_count integer not null default 0');
await query('alter table conversations add column if not exists chaser_last_at timestamptz');
await query(`create index if not exists conversations_chaser_idx
               on conversations (chaser_last_at) where chaser_count > 0`);

const n = await query(`
  select count(*)::int as total,
         count(*) filter (where chaser_count > 0)::int as chased
    from conversations`);
console.log(`conversations ready: ${n.rows[0].total} thread(s), ${n.rows[0].chased} already chased.`);

await pool.end();
