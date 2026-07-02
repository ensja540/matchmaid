// Non-destructive: add Auckland suburbs. Safe to run repeatedly.
import { query } from './db.js';

const subs = [
  'Ponsonby', 'Grey Lynn', 'Mount Eden', 'Newmarket', 'Parnell', 'Remuera',
  'Epsom', 'Mount Albert', 'Takapuna', 'Devonport', 'Manukau', 'Henderson',
];
for (const name of subs) {
  await query(
    `insert into suburbs (name, region, territorial_authority)
     values ($1, 'Auckland', 'Auckland') on conflict (name, region) do nothing`,
    [name]
  );
}
console.log('Auckland suburbs ensured:', subs.length);
process.exit(0);
