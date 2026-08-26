// The perfect-review celebration, end to end.
//
// The thing that matters most: once per review, never twice, and never
// somebody else's.
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
const post = async (p, b) => {
  const r = await fetch(BASE + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const tag = 'celeb-' + process.pid;
const ids = {};

const mkReview = async (scores, status = 'published') => {
  const overall = Object.values(scores).reduce((a, b) => a + b, 0) / 5;
  // conversations.enquiry_id is unique, so each review needs its own enquiry.
  const enq = (await query(
    "insert into enquiries (client_id, cleaner_id, message, status) values ($1,$2,'x','completed') returning id",
    [ids.client, ids.cleaner])).rows[0].id;
  const conv = (await query(
    'insert into conversations (enquiry_id, client_id, cleaner_id) values ($1,$2,$3) returning id',
    [enq, ids.client, ids.cleaner])).rows[0].id;
  const r = await query(
    `insert into reviews (conversation_id, cleaner_id, client_id, rating, overall,
                          quality, value_for_money, timeliness, punctuality, communication,
                          would_use_again, comment, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12) returning id`,
    [conv, ids.cleaner, ids.client, Math.round(overall), overall.toFixed(2),
     scores.quality, scores.value, scores.timeliness, scores.punctuality, scores.communication,
     'Faultless, thank you.', status]);
  ids.convos = (ids.convos || []).concat(conv);
  return r.rows[0].id;
};

try {
  // ---- fixtures --------------------------------------------------------------
  const mk = async (slug, role, name) =>
    (await query('insert into users (email, role, full_name, email_verified) values ($1,$2,$3,true) returning id',
      [`${tag}-${slug}@example.invalid`, role, name])).rows[0].id;
  ids.cleanerUser = await mk('cleaner', 'cleaner', 'Celebrate Cleaner');
  ids.otherUser = await mk('other', 'cleaner', 'Other Cleaner');
  ids.clientUser = await mk('customer', 'client', 'Happy Customer');
  ids.cleaner = (await query("insert into cleaner_profiles (user_id, business_name) values ($1,'Celebrate Co') returning id", [ids.cleanerUser])).rows[0].id;
  ids.other = (await query("insert into cleaner_profiles (user_id, business_name) values ($1,'Other Co') returning id", [ids.otherUser])).rows[0].id;
  ids.client = (await query('insert into client_profiles (user_id) values ($1) returning id', [ids.clientUser])).rows[0].id;
  ids.enquiry = (await query(
    "insert into enquiries (client_id, cleaner_id, message, status) values ($1,$2,'x','completed') returning id",
    [ids.client, ids.cleaner])).rows[0].id;

  // ---- nothing to celebrate yet ----------------------------------------------
  let r = await get(`/api/celebrations?userId=${ids.cleanerUser}`);
  ck('a cleaner with no reviews gets nothing', r.status === 200 && r.body.reviews.length === 0, r.body);

  // ---- a NEAR-perfect review does not celebrate --------------------------------
  const near = await mkReview({ quality: 5, value: 5, timeliness: 4, punctuality: 5, communication: 5 });
  r = await get(`/api/celebrations?userId=${ids.cleanerUser}`);
  ck('4.8 is not a five-star review', r.body.reviews.length === 0, r.body.reviews);

  // ---- a perfect one does -------------------------------------------------------
  const perfect = await mkReview({ quality: 5, value: 5, timeliness: 5, punctuality: 5, communication: 5 });
  r = await get(`/api/celebrations?userId=${ids.cleanerUser}`);
  ck('a perfect review is offered for celebration', r.body.reviews.length === 1, r.body.reviews);
  ck('  ...with the score', r.body.reviews[0]?.overall === 5, r.body.reviews[0]);
  ck('  ...the comment', /Faultless/.test(r.body.reviews[0]?.comment || ''), r.body.reviews[0]);
  ck('  ...and the customer first name only',
    r.body.reviews[0]?.from === 'Happy', r.body.reviews[0]?.from);

  // ---- fetching does NOT mark it seen ------------------------------------------
  r = await get(`/api/celebrations?userId=${ids.cleanerUser}`);
  ck('fetching twice still offers it (a fetch is not a viewing)', r.body.reviews.length === 1);

  // ---- another cleaner cannot see or claim it -----------------------------------
  r = await get(`/api/celebrations?userId=${ids.otherUser}`);
  ck('another cleaner sees nothing', r.body.reviews.length === 0, r.body.reviews);
  let m = await post('/api/celebrations/seen', { userId: ids.otherUser, reviewIds: [perfect] });
  ck('another cleaner cannot mark it seen', m.body.marked === 0, m.body);
  r = await get(`/api/celebrations?userId=${ids.cleanerUser}`);
  ck('  ...and it is still waiting for the right cleaner', r.body.reviews.length === 1);

  // ---- marking it seen retires it, once and for all ------------------------------
  m = await post('/api/celebrations/seen', { userId: ids.cleanerUser, reviewIds: [perfect] });
  ck('the owner can mark it seen', m.status === 200 && m.body.marked === 1, m.body);
  r = await get(`/api/celebrations?userId=${ids.cleanerUser}`);
  ck('ONCE PER REVIEW: it never celebrates again', r.body.reviews.length === 0, r.body.reviews);
  m = await post('/api/celebrations/seen', { userId: ids.cleanerUser, reviewIds: [perfect] });
  ck('  ...and marking it twice is a no-op', m.body.marked === 0, m.body);

  // ---- a second perfect review is its own moment ---------------------------------
  const second = await mkReview({ quality: 5, value: 5, timeliness: 5, punctuality: 5, communication: 5 });
  r = await get(`/api/celebrations?userId=${ids.cleanerUser}`);
  ck('a NEW perfect review celebrates on its own', r.body.reviews.length === 1, r.body.reviews);
  ck('  ...and it is the new one, not the retired one', r.body.reviews[0].id === second, r.body.reviews[0].id);

  // ---- several at once come back together ----------------------------------------
  const third = await mkReview({ quality: 5, value: 5, timeliness: 5, punctuality: 5, communication: 5 });
  r = await get(`/api/celebrations?userId=${ids.cleanerUser}`);
  ck('two unseen perfect reviews both come back', r.body.reviews.length === 2, r.body.reviews.length);
  m = await post('/api/celebrations/seen', { userId: ids.cleanerUser, reviewIds: [second, third] });
  ck('  ...and both retire together', m.body.marked === 2, m.body);
  r = await get(`/api/celebrations?userId=${ids.cleanerUser}`);
  ck('  ...leaving nothing', r.body.reviews.length === 0);

  // ---- a hidden review never celebrates --------------------------------------------
  const hidden = await mkReview({ quality: 5, value: 5, timeliness: 5, punctuality: 5, communication: 5 }, 'removed');
  r = await get(`/api/celebrations?userId=${ids.cleanerUser}`);
  ck('a moderated-away perfect review does not celebrate', r.body.reviews.length === 0, r.body.reviews);

  // ---- input handling ----------------------------------------------------------------
  ck('no userId is refused', (await get('/api/celebrations')).status === 400);
  ck('an empty id list is refused', (await post('/api/celebrations/seen', { userId: ids.cleanerUser, reviewIds: [] })).status === 400);
  ck('a non-uuid id is refused, not thrown on',
    (await post('/api/celebrations/seen', { userId: ids.cleanerUser, reviewIds: ['not-a-uuid'] })).status === 400);
} catch (err) {
  fails++;
  console.log('FAIL  threw:', err.message);
} finally {
  await query('delete from reviews where cleaner_id = any($1::uuid[])', [[ids.cleaner, ids.other].filter(Boolean)]).catch(() => {});
  await query('delete from conversations where cleaner_id = any($1::uuid[])', [[ids.cleaner, ids.other].filter(Boolean)]).catch(() => {});
  await query('delete from enquiries where cleaner_id = any($1::uuid[])', [[ids.cleaner, ids.other].filter(Boolean)]).catch(() => {});
  await query('delete from cleaner_profiles where id = any($1::uuid[])', [[ids.cleaner, ids.other].filter(Boolean)]).catch(() => {});
  await query('delete from client_profiles where id = $1', [ids.client || null]).catch(() => {});
  await query('delete from users where email like $1', [`${tag}-%`]);
  await pool.end();
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
