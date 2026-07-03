// Adds a jsonb `addons` column to cleaner_profiles so maids can offer priced
// extras (e.g. [{ "slug": "oven", "price": 5 }]). Idempotent.
import 'dotenv/config';
import { query } from './db.js';

const sql = `alter table cleaner_profiles
  add column if not exists addons jsonb not null default '[]'::jsonb;`;

try {
  await query(sql);
  console.log('OK: cleaner_profiles.addons ensured');
  process.exit(0);
} catch (err) {
  console.error('migration failed:', err);
  process.exit(1);
}
