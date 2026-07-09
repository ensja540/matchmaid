// Non-destructive, idempotent: multi-dimension reviews.
//
// A cleaner marks an accepted enquiry 'completed'; that posts a system message
// of kind 'review_request' into the thread, which the customer taps to review.
//
// A review scores five categories out of 5 (one decimal). Their mean is the
// overall rating. "Would use again" is a yes/no kept OUT of the mean and
// surfaced separately as a percentage.
import { query } from './db.js';

// Enum values can't be added inside a transaction; each query() autocommits.
await query("alter type enquiry_status add value if not exists 'completed'");

// Distinguishes an ordinary chat message from a system review prompt.
await query("alter table messages add column if not exists kind text not null default 'text'");

// One review per conversation. booking_id stays null — bookings aren't used yet.
await query('alter table reviews add column if not exists conversation_id uuid references conversations(id) on delete cascade');
for (const col of ['quality', 'value_for_money', 'timeliness', 'punctuality', 'communication']) {
  await query(`alter table reviews add column if not exists ${col} numeric(2,1)`);
}
await query('alter table reviews add column if not exists would_use_again boolean');
await query('alter table reviews add column if not exists overall numeric(3,2)');
await query('create unique index if not exists reviews_conversation_uniq on reviews (conversation_id)');

// The legacy 1..5 integer `rating` stays (it's NOT NULL) — we write round(overall)
// into it so old readers keep working.
const r = await query('select count(*)::int as n from reviews');
console.log(`reviews: schema ensured, ${r.rows[0].n} existing row(s).`);
const m = await query("select count(*)::int as n from messages where kind = 'review_request'");
console.log(`messages.kind ensured, ${m.rows[0].n} review prompt(s) posted.`);
process.exit(0);
