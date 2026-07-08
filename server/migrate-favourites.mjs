// A customer's saved ("starred") cleaners, so they can find previous/favourite
// cleaners fast. Idempotent.
import 'dotenv/config';
import { query } from './db.js';

const sql = `
create table if not exists client_favourites (
  id           bigserial primary key,
  client_user_id uuid not null references users(id) on delete cascade,
  cleaner_id   uuid not null references cleaner_profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (client_user_id, cleaner_id)
);
create index if not exists idx_client_favourites_user on client_favourites (client_user_id);`;

try {
  await query(sql);
  console.log('OK: client_favourites ensured');
  process.exit(0);
} catch (err) {
  console.error('migration failed:', err);
  process.exit(1);
}
