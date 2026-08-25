// The full steering matrix once Australia has its own domain.
//
// Run against a server started with AU_DOMAIN=matchmaid.com.au. Host has to be
// set with node:http - fetch treats Host as a forbidden header and silently
// sends the real one, which is the entire variable under test.
import http from 'node:http';

const BASE = process.argv[2] || 'http://127.0.0.1:3002';
const PORT = Number(new URL(BASE).port);
const NZ = 'matchmaid.co.nz';
const AU = 'matchmaid.com.au';

let fails = 0;
const ck = (l, ok, d) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${!ok && d !== undefined ? '  -> ' + String(d).slice(0, 160) : ''}`);
};
const get = (path, host, cc, extra = {}) =>
  new Promise((resolve, reject) => {
    const headers = { Host: host, ...extra };
    if (cc) headers['cf-ipcountry'] = cc;
    const r = http.request({ host: '127.0.0.1', port: PORT, path, method: 'GET', headers }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({
        status: res.statusCode, location: res.headers.location || null,
        cookie: String(res.headers['set-cookie'] || ''), body: d,
      }));
    });
    r.on('error', reject);
    r.end();
  });

const where = async (p, h, cc) => {
  const r = await get(p, h, cc);
  return r.status === 200 ? '200' : `${r.status} ${r.location}`;
};

try {
  // ---- a New Zealander --------------------------------------------------------
  ck('NZ visitor, NZ site: served', (await where('/', NZ, 'NZ')) === '200');
  ck('NZ visitor, NZ /browse: served', (await where('/browse', NZ, 'NZ')) === '200');
  ck('NZ visitor on the AU DOMAIN is sent to the NZ site (not served NZ pages there)',
    (await where('/', AU, 'NZ')) === '302 https://matchmaid.co.nz/', await where('/', AU, 'NZ'));
  ck('  ...keeping the page they asked for',
    (await where('/browse', AU, 'NZ')) === '302 https://matchmaid.co.nz/browse', await where('/browse', AU, 'NZ'));

  // ---- an Australian ----------------------------------------------------------
  ck('AU visitor on the NZ site goes to the AU DOMAIN, not /au',
    (await where('/', NZ, 'AU')) === '302 https://matchmaid.com.au/', await where('/', NZ, 'AU'));
  ck('  ...keeping the page',
    (await where('/browse', NZ, 'AU')) === '302 https://matchmaid.com.au/browse', await where('/browse', NZ, 'AU'));
  ck('AU visitor on the AU domain is served', (await where('/', AU, 'AU')) === '200');
  ck('  ...and gets the Australian page', /lang="en-AU"/.test((await get('/', AU, 'AU')).body));
  ck('  ...on a city page too', (await where('/cleaners/sydney', AU, 'AU')) === '200');

  // ---- /au is now the OLD address, on both hosts ------------------------------
  ck('/au on the NZ domain 301s to the AU domain',
    (await where('/au', NZ, null)) === '301 https://matchmaid.com.au/', await where('/au', NZ, null));
  ck('  ...with the path', (await where('/au/browse', NZ, null)) === '301 https://matchmaid.com.au/browse');
  ck('  ...and the city pages',
    (await where('/au/cleaners/perth', NZ, null)) === '301 https://matchmaid.com.au/cleaners/perth');
  ck('/au on the AU domain 301s to the bare path', (await where('/au', AU, null)) === '301 /');
  ck('  ...one URL per page', (await where('/au/cleaners/perth', AU, null)) === '301 /cleaners/perth');
  ck('the /au 301 fires for a NZ visitor too (a move is a move)',
    (await where('/au/browse', NZ, 'NZ')).startsWith('301'), await where('/au/browse', NZ, 'NZ'));

  // ---- crawlers and unknown locations see everything --------------------------
  ck('a US visitor is served the NZ site', (await where('/', NZ, 'US')) === '200');
  ck('a US visitor is served the AU site', (await where('/', AU, 'US')) === '200');
  ck('  ...and every AU city page', (await where('/cleaners/darwin', AU, 'US')) === '200');
  ck('no cf-ipcountry at all: served, never redirected', (await where('/', AU, null)) === '200');

  // ---- the escape hatch --------------------------------------------------------
  const stay = await get('/?stay=1', AU, 'NZ');
  ck('?stay=1 lets a New Zealander onto the AU domain', stay.status === 200, stay.status);
  ck('  ...and sets the cookie that remembers it', /mm_stay=1/.test(stay.cookie), stay.cookie);
  ck('  ...the cookie alone keeps them there',
    (await get('/', AU, 'NZ', { Cookie: 'mm_stay=1' })).status === 200);

  // ---- nothing that is not a page is ever steered ------------------------------
  for (const p of ['/api/suburbs', '/styles.css?v=117', '/assets/logo-mark.svg', '/login', '/terms', '/privacy', '/maid', '/customer']) {
    const r = await get(p, AU, 'NZ');
    ck(`${p} is not redirected off the AU domain`, r.status !== 302 && r.status !== 301, `${r.status} ${r.location}`);
  }

  // ---- query strings survive ----------------------------------------------------
  ck('a query string survives the cross-domain redirect',
    (await where('/browse?suburb=Bondi', NZ, 'AU')) === '302 https://matchmaid.com.au/browse?suburb=Bondi',
    await where('/browse?suburb=Bondi', NZ, 'AU'));
  ck('  ...and the /au 301',
    (await where('/au/browse?x=1', NZ, null)) === '301 https://matchmaid.com.au/browse?x=1',
    await where('/au/browse?x=1', NZ, null));

  // ---- no redirect loops ---------------------------------------------------------
  for (const [start, host, cc] of [['/', AU, 'NZ'], ['/', NZ, 'AU'], ['/au', NZ, 'AU'], ['/au', AU, 'NZ'], ['/browse', AU, 'NZ']]) {
    let p = start, h = host, hops = 0;
    const seen = new Set();
    while (hops < 6) {
      const r = await get(p, h, cc);
      if (r.status === 200) break;
      const key = h + p;
      if (seen.has(key)) { hops = 99; break; }
      seen.add(key);
      const loc = r.location || '';
      if (loc.startsWith('http')) { const u = new URL(loc); h = u.host; p = u.pathname + u.search; }
      else p = loc;
      hops++;
    }
    ck(`${host}${start} (${cc || 'unknown'}) settles without looping`, hops < 6, `${hops} hops`);
  }

  // ---- the API on the AU host still defaults to Australia -------------------------
  const subs = await get('/api/suburbs', AU, 'AU');
  const list = JSON.parse(subs.body);
  ck('/api/suburbs on the AU host returns Australian suburbs', list.length > 2000, list.length);
  ck('  ...only the six cities', new Set(list.map((s) => s.territorial_authority)).size === 6);
} catch (err) {
  fails++;
  console.log('FAIL  threw:', err.message);
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
