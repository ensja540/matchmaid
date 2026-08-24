// Non-destructive, idempotent: add the country column and load the Australian
// suburbs for the six metros Match Maid is opening in.
//
//   cd server && node migrate-australia.mjs
//
// Source: Australia Post's postcode file (via Elkfox/Australian-Postcode-Data),
// filtered to localities within the built-up radius of each metro centre and
// stripped of delivery centres, mail centres and campus/hospital entries, which
// are postcodes rather than places anyone lives.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query, pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
await query(await readFile(join(here, 'migrations', '013_country.sql'), 'utf8'));

const suburbs = JSON.parse(await readFile(join(here, 'data', 'au_suburbs.json'), 'utf8'));
console.log(`loading ${suburbs.length} Australian suburbs...`);

// Insert one at a time against a (country, ta, lower(name)) existence check
// rather than ON CONFLICT: there is no unique index to conflict against (five
// real NZ rows would violate one), so the check has to be explicit.
let added = 0;
let already = 0;
for (const s of suburbs) {
  const exists = await query(
    `select 1 from suburbs
      where country = 'AU' and territorial_authority = $1 and lower(name) = lower($2)`,
    [s.ta, s.name]
  );
  if (exists.rows.length) { already++; continue; }
  await query(
    `insert into suburbs (name, region, territorial_authority, lat, lng, country)
     values ($1, $2, $3, $4, $5, 'AU')`,
    [s.name, s.region, s.ta, s.lat, s.lng]
  );
  added++;
}

console.log(`  added ${added}, already present ${already}`);

const byCountry = await query(
  `select country, count(*)::int as suburbs, count(distinct territorial_authority)::int as cities
     from suburbs group by country order by country`
);
console.table(byCountry.rows);

const auCities = await query(
  `select territorial_authority as city, region as state, count(*)::int as suburbs
     from suburbs where country = 'AU' group by 1, 2 order by 3 desc`
);
console.table(auCities.rows);

// The collisions this whole column exists to stop.
const clash = await query(
  `select lower(nz.name) as name, nz.territorial_authority as nz_city, au.territorial_authority as au_city
     from suburbs nz join suburbs au on lower(nz.name) = lower(au.name)
    where nz.country = 'NZ' and au.country = 'AU'
    order by 1 limit 12`
);
console.log(`\nname collisions now separated by country (showing ${clash.rows.length}):`);
console.table(clash.rows);

const total = await query(
  `select count(*)::int as n from suburbs nz
    where nz.country = 'NZ'
      and exists (select 1 from suburbs au where au.country = 'AU' and lower(au.name) = lower(nz.name))`
);
console.log(`${total.rows[0].n} NZ suburbs share a name with an Australian one.`);

await pool.end();
