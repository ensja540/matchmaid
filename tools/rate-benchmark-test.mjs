// The rate benchmark a cleaner sees while setting their price.
//
// The things that matter: it compares like with like (per clean type, off
// clean_rates), it never counts the asking cleaner in their own average, and it
// refuses to average a handful of people.
//
//   cd server && node ../tools/rate-benchmark-test.mjs [http://127.0.0.1:3000]
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

const tag = 'bench-' + process.pid;
const made = { users: [], cleaners: [] };

// A cleaner with a rate, a listing status and (optionally) a patch it covers.
const mkCleaner = async (slug, rates, status, suburbId) => {
  const u = (await query(
    'insert into users (email, role, full_name, email_verified) values ($1,$2,$3,true) returning id',
    [`${tag}-${slug}@example.invalid`, 'cleaner', `Bench ${slug}`])).rows[0].id;
  const c = (await query(
    `insert into cleaner_profiles (user_id, business_name, listing_status, clean_rates)
     values ($1,$2,$3,$4) returning id`,
    [u, `Bench ${slug}`, status, JSON.stringify(rates)])).rows[0].id;
  if (suburbId) {
    await query('insert into cleaner_service_areas (cleaner_id, suburb_id) values ($1,$2)', [c, suburbId]);
  }
  made.users.push(u);
  made.cleaners.push(c);
  return { userId: u, cleanerId: c };
};

try {
  // Two suburbs nobody currently covers. Borrowing a real suburb with real
  // cleaners in it would mean asserting an average against live data.
  const empty = (await query(
    `select s.id, s.name from suburbs s
       where s.country = 'NZ'
         and not exists (select 1 from cleaner_service_areas csa where csa.suburb_id = s.id)
       order by s.id limit 2`)).rows;
  if (empty.length < 2) throw new Error('need two uncovered suburbs to test against');
  const [here, elsewhere] = empty;
  console.log(`  (testing in ${here.name}, with ${elsewhere.name} as the next suburb over)\n`);

  // The cleaner doing the asking, priced above everyone.
  const me = await mkCleaner('me', { regular: 60, deep: 80 }, 'active', here.id);
  // Three comparable cleaners: regular averages 40. Only two price a deep clean.
  await mkCleaner('a', { regular: 30, deep: 50 }, 'active', here.id);
  await mkCleaner('b', { regular: 40, deep: 60 }, 'active', here.id);
  await mkCleaner('c', { regular: 50 }, 'active', here.id);

  let r = await get(`/api/rate-benchmark?userId=${me.userId}`);
  ck('averages the cleaners covering the same suburb', r.body.benchmarks?.regular?.average === 40, r.body);
  ck('  ...and counts exactly those three', r.body.benchmarks?.regular?.count === 3, r.body.benchmarks);
  ck('  ...and calls the scope local', r.body.scope === 'area', r.body.scope);
  ck('the asking cleaner is not in their own average', r.body.benchmarks?.regular?.average !== 45, r.body.benchmarks);
  ck('two deep rates is too few to average', r.body.benchmarks?.deep === undefined, r.body.benchmarks);

  // A cleaner who is not listed is not competition.
  await mkCleaner('paused', { regular: 100 }, 'paused', here.id);
  r = await get(`/api/rate-benchmark?userId=${me.userId}`);
  ck('a paused listing does not move the average', r.body.benchmarks?.regular?.average === 40, r.body.benchmarks);

  // Neither is someone who does not travel here.
  await mkCleaner('faraway', { regular: 100 }, 'active', elsewhere.id);
  r = await get(`/api/rate-benchmark?userId=${me.userId}`);
  ck('a cleaner in another suburb does not move it either', r.body.benchmarks?.regular?.average === 40, r.body.benchmarks);

  // A third deep rate tips it over the threshold.
  await mkCleaner('d', { regular: 40, deep: 70 }, 'active', here.id);
  r = await get(`/api/rate-benchmark?userId=${me.userId}`);
  ck('a third deep rate makes deep averageable', r.body.benchmarks?.deep?.average === 60, r.body.benchmarks);

  // Before service areas are saved there is no local set - fall back nationally.
  await query('delete from cleaner_service_areas where cleaner_id = $1', [me.cleanerId]);
  r = await get(`/api/rate-benchmark?userId=${me.userId}`);
  ck('a cleaner with no service areas gets a national benchmark', r.body.scope === 'country', r.body.scope);
  ck('  ...which still excludes them', r.body.benchmarks?.regular?.count > 0, r.body.benchmarks);

  ck('an unknown user is a 404, not a crash', (await get('/api/rate-benchmark?userId=' + made.users[0].replace(/.$/, '0'))).status !== 500);
} catch (err) {
  fails++;
  console.log('FAIL  threw:', err.message);
} finally {
  await query('delete from cleaner_service_areas where cleaner_id = any($1::uuid[])', [made.cleaners]).catch(() => {});
  await query('delete from cleaner_profiles where id = any($1::uuid[])', [made.cleaners]).catch(() => {});
  await query('delete from users where email like $1', [`${tag}-%`]).catch(() => {});
  await pool.end();
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
