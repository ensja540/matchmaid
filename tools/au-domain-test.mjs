// The Australian domain, before it exists.
//
// Run against a server started with AU_DOMAIN=matchmaid.com.au, and hit it with
// a Host header for that domain. This proves the switch works BEFORE the domain
// is bought, so buying it is a DNS change and an env var rather than a debugging
// session on a live site.
const BASE = process.argv[2] || 'http://127.0.0.1:3001';
const AU_HOST = 'matchmaid.com.au';

let fails = 0;
const ck = (l, ok, d) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${!ok && d !== undefined ? `  -> ${JSON.stringify(d).slice(0, 180)}` : ''}`);
};
// node:http, not fetch. `Host` is a forbidden header for fetch - it silently
// drops it and sends the real one - and Host is the entire point of this test.
import http from 'node:http';
const PORT = Number(new URL(BASE).port);
const get = (p, host, extra = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: p, method: 'GET',
        headers: { Host: host, 'cf-ipcountry': 'AU', ...extra } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const ct = res.headers['content-type'] || '';
          let body = data;
          if (ct.includes('json')) { try { body = JSON.parse(data); } catch {} }
          resolve({ status: res.statusCode, location: res.headers.location || null, body });
        });
      });
    req.on('error', reject);
    req.end();
  });

try {
  // ---- the Australian pages are served at the ROOT of the AU host ----------
  for (const [p, needle] of [
    ['/', 'Australia'],
    ['/for-customers', 'Australia'],
    ['/for-maids', 'Australia'],
    ['/browse', 'Australia'],
    ['/cleaners', 'city by city'],
    ['/cleaners/sydney', 'Sydney'],
    ['/cleaners/darwin', 'Darwin'],
  ]) {
    const r = await get(p, AU_HOST);
    ck(`${AU_HOST}${p} serves`, r.status === 200, r.status);
    ck(`  ...the Australian page`, String(r.body).includes(needle) &&
      String(r.body).includes('lang="en-AU"'), p);
  }

  // ---- and NOT the New Zealand ones ----------------------------------------
  const home = await get('/', AU_HOST);
  ck('the AU host root is NOT the New Zealand splash',
    !String(home.body).includes("New Zealand's biggest") &&
    !/Christchurch/.test(String(home.body)), 'NZ copy leaked onto the AU root');

  // ---- /au on the AU host is one redirect to the bare path -----------------
  const dup = await get('/au', AU_HOST);
  ck('/au on the AU host 301s to /', dup.status === 301 && dup.location === '/', dup);
  const dup2 = await get('/au/cleaners/perth', AU_HOST);
  ck('/au/cleaners/perth 301s to /cleaners/perth',
    dup2.status === 301 && dup2.location === '/cleaners/perth', dup2);

  // ---- shared things are still shared --------------------------------------
  for (const p of ['/styles.css?v=115', '/demo.js?v=71', '/assets/logo-mark.svg']) {
    const r = await get(p, AU_HOST);
    ck(`${p} still served from the root on the AU host`, r.status === 200, r.status);
  }
  const login = await get('/login', AU_HOST);
  ck('/login is the shared page, not looked for under au/', login.status === 200, login.status);
  const terms = await get('/terms', AU_HOST);
  ck('/terms is shared too', terms.status === 200, terms.status);

  // ---- the API defaults to Australia on the Australian host -----------------
  const subs = await get('/api/suburbs', AU_HOST);
  ck('/api/suburbs on the AU host returns Australian suburbs',
    Array.isArray(subs.body) && subs.body.length > 2000, subs.body?.length);
  const tas = new Set((subs.body || []).map((s) => s.territorial_authority));
  ck('  ...only the six open cities', [...tas].every((t) =>
    ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Hobart', 'Darwin'].includes(t)), [...tas]);
  ck('  ...even with no country parameter (the host implies it)', tas.size === 6, [...tas]);
  const nzSubs = await get('/api/suburbs?country=NZ', AU_HOST);
  ck('an explicit country=NZ still wins over the host',
    (nzSubs.body || []).some((s) => s.territorial_authority === 'Auckland'), nzSubs.body?.length);

  // ---- the New Zealand host is completely unaffected ------------------------
  const nzHome = await get('/', 'matchmaid.co.nz', { 'cf-ipcountry': 'NZ' });
  ck('the NZ host still serves the NZ splash',
    nzHome.status === 200 && String(nzHome.body).includes('New Zealand'), nzHome.status);
  const nzAu = await get('/au', 'matchmaid.co.nz', { 'cf-ipcountry': 'US' });
  ck('/au still works on the NZ host (nothing removed yet)', nzAu.status === 200, nzAu.status);
  const nzBrowse = await get('/browse', 'matchmaid.co.nz', { 'cf-ipcountry': 'NZ' });
  // Careful: hreflang="en-AU" contains lang="en-AU". Match the html tag itself.
  ck('the NZ browse page is unchanged', nzBrowse.status === 200 &&
    /<html lang="en-NZ">/.test(String(nzBrowse.body)), nzBrowse.status);

  // ---- an unrelated host behaves like the NZ one ----------------------------
  const other = await get('/', 'localhost', { 'cf-ipcountry': 'NZ' });
  ck('an unknown host is treated as New Zealand', other.status === 200 &&
    String(other.body).includes('New Zealand'), other.status);
} catch (err) {
  fails++;
  console.log('FAIL  threw:', err.message);
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
