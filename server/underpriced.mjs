// Who is listed below their country's price floor, and telling them so.
//
// Shared by two callers that need exactly the same behaviour: the command-line
// script next door, and the /api/tasks/underpriced-notices endpoint. Render's
// free tier has no shell, so the script alone would be a thing that could be
// written and never run - hence the endpoint, and hence this module rather than
// two copies of the rule drifting apart.
//
// A listing under the floor has already been taken out of search by the query
// filters in server.js. This is the other half of that: the cleaner being told
// it happened and what to do, rather than quietly disappearing.
import { query } from './db.js';
import { emailEnabled, sendRateFloorEmail } from './email.js';
import { COUNTRY_FLOORS, COUNTRY_FLOOR_WHY } from './floors.mjs';

// Borrowed from the nudges table purely for its (user_id, kind) uniqueness,
// which is what stops a second run mailing the same person again.
//
// It is a transactional notice, NOT a nudge, so it deliberately ignores
// nudge_opt_out: someone who opted out of "finish your profile" is still owed
// the news that their listing is down.
export const UNDERPRICED_KIND = 'cleaner_under_floor';

const floorFor = (cc) => COUNTRY_FLOORS[String(cc || '').toUpperCase()] ?? COUNTRY_FLOORS.NZ;
const whyFor = (cc) => COUNTRY_FLOOR_WHY[String(cc || '').toUpperCase()] ?? COUNTRY_FLOOR_WHY.NZ;

// Every active cleaner listed below their own country's floor, with whether
// they have already been told.
export async function findUnderpriced() {
  const { rows } = await query(
    `select u.id as user_id, u.email, u.full_name, u.country,
            cp.business_name, cp.hourly_rate_min, cp.listing_status,
            exists (select 1 from nudges n where n.user_id = u.id and n.kind = $1) as already_told
       from cleaner_profiles cp
       join users u on u.id = cp.user_id
      where u.role = 'cleaner' and u.status = 'active'
        and cp.hourly_rate_min is not null
      order by cp.hourly_rate_min`,
    [UNDERPRICED_KIND]
  );
  return rows
    .filter((r) => Number(r.hourly_rate_min) < floorFor(r.country))
    .map((r) => ({
      userId: r.user_id,
      email: r.email,
      name: r.business_name || r.full_name,
      country: r.country,
      rate: Number(r.hourly_rate_min),
      floor: floorFor(r.country),
      listingStatus: r.listing_status,
      alreadyTold: r.already_told,
    }));
}

// Mail everyone who has not been told yet.
//
// DRY BY DEFAULT. Sending mail to real people should need saying out loud, and
// the report alone answers "who is affected" most times this is run.
//
// A send is only recorded once it has actually gone out, so a failed one is
// retried by the next run rather than silently marked done.
export async function notifyUnderpriced({ send = false } = {}) {
  const under = await findUnderpriced();
  const todo = under.filter((r) => !r.alreadyTold);
  const report = { found: under.length, pending: todo.length, sent: 0, failed: [], listings: under };

  if (!send || !todo.length) return { ...report, dryRun: !send };
  if (!emailEnabled()) {
    return { ...report, dryRun: false, error: 'RESEND_API_KEY is not set, so nothing would be delivered.' };
  }

  for (const r of todo) {
    const res = await sendRateFloorEmail({
      to: r.email,
      name: r.name,
      rate: r.rate,
      floor: r.floor,
      why: whyFor(r.country),
      country: r.country,
    });
    if (res && res.ok) {
      await query('insert into nudges (user_id, kind) values ($1, $2) on conflict do nothing', [r.userId, UNDERPRICED_KIND]);
      report.sent += 1;
    } else {
      report.failed.push({ email: r.email, res });
    }
  }
  return { ...report, dryRun: false };
}
