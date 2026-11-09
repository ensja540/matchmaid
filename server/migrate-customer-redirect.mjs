// Non-destructive, idempotent: lets the unanswered-enquiry sweep remember that it
// has already pointed the CUSTOMER at other cleaners for a given thread.
//
//   cd server && node migrate-customer-redirect.mjs
//
// Separate from chaser_count, which is the cleaner's side of the same silence.
// The cleaner is chased three times; the customer is told once that they don't
// have to keep waiting, and then left to it - a second "still no reply" email
// only rubs it in.
import { query, pool } from './db.js';

await query('alter table conversations add column if not exists customer_redirected_at timestamptz');

const n = await query(`
  select count(*) filter (where customer_redirected_at is not null)::int as redirected
    from conversations`);
console.log(`conversations ready: ${n.rows[0].redirected} customer(s) already pointed elsewhere.`);

await pool.end();
