// The fake-referral flags, and the plus-addressing hole they sit behind.
//
// Nothing here blocks a referral except an outright self-referral - the rest is
// description for a human to judge. So what is tested is that the description
// is right: a made-up-looking referral lights up, an ordinary one stays quiet,
// and "+1" does not get you your own $10.
//
//   cd server && node ../tools/referral-fraud-test.mjs [http://127.0.0.1:3000]
import { query, pool } from 'file:///C:/Matchmaid/server/db.js';
import { normaliseEmail, sameMailbox, emailAffinity } from 'file:///C:/Matchmaid/server/email-identity.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
let fails = 0;
const ck = (l, ok, d) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 200) : ''}`);
};

// ---- The mailbox rules, on their own ------------------------------------
ck('a +tag is the same mailbox', sameMailbox('vincent@x.co.nz', 'vincent+1@x.co.nz'));
ck('gmail ignores dots', sameMailbox('vin.cent@gmail.com', 'vincent@gmail.com'));
ck('  ...but other providers do not', !sameMailbox('vin.cent@outlook.com', 'vincent@outlook.com'));
ck('different people are different', !sameMailbox('ana@x.co.nz', 'ben@x.co.nz'));
ck('normalising is case-insensitive', normaliseEmail('  Vincent+A@X.CO.NZ ') === 'vincent@x.co.nz');
ck('a lookalike is flagged as close', emailAffinity('jack@firm.co.nz', 'jack2@firm.co.nz') === 'close');
ck('a shared work domain is a weak signal', emailAffinity('ana@firm.co.nz', 'ben@firm.co.nz') === 'domain');
ck('  ...but a shared free domain is no signal at all', emailAffinity('ana@gmail.com', 'ben@gmail.com') === null);

const tag = 'fraud-' + process.pid;
const made = { users: [], cleaners: [], clients: [] };
const CODE = ('F' + String(process.pid)).toUpperCase().slice(0, 8).replace(/[^A-Z0-9]/g, 'X');

const signUp = async (email, referralCode, role = 'customer') => {
  const r = await fetch(BASE + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, fullName: 'Fraudy Tester', email, password: 'test-password-123', country: 'NZ', referralCode }),
  });
  const body = await r.json().catch(() => ({}));
  const userId = body.user?.id || body.userId;
  if (userId) {
    made.users.push(userId);
    const lp = await query('select id from client_profiles where user_id = $1', [userId]);
    if (lp.rows[0]) made.clients.push(lp.rows[0].id);
  }
  return userId;
};

try {
  const admin = (await query("select id from users where lower(email) = 'ensor.jack@gmail.com' and role = 'cleaner'")).rows[0]?.id;
  if (!admin) throw new Error('no admin cleaner account to authorise the admin endpoint');

  // A cleaner on a non-free domain, so the domain signal is meaningful.
  const cu = (await query(
    `insert into users (email, role, full_name, email_verified, country) values ($1,'cleaner',$2,true,'NZ') returning id`,
    [`${tag}-boss@fraudco.test`, 'Fraud Boss'])).rows[0].id;
  const cid = (await query(
    `insert into cleaner_profiles (user_id, business_name, listing_status, referral_code, hourly_rate_min, clean_rates)
     values ($1,'Fraud Co','active',$2,40,$3) returning id`,
    [cu, CODE, JSON.stringify({ regular: 40 })])).rows[0].id;
  made.users.push(cu); made.cleaners.push(cid);

  // ---- The cheat the guard exists to stop ------------------------------
  const selfId = await signUp(`${tag}-boss+customer@fraudco.test`, CODE);
  ck('a cleaner cannot refer themselves with a +tag', !!selfId, 'signup itself must still work');
  const selfRef = await query(
    `select 1 from referrals r join client_profiles lp on lp.id = r.referred_client_id where lp.user_id = $1`, [selfId]);
  ck('  ...and no referral is recorded for it', selfRef.rows.length === 0, selfRef.rows);

  // ---- A referral that looks made up -----------------------------------
  const fakeId = await signUp(`${tag}-boss1@fraudco.test`, CODE);
  const fakeClient = (await query('select id from client_profiles where user_id = $1', [fakeId])).rows[0].id;
  // Booked instantly, with nothing said, and the date has been and gone.
  await query(
    `insert into enquiries (client_id, cleaner_id, status, scheduled_on, responded_at)
     values ($1,$2,'accepted', current_date - 2, now())`,
    [fakeClient, cid]);

  let r = await fetch(`${BASE}/api/admin/referrals?userId=${admin}&country=NZ`);
  let body = await r.json();
  const flagged = body.referrals.find((x) => x.refereeEmail === `${tag}-boss1@fraudco.test`);
  const codes = (flagged?.flags || []).map((f) => f.code);
  ck('the made-up referral is found', !!flagged, body.referrals.length);
  ck('  ...flagged as a lookalike address', codes.includes('lookalike-email'), codes);
  ck('  ...flagged for booking instantly', codes.includes('instant-booking'), codes);
  ck('  ...flagged for booking in silence', codes.includes('silent-booking'), codes);
  ck('  ...flagged for a clean that never happened', codes.includes('never-happened'), codes);
  ck('  ...and scores high enough to surface', (flagged?.risk || 0) >= 4, flagged?.risk);

  // ---- An ordinary referral must stay quiet ----------------------------
  const realId = await signUp(`${tag}-someone@gmail.com`, CODE);
  const realClient = (await query('select id from client_profiles where user_id = $1', [realId])).rows[0].id;
  // Booked a fortnight after signing up, still in the future.
  await query(
    `insert into enquiries (client_id, cleaner_id, status, scheduled_on, responded_at)
     values ($1,$2,'accepted', current_date + 7, now())`,
    [realClient, cid]);
  await query('update users set created_at = now() - interval \'14 days\' where id = $1', [realId]);

  r = await fetch(`${BASE}/api/admin/referrals?userId=${admin}&country=NZ`);
  body = await r.json();
  const ok = body.referrals.find((x) => x.refereeEmail === `${tag}-someone@gmail.com`);
  const okCodes = (ok?.flags || []).map((f) => f.code);
  ck('an ordinary referral is not called a lookalike', !okCodes.includes('lookalike-email'), okCodes);
  ck('  ...nor an instant booking', !okCodes.includes('instant-booking'), okCodes);
  ck('  ...nor a clean that never happened', !okCodes.includes('never-happened'), okCodes);
  ck('  ...and stays below the surfacing line', (ok?.risk || 0) < 4, { risk: ok?.risk, okCodes });

  // ---- The rollup names the cleaner, not just the rows ------------------
  const boss = body.cleaners.find((c) => c.referrer === 'Fraud Co');
  ck('the cleaner is rolled up', !!boss, body.cleaners);
  ck('  ...with the flagged count against them', (boss?.flagged || 0) >= 1, boss);

  ck('the admin endpoint refuses a non-admin', (await fetch(`${BASE}/api/admin/referrals?userId=${made.users[1]}`)).status === 403);
} catch (err) {
  fails++;
  console.log('FAIL  threw:', err.message);
} finally {
  await query('delete from enquiries where cleaner_id = any($1::uuid[])', [made.cleaners]).catch(() => {});
  await query('delete from referrals where referrer_cleaner_id = any($1::uuid[])', [made.cleaners]).catch(() => {});
  await query('delete from referrals where referred_client_id = any($1::uuid[])', [made.clients]).catch(() => {});
  await query('delete from cleaner_profiles where id = any($1::uuid[])', [made.cleaners]).catch(() => {});
  await query('delete from client_profiles where id = any($1::uuid[])', [made.clients]).catch(() => {});
  await query('delete from users where email like $1', [`${tag}-%`]).catch(() => {});
  await pool.end();
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
