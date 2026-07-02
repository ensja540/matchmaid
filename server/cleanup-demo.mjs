// One-off: remove demo/seed accounts (all @example.com) and their data.
// Real accounts (e.g. gmail) are left untouched.
import { query } from './db.js';

const { rows: du } = await query("select id, email from users where email like '%@example.com'");
if (!du.length) {
  console.log('No demo accounts found.');
  process.exit(0);
}
const ids = du.map((r) => r.id);
console.log('Demo accounts to remove:', du.map((r) => r.email).join(', '));

const guard = (a) => (a.length ? a : ['00000000-0000-0000-0000-000000000000']);
const cp = guard((await query('select id from cleaner_profiles where user_id = any($1)', [ids])).rows.map((r) => r.id));
const clp = guard((await query('select id from client_profiles where user_id = any($1)', [ids])).rows.map((r) => r.id));

// Delete referencing rows first (these FKs have no ON DELETE CASCADE).
await query('delete from messages m using conversations c where m.conversation_id = c.id and (c.cleaner_id = any($1) or c.client_id = any($2))', [cp, clp]);
await query('delete from messages where sender_user_id = any($1)', [ids]);
await query('delete from conversations where cleaner_id = any($1) or client_id = any($2)', [cp, clp]);
await query('delete from reviews where cleaner_id = any($1) or client_id = any($2)', [cp, clp]);
await query('delete from bookings where cleaner_id = any($1) or client_id = any($2)', [cp, clp]);
await query('delete from enquiries where cleaner_id = any($1) or client_id = any($2)', [cp, clp]);

// Deleting the users cascades to their profiles -> services/areas/availability/
// verifications/subscriptions/featured_placements.
const del = await query('delete from users where id = any($1)', [ids]);
console.log('Deleted demo users:', del.rowCount);
process.exit(0);
