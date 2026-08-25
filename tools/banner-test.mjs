// Banner mode: nothing is hidden from anyone, and every URL stays reachable
// and shareable from any country.
import http from 'node:http';
const BASE = process.argv[2] || 'http://127.0.0.1:3003';
const PORT = Number(new URL(BASE).port);
const NZ = 'matchmaid.co.nz', AU = 'matchmaid.com.au';
let fails = 0;
const ck = (l, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${!ok && d !== undefined ? '  -> ' + String(d).slice(0, 170) : ''}`); };
const get = (path, host, cc, extra = {}) => new Promise((res, rej) => {
  const headers = { Host: host, ...extra };
  if (cc) headers['cf-ipcountry'] = cc;
  const r = http.request({ host: '127.0.0.1', port: PORT, path, method: 'GET', headers }, (rs) => {
    let d = ''; rs.on('data', (c) => (d += c));
    rs.on('end', () => { let b = d; try { b = JSON.parse(d); } catch {} res({ status: rs.statusCode, location: rs.headers.location || null, body: b }); });
  });
  r.on('error', rej); r.end();
});

// ---- nothing is redirected any more ---------------------------------------
for (const [p, h, cc, what] of [
  ['/', AU, 'NZ', 'a New Zealander on the AU domain'],
  ['/', NZ, 'AU', 'an Australian on the NZ site'],
  ['/browse', AU, 'NZ', 'a NZ visitor on AU /browse'],
  ['/cleaners/sydney', AU, 'NZ', 'a NZ visitor on an AU city page'],
  ['/browse', NZ, 'AU', 'an AU visitor on NZ /browse'],
  ['/', NZ, 'US', 'a crawler on the NZ site'],
  ['/', AU, 'US', 'a crawler on the AU site'],
]) {
  const r = await get(p, h, cc);
  ck(`${what} is SERVED, not redirected`, r.status === 200, `${r.status} ${r.location}`);
}
ck('a NZ visitor on the AU domain gets the AUSTRALIAN page (shareable link works)',
  /lang="en-AU"/.test((await get('/', AU, 'NZ')).body));
ck('an AU visitor on the NZ site gets the NEW ZEALAND page',
  /lang="en-NZ"/.test((await get('/', NZ, 'AU')).body));

// ---- but /au is still a permanent move -------------------------------------
let r = await get('/au', NZ, 'NZ');
ck('/au still 301s to the AU domain (a move is not steering)',
  r.status === 301 && r.location === 'https://matchmaid.com.au/', `${r.status} ${r.location}`);
r = await get('/au/cleaners/perth', NZ, null);
ck('  ...with the path', r.location === 'https://matchmaid.com.au/cleaners/perth', r.location);

// ---- /api/geo tells the page what to offer ---------------------------------
r = await get('/api/geo?path=%2F', AU, 'NZ');
ck('/api/geo reports the visitor country', r.body.country === 'NZ', r.body);
ck('  ...and which site they are on', r.body.site === 'AU', r.body);
ck('  ...and offers the NZ page', r.body.other?.url === 'https://matchmaid.co.nz/', r.body.other);
r = await get('/api/geo?path=%2Fbrowse', NZ, 'AU');
ck('an Australian on NZ /browse is offered AU /browse',
  r.body.other?.url === 'https://matchmaid.com.au/browse', r.body.other);
ck('  ...named for humans', r.body.other?.name === 'Australia', r.body.other);

r = await get('/api/geo?path=%2F', NZ, 'NZ');
ck('someone already in the right country is offered nothing', r.body.other === null, r.body);
r = await get('/api/geo?path=%2F', NZ, 'US');
ck('a visitor from neither country is offered nothing', r.body.other === null, r.body);
r = await get('/api/geo?path=%2F', NZ, null);
ck('an unknown location is offered nothing', r.body.other === null && r.body.country === null, r.body);

// Pages with no twin must never offer a switch - that would be offering a 404.
for (const p of ['/terms', '/privacy', '/login', '/maid', '/customer', '/cleaners/ponsonby']) {
  r = await get('/api/geo?path=' + encodeURIComponent(p), NZ, 'AU');
  ck(`${p} has no twin, so no switch is offered`, r.body.other === null, r.body.other);
}
// ...but the paired ones do.
for (const p of ['/', '/browse', '/for-customers', '/for-maids', '/cleaners']) {
  r = await get('/api/geo?path=' + encodeURIComponent(p), NZ, 'AU');
  ck(`${p} does offer the Australian version`, !!r.body.other, r.body);
}

r = await get('/api/geo?path=%2F', NZ, 'AU');
ck('the geo answer is never cached', true);
const raw = await new Promise((res) => {
  const rq = http.request({ host: '127.0.0.1', port: PORT, path: '/api/geo?path=%2F', headers: { Host: NZ, 'cf-ipcountry': 'AU' } },
    (rs) => { rs.resume(); res(rs.headers); });
  rq.end();
});
ck('  ...Cache-Control: no-store', /no-store/.test(String(raw['cache-control'])), raw['cache-control']);

// ---- the banner script is on the paired pages ------------------------------
for (const [p, h] of [['/', NZ], ['/browse', NZ], ['/', AU], ['/cleaners/sydney', AU]]) {
  const page = await get(p, h, 'US');
  ck(`${h}${p} loads the banner script`, String(page.body).includes('geo-banner.js'), p);
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
