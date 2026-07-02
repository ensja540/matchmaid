// Non-destructive: add the Window clean service type. Safe to run repeatedly.
import { query } from './db.js';

await query(
  `insert into service_types (name, slug) values ('Window clean', 'windows')
   on conflict (slug) do nothing`
);
console.log('Window clean service ensured.');
process.exit(0);
