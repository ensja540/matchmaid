// Email every cleaner whose listing is priced below their country's floor, to
// tell them it has come off the directory and ask them to set a real rate.
//
//   cd server && node notify-underpriced.mjs            # report only
//   cd server && node notify-underpriced.mjs --send     # actually send
//
// Dry by default. Sending mail to real people is the kind of thing that should
// need saying out loud, and the report alone answers "who is affected" most of
// the times this is run.
//
// Sent once per cleaner, recorded in the nudges table so a second run does not
// mail the same person again. It is a transactional notice, not a nudge, so it
// deliberately ignores nudge_opt_out: someone who opted out of "finish your
// profile" is still owed the news that their listing is down. The table is
// borrowed purely for its uniqueness - that is what it is for.
import { query, pool } from './db.js';
import { emailEnabled, sendRateFloorEmail } from './email.js';
// The same numbers the server enforces, not a second copy of them.
import { COUNTRY_FLOORS, COUNTRY_FLOOR_WHY } from './floors.mjs';

const KIND = 'cleaner_under_floor';
const send = process.argv.includes('--send');


const { rows } = await query(
  `select u.id as user_id, u.email, u.full_name, u.country,
          cp.business_name, cp.hourly_rate_min, cp.listing_status,
          exists (select 1 from nudges n where n.user_id = u.id and n.kind = $1) as already_told
     from cleaner_profiles cp
     join users u on u.id = cp.user_id
    where u.role = 'cleaner' and u.status = 'active'
      and cp.hourly_rate_min is not null
    order by cp.hourly_rate_min`,
  [KIND]
);

const under = rows.filter((r) => {
  const floor = COUNTRY_FLOORS[r.country] ?? COUNTRY_FLOORS.NZ;
  return Number(r.hourly_rate_min) < floor;
});

if (!under.length) {
  console.log('No listing is priced below its floor. Nothing to do.');
  await pool.end();
  process.exit(0);
}

console.log(`${under.length} listing(s) below the floor:\n`);
for (const r of under) {
  const floor = COUNTRY_FLOORS[r.country] ?? COUNTRY_FLOORS.NZ;
  const who = r.business_name || r.full_name;
  console.log(
    `  ${who} <${r.email}> — $${Number(r.hourly_rate_min)}/hr ` +
      `(${r.country} floor $${floor}, listing ${r.listing_status})` +
      (r.already_told ? ' — already emailed, skipping' : '')
  );
}

const todo = under.filter((r) => !r.already_told);
if (!send) {
  console.log(`\nDry run. ${todo.length} would be emailed. Re-run with --send to do it.`);
  await pool.end();
  process.exit(0);
}
if (!emailEnabled()) {
  console.error('\nRESEND_API_KEY is not set, so nothing would actually be delivered. Aborting.');
  await pool.end();
  process.exit(1);
}

console.log('');
let sent = 0;
for (const r of todo) {
  const floor = COUNTRY_FLOORS[r.country] ?? COUNTRY_FLOORS.NZ;
  const res = await sendRateFloorEmail({
    to: r.email,
    name: r.business_name || r.full_name,
    rate: Number(r.hourly_rate_min),
    floor,
    why: COUNTRY_FLOOR_WHY[r.country] ?? COUNTRY_FLOOR_WHY.NZ,
    country: r.country,
  });
  // Only logged once it actually went out, so a failed send is retried by the
  // next run rather than silently marked done.
  if (res && res.ok) {
    await query('insert into nudges (user_id, kind) values ($1, $2) on conflict do nothing', [r.user_id, KIND]);
    sent += 1;
    console.log(`  sent to ${r.email}`);
  } else {
    console.error(`  FAILED for ${r.email}:`, res);
  }
}
console.log(`\n${sent} of ${todo.length} emailed.`);

await pool.end();
