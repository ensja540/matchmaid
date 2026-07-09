// Separate the two sides into separate accounts.
//
// Until now one email was one account that could reach both portals: users.email
// carried a UNIQUE constraint and /api/login ignored the stored role, calling
// ensureProfile() to conjure the other side's profile on demand.
//
// Now an account is an (email, role) pair. The same person may hold a cleaner
// account and a customer account on one email address, but they are separate
// accounts with separate passwords and separate data, and a login only ever
// reaches the side it was created for.
//
// Non-destructive and idempotent. It drops the old single-column constraint and
// adds the composite one. It creates no rows and deletes none.
//
// It REFUSES to run if any email already appears twice, which cannot happen
// under the old constraint but would break the new one if the data were ever
// loaded from elsewhere. Better to stop than to half-apply.
import { query } from './db.js';

const dupes = await query(
  `select lower(email) as email, count(*)::int as n
     from users group by lower(email) having count(*) > 1`
);
if (dupes.rows.length) {
  console.error('Refusing to migrate: these emails appear more than once.');
  dupes.rows.forEach((r) => console.error(`  ${r.email} x${r.n}`));
  process.exit(1);
}

// Report who is currently using both sides. Under the new rule their login only
// reaches users.role; the other side's profile row stays put but is unreachable
// until they register that side separately.
const both = await query(
  `select u.email, u.role
     from users u
     join cleaner_profiles cp on cp.user_id = u.id
     join client_profiles  lp on lp.user_id = u.id`
);

// The unique index behind `email text not null unique` is named users_email_key
// by Postgres unless it was created explicitly.
await query('alter table users drop constraint if exists users_email_key');
await query('drop index if exists users_email_key');
await query(
  `create unique index if not exists users_email_role_key on users (lower(email), role)`
);

console.log('users: unique(email) dropped, unique(lower(email), role) added.');
if (both.rows.length) {
  console.log(`\n${both.rows.length} account(s) hold profiles on BOTH sides. Each keeps its`);
  console.log('users.role side; the other profile row is retained but unreachable:');
  both.rows.forEach((r) => console.log(`  ${r.email} keeps '${r.role}'`));
} else {
  console.log('No account holds profiles on both sides. Nothing is orphaned.');
}
process.exit(0);
