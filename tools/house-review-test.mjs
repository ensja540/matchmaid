// The cleaner's review of the household, plus the Google ask.
import { query, pool } from 'file:///C:/Matchmaid/server/db.js';

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
let fails = 0;
const ck = (l, ok, d) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 200) : ''}`);
};
const get = async (p) => { const r = await fetch(BASE + p); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const post = async (p, b) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const tag = 'houserev-' + process.pid;
const ids = {};

try {
  const mk = async (slug, role, name) =>
    (await query('insert into users (email, role, full_name, email_verified) values ($1,$2,$3,true) returning id',
      [`${tag}-${slug}@example.invalid`, role, name])).rows[0].id;
  ids.cleanerUser = await mk('cleaner', 'cleaner', 'House Test Cleaner');
  ids.otherUser  = await mk('other', 'cleaner', 'Other Cleaner');
  ids.clientUser = await mk('customer', 'client', 'Dana Whitfield');
  ids.cleaner = (await query("insert into cleaner_profiles (user_id, business_name) values ($1,'House Co') returning id", [ids.cleanerUser])).rows[0].id;
  ids.other   = (await query("insert into cleaner_profiles (user_id, business_name) values ($1,'Other Co') returning id", [ids.otherUser])).rows[0].id;
  ids.client  = (await query('insert into client_profiles (user_id) values ($1) returning id', [ids.clientUser])).rows[0].id;
  ids.enquiry = (await query("insert into enquiries (client_id, cleaner_id, message, status) values ($1,$2,'x','completed') returning id", [ids.client, ids.cleaner])).rows[0].id;
  ids.convo   = (await query('insert into conversations (enquiry_id, client_id, cleaner_id) values ($1,$2,$3) returning id', [ids.enquiry, ids.client, ids.cleaner])).rows[0].id;

  // ---- nothing to review until the clean is marked done --------------------
  let r = await get(`/api/pending-client-reviews?userId=${ids.cleanerUser}`);
  ck('no prompt before the clean is complete', r.body.length === 0, r.body);

  await query("insert into messages (conversation_id, sender_user_id, body, kind) values ($1,$2,'done','review_request')",
    [ids.convo, ids.cleanerUser]);
  r = await get(`/api/pending-client-reviews?userId=${ids.cleanerUser}`);
  ck('once complete, the cleaner is prompted', r.body.length === 1, r.body);
  ck('  ...first name only', r.body[0]?.client === 'Dana', r.body[0]);
  ck('another cleaner is not prompted', (await get(`/api/pending-client-reviews?userId=${ids.otherUser}`)).body.length === 0);

  // ---- only the cleaner on the thread may review ---------------------------
  r = await post('/api/client-review', { conversationId: ids.convo, userId: ids.otherUser, rating: 5, wouldCleanAgain: true });
  ck('another cleaner cannot review this house', r.status === 403, r);
  r = await post('/api/client-review', { conversationId: ids.convo, userId: ids.clientUser, rating: 5, wouldCleanAgain: true });
  ck('the household cannot review itself', r.status === 403, r);

  // ---- validation -----------------------------------------------------------
  for (const [body, why] of [
    [{ rating: 0, wouldCleanAgain: true }, 'zero'],
    [{ rating: 6, wouldCleanAgain: true }, 'above 5'],
    [{ wouldCleanAgain: true }, 'missing rating'],
    [{ rating: 4 }, 'missing would-clean-again'],
    [{ rating: 4, wouldCleanAgain: 'yes' }, 'non-boolean'],
  ]) {
    const res = await post('/api/client-review', { conversationId: ids.convo, userId: ids.cleanerUser, ...body });
    ck(`refuses ${why}`, res.status === 400, res.body);
  }

  // ---- the happy path -------------------------------------------------------
  r = await post('/api/client-review', {
    conversationId: ids.convo, userId: ids.cleanerUser,
    rating: 4.5, wouldCleanAgain: true, comment: 'Easy access, friendly dog.',
  });
  ck('the cleaner can review the house', r.status === 200, r);
  const saved = (await query('select rating, would_clean_again, comment from client_reviews where conversation_id = $1', [ids.convo])).rows[0];
  ck('  ...rating stored', Number(saved.rating) === 4.5, saved);
  ck('  ...would-clean-again stored', saved.would_clean_again === true, saved);
  ck('  ...note stored', /friendly dog/.test(saved.comment), saved.comment);
  ck('the prompt clears', (await get(`/api/pending-client-reviews?userId=${ids.cleanerUser}`)).body.length === 0);

  // ---- the household's standing ---------------------------------------------
  const prof = (await query('select avg_rating, review_count from client_profiles where id = $1', [ids.client])).rows[0];
  ck('the household average is cached', Number(prof.avg_rating) === 4.5 && prof.review_count === 1, prof);
  r = await get(`/api/client-profile?userId=${ids.clientUser}`);
  ck('the house profile carries the reputation', r.body.reputation?.count === 1, r.body.reputation);
  ck('  ...with the rating', r.body.reputation?.rating === 4.5, r.body.reputation);
  ck('  ...and the would-clean-again share', r.body.reputation?.wouldCleanAgainPct === 100, r.body.reputation);
  ck('  ...and NOT the comment (a house is not quotable to the next cleaner)',
    !JSON.stringify(r.body.reputation).includes('friendly dog'), r.body.reputation);

  // ---- editing, not duplicating ---------------------------------------------
  r = await post('/api/client-review', { conversationId: ids.convo, userId: ids.cleanerUser, rating: 3, wouldCleanAgain: false });
  ck('reviewing again updates rather than duplicating', r.status === 200);
  const n = (await query('select count(*)::int n from client_reviews where conversation_id = $1', [ids.convo])).rows[0].n;
  ck('  ...still one row', n === 1, n);
  const prof2 = (await query('select avg_rating from client_profiles where id = $1', [ids.client])).rows[0];
  ck('  ...and the average follows', Number(prof2.avg_rating) === 3, prof2);
  r = await get(`/api/client-review?conversationId=${ids.convo}&userId=${ids.cleanerUser}`);
  ck('the cleaner can read back what they wrote', r.body.review?.rating === 3 && r.body.review?.wouldCleanAgain === false, r.body);

  // ---- the two review directions are independent -----------------------------
  const custReviews = (await query('select count(*)::int n from reviews where conversation_id = $1', [ids.convo])).rows[0].n;
  ck('reviewing the house did not create a cleaner review', custReviews === 0, custReviews);

  // ---- the Google ask --------------------------------------------------------
  r = await get('/api/google-review-url');
  ck('the Google URL endpoint answers', r.status === 200 && 'url' in r.body, r.body);
  ck('  ...and is empty until a Business Profile is set', r.body.url === '', r.body);
} catch (err) {
  fails++;
  console.log('FAIL  threw:', err.message);
} finally {
  await query('delete from client_reviews where cleaner_id = any($1::uuid[])', [[ids.cleaner, ids.other].filter(Boolean)]).catch(() => {});
  await query('delete from messages where conversation_id = $1', [ids.convo || null]).catch(() => {});
  await query('delete from conversations where id = $1', [ids.convo || null]).catch(() => {});
  await query('delete from enquiries where id = $1', [ids.enquiry || null]).catch(() => {});
  await query('delete from cleaner_profiles where id = any($1::uuid[])', [[ids.cleaner, ids.other].filter(Boolean)]).catch(() => {});
  await query('delete from client_profiles where id = $1', [ids.client || null]).catch(() => {});
  await query('delete from users where email like $1', [`${tag}-%`]);
  await pool.end();
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
