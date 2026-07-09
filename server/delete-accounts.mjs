// One-off: delete named accounts and every row that depends on them.
//
// Order matters. cleaner_profiles/client_profiles cascade from users, but
// enquiries, conversations, messages and reviews reference the PROFILES with no
// cascade — so deleting a user first would cascade to their profile and then
// trip a foreign-key violation. We walk down the graph, then delete the user and
// let the profiles fall away with it.
//
// Runs in one transaction: it all lands or none of it does.
import { query } from './db.js';

const EMAILS = process.argv.slice(2);
if (!EMAILS.length) {
  console.error('Usage: node delete-accounts.mjs <email> [email...]');
  process.exit(1);
}

const users = await query('select id, email, role from users where email = any($1)', [EMAILS]);
if (!users.rows.length) {
  console.error('No such accounts. Nothing to do.');
  process.exit(1);
}
const missing = EMAILS.filter((e) => !users.rows.some((u) => u.email === e));
if (missing.length) {
  console.error('Refusing to run: these were named but not found: ' + missing.join(', '));
  process.exit(1);
}

const userIds = users.rows.map((u) => u.id);
console.log('Deleting ' + users.rows.length + ' account(s):');
users.rows.forEach((u) => console.log('  ' + u.email + ' (' + u.role + ')'));

const cp = await query('select id from cleaner_profiles where user_id = any($1)', [userIds]);
const lp = await query('select id from client_profiles  where user_id = any($1)', [userIds]);
const cleanerIds = cp.rows.map((r) => r.id);
const clientIds = lp.rows.map((r) => r.id);

// Conversations touching either side of these accounts.
const conv = await query(
  'select id from conversations where cleaner_id = any($1) or client_id = any($2)',
  [cleanerIds, clientIds]
);
const convIds = conv.rows.map((r) => r.id);

const n = {};
await query('begin');
try {
  const del = async (label, sql, params) => {
    const r = await query(sql, params);
    n[label] = r.rowCount;
  };

  await del('messages', 'delete from messages where conversation_id = any($1) or sender_user_id = any($2)', [convIds, userIds]);
  await del('reviews', 'delete from reviews where conversation_id = any($1) or cleaner_id = any($2) or client_id = any($3)', [convIds, cleanerIds, clientIds]);
  await del('conversations', 'delete from conversations where id = any($1)', [convIds]);
  await del('enquiries', 'delete from enquiries where cleaner_id = any($1) or client_id = any($2)', [cleanerIds, clientIds]);
  await del('verifications', 'delete from verifications where cleaner_id = any($1)', [cleanerIds]);
  // Profiles cascade from users; anything still hanging off a profile with its
  // own cascade (services, availability, addons, referrals) goes with them.
  await del('users', 'delete from users where id = any($1)', [userIds]);

  await query('commit');
} catch (err) {
  await query('rollback');
  console.error('\nRolled back, nothing deleted: ' + err.message);
  process.exit(1);
}

console.log('\nDeleted:');
Object.entries(n).forEach(([k, v]) => console.log('  ' + k + ': ' + v));

const left = await query('select email, role from users order by created_at');
console.log('\nRemaining users (' + left.rows.length + '):');
left.rows.forEach((r) => console.log('  ' + r.email + ' (' + r.role + ')'));
process.exit(0);
