// Stores feedback/suggestions submitted from the site's feedback widget.
// (No email provider yet — the operator reads these on the /admin dashboard.)
import 'dotenv/config';
import { query } from './db.js';

const sql = `
create table if not exists feedback (
  id         bigserial primary key,
  user_id    uuid references users(id) on delete set null,
  email      text,
  page       text,
  message    text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_feedback_created on feedback (created_at desc);`;

try {
  await query(sql);
  console.log('OK: feedback table ensured');
  process.exit(0);
} catch (err) {
  console.error('migration failed:', err);
  process.exit(1);
}
