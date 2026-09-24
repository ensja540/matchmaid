// Cleaner-to-customer referrals, and the quick-book link that feeds them.
//
// The things that matter: a customer who signs up on a cleaner's code is linked
// to them, the $10 lands when (and only when) that customer books a clean, it
// lands exactly once, a cleaner cannot refer their own customer account, and
// the quick-book link resolves to the right listing.
//
//   cd server && node ../tools/referral-test.mjs [http://127.0.0.1:3000]
import { query, pool } from 'file:///C:/Matchmaid/server/db.js';

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
let fails = 0;
const ck = (l, ok, d) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 200) : ''}`);
};
const get = async (p) => {
  const r = await fetch(BASE + p);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const tag = 'refx-' + process.pid;
const made = { users: [], cleaners: [], clients: [] };

const mkCleaner = async (slug, code) => {
  const u = (await query(
    'insert into users (email, role, full_name, email_verified, country) values ($1,$2,$3,true,$4) returning id',
    [`${tag}-${slug}@example.invalid`, 'cleaner', `Refx ${slug}`, 'NZ'])).rows[0].id;
  const c = (await query(
    `insert into cleaner_profiles (user_id, business_name, listing_status, referral_code, hourly_rate_min, clean_rates)
     values ($1,$2,'active',$3,40,$4) returning id`,
    [u, `Refx ${slug}`, code, JSON.stringify({ regular: 40 })])).rows[0].id;
  made.users.push(u);
  made.cleaners.push(c);
  return { userId: u, cleanerId: c };
};

// A customer created the way a real one is: through the register endpoint, so
// the referral is linked by the same code path the site uses.
const signUpCustomer = async (slug, referralCode) => {
  const r = await fetch(BASE + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'customer',
      fullName: `Refx ${slug} Customer`,
      email: `${tag}-${slug}@example.invalid`,
      password: 'test-password-123',
      country: 'NZ',
      referralCode,
    }),
  });
  const body = await r.json().catch(() => ({}));
  const userId = body.user?.id || body.userId;
  if (userId) {
    made.users.push(userId);
    const lp = await query('select id from client_profiles where user_id = $1', [userId]);
    if (lp.rows[0]) made.clients.push(lp.rows[0].id);
  }
  return { status: r.status, body, userId };
};

const creditFor = async (cleanerId) =>
  Number((await query(
    'select coalesce(sum(credit_cents),0)::int as c from referrals where referrer_cleaner_id = $1',
    [cleanerId])).rows[0].c);

try {
  const CODE = ('T' + String(process.pid)).toUpperCase().slice(0, 8).replace(/[^A-Z0-9]/g, 'X');
  const cleaner = await mkCleaner('cleaner', CODE);

  // ---- The quick-book link -----------------------------------------------
  let res = await fetch(`${BASE}/b/${CODE}`, { redirect: 'manual' });
  const loc = res.headers.get('location') || '';
  ck('the quick-book link redirects', res.status === 302, res.status);
  ck('  ...to that cleaner\'s own listing', loc.includes(`cleaner=${cleaner.cleanerId}`), loc);
  ck('  ...carrying the code so the signup can credit them', loc.includes(`ref=${CODE}`), loc);

  res = await fetch(`${BASE}/b/${CODE.toLowerCase()}`, { redirect: 'manual' });
  ck('a code typed in lower case still works', (res.headers.get('location') || '').includes(cleaner.cleanerId));

  // A poster with a typo should still land somewhere useful, not on a 404.
  res = await fetch(`${BASE}/b/ZZZZZZ9`, { redirect: 'manual' });
  ck('an unknown code falls back to browse', (res.headers.get('location') || '') === '/browse', res.headers.get('location'));

  // ---- Signing a customer up on the code ---------------------------------
  const cust = await signUpCustomer('cust', CODE);
  ck('a customer can sign up on a cleaner\'s code', !!cust.userId, cust.body);
  const linked = await query(
    `select r.id, r.credited_at from referrals r
       join client_profiles lp on lp.id = r.referred_client_id
      where lp.user_id = $1 and r.referrer_cleaner_id = $2`,
    [cust.userId, cleaner.cleanerId]);
  ck('  ...and is linked to the cleaner who referred them', linked.rows.length === 1, linked.rows);
  ck('  ...with nothing credited yet - they have not booked', !linked.rows[0]?.credited_at);
  ck('nothing is payable on a signup alone', (await creditFor(cleaner.cleanerId)) === 0);

  // ---- The booking is what pays ------------------------------------------
  const clientId = (await query('select id from client_profiles where user_id = $1', [cust.userId])).rows[0].id;
  const enq = (await query(
    `insert into enquiries (client_id, cleaner_id, status) values ($1,$2,'new') returning id`,
    [clientId, cleaner.cleanerId])).rows[0].id;

  let r = await get(`/api/referrals?userId=${cleaner.userId}`);
  ck('an enquiry with no date still pays nothing', r.body.creditDollars === 0, r.body);

  // Book it, the way confirm-date does.
  await query(`update enquiries set status='accepted', scheduled_on = current_date + 3 where id = $1`, [enq]);
  // The sweep is the backstop both booking paths also call directly.
  const sweep = await fetch(`${BASE}/api/tasks/referral-credits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
  });
  ck('the credit sweep is reachable', sweep.status === 200, sweep.status);

  ck('a booked clean earns the $10', (await creditFor(cleaner.cleanerId)) === 1000, await creditFor(cleaner.cleanerId));

  // Running it again must not pay twice.
  await fetch(`${BASE}/api/tasks/referral-credits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
  });
  ck('  ...exactly once, however often the sweep runs', (await creditFor(cleaner.cleanerId)) === 1000);

  r = await get(`/api/referrals?userId=${cleaner.userId}`);
  ck('the card shows the credit', r.body.creditDollars === 10, r.body);
  ck('  ...names the customer by first name only', r.body.referrals?.[0]?.name === 'Refx', r.body.referrals);
  ck('  ...and labels which scheme it was', r.body.referrals?.[0]?.kind === 'customer', r.body.referrals);
  ck('  ...and counts them toward the ranking boost', r.body.customersBooked === 1, r.body);

  // ---- The cheat this is most open to ------------------------------------
  // A cleaner signing up as their own customer. Same email, other role - which
  // the accounts model allows, so the guard has to be on the person.
  const self = await fetch(BASE + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'customer',
      fullName: 'Refx Cleaner',
      email: `${tag}-cleaner@example.invalid`,
      password: 'test-password-123',
      country: 'NZ',
      referralCode: CODE,
    }),
  });
  const selfBody = await self.json().catch(() => ({}));
  const selfId = selfBody.user?.id || selfBody.userId;
  if (selfId) {
    made.users.push(selfId);
    const lp = await query('select id from client_profiles where user_id = $1', [selfId]);
    if (lp.rows[0]) made.clients.push(lp.rows[0].id);
  }
  const selfRef = await query(
    `select 1 from referrals r join client_profiles lp on lp.id = r.referred_client_id
      where lp.user_id = $1`, [selfId]);
  ck('a cleaner cannot refer their own customer account', selfRef.rows.length === 0, selfRef.rows);

  // ---- An unknown code must never cost someone their signup --------------
  const bad = await signUpCustomer('bad', 'NOSUCHCODE');
  ck('a typo in the code still creates the account', !!bad.userId, bad.body);
  const badRef = await query(
    `select 1 from referrals r join client_profiles lp on lp.id = r.referred_client_id
      where lp.user_id = $1`, [bad.userId]);
  ck('  ...and simply earns nobody', badRef.rows.length === 0);
} catch (err) {
  fails++;
  console.log('FAIL  threw:', err.message);
} finally {
  await query('delete from referrals where referrer_cleaner_id = any($1::uuid[])', [made.cleaners]).catch(() => {});
  await query('delete from referrals where referred_client_id = any($1::uuid[])', [made.clients]).catch(() => {});
  await query('delete from enquiries where cleaner_id = any($1::uuid[])', [made.cleaners]).catch(() => {});
  await query('delete from cleaner_profiles where id = any($1::uuid[])', [made.cleaners]).catch(() => {});
  await query('delete from client_profiles where id = any($1::uuid[])', [made.clients]).catch(() => {});
  await query('delete from users where email like $1', [`${tag}-%`]).catch(() => {});
  await pool.end();
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
