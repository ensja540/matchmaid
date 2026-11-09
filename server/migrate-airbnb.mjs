// Non-destructive: add the Airbnb clean service type. Safe to run repeatedly.
//
// A base clean type with its own hourly rate (see BASE_SERVICE_SLUGS in
// server.js and CLEAN_TYPES in maid.js), not a priced extra. The row has to
// exist before any cleaner can offer it: cleaner_services is written by slug
// against this table, and an unknown slug is silently skipped.
import { query } from './db.js';

await query(
  `insert into service_types (name, slug) values ('Airbnb clean', 'airbnb')
   on conflict (slug) do nothing`
);
console.log('Airbnb clean service ensured.');
process.exit(0);
