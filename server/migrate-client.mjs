// Non-destructive: add customer home/contact fields to client_profiles.
import { query } from './db.js';

const stmts = [
  `alter table client_profiles add column if not exists phone text`,
  `alter table client_profiles add column if not exists bedrooms text`,
  `alter table client_profiles add column if not exists bathrooms text`,
  `alter table client_profiles add column if not exists home_type text`,
  `alter table client_profiles add column if not exists has_stairs boolean default false`,
  `alter table client_profiles add column if not exists profile_photo_url text`,
];
for (const sql of stmts) {
  await query(sql);
  console.log('ok:', sql);
}
process.exit(0);
