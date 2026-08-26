// Nothing an Australian sees may read as New Zealand.
process.env.RESEND_API_KEY = 'test-key';
const sent = [];
globalThis.fetch = async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: true, status: 200, text: async () => '' }; };
const E = await import('file:///C:/Matchmaid/server/email.js');
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

let fails = 0;
const ck = (l, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${!ok && d ? '  -> ' + String(d).slice(0, 170) : ''}`); };

// ---- emails -----------------------------------------------------------------
const cases = [
  ['new message', () => E.sendNewMessageEmail({ to: 'a@b.c', toName: 'Ana', fromName: 'Ben', body: 'hi', portal: '/maid', country: 'AU' })],
  ['enquiry', () => E.sendEnquiryEmail({ to: 'a@b.c', cleanerName: 'Ana', clientName: 'Ben', service: 'Regular', suburb: 'Bondi', message: 'hi', country: 'AU' })],
  ['review request', () => E.sendReviewRequestEmail({ to: 'a@b.c', name: 'Ben', cleanerName: 'Ana', when: 'Fri', country: 'AU' })],
  ['nudge', () => E.sendNudgeEmail({ to: 'a@b.c', name: 'Ana', kind: 'cleaner_no_rate', unsubUrl: 'https://x/u', country: 'AU' })],
  ['cleaner review', () => E.sendCleanerReviewEmail({ to: 'a@b.c', cleanerName: 'Ana', clientName: 'Ben', overall: 5, dims: [{ label: 'Quality of clean', value: 5 }], wouldUseAgain: true, comment: 'great', referralLink: '', creditDollars: 20, googleUrl: '', country: 'AU' })],
];
for (const [name, fn] of cases) {
  sent.length = 0;
  await fn();
  const m = sent[0];
  ck(`${name}: footer says Australia, not Christchurch`,
    m.html.includes('Match Maid · Australia') && !m.html.includes('Christchurch'), m.html.match(/Match Maid · [^<]*/)?.[0]);
  ck(`  ...and points at matchmaid.com.au`, m.html.includes('matchmaid.com.au'), m.html.match(/used this address on [^.]*/)?.[0]);
}
// The NZ side must be untouched.
sent.length = 0;
await E.sendNewMessageEmail({ to: 'a@b.c', toName: 'Ana', fromName: 'Ben', body: 'hi', portal: '/maid' });
ck('with no country, the footer is still New Zealand',
  sent[0].html.includes('Christchurch, NZ'), sent[0].html.match(/Match Maid · [^<]*/)?.[0]);

// ---- the verification decision names the right document ---------------------
sent.length = 0;
await E.sendVerificationDecisionEmail({ to: 'a@b.c', name: 'Ana', type: 'police', approved: true, country: 'AU' });
ck('an Australian is told their POLICE check was approved',
  /police check/i.test(sent[0].html) && !/criminal/i.test(sent[0].html), sent[0].html.match(/.{0,40}check.{0,20}/)?.[0]);
ck('  ...and gets the Police checked badge', /Police checked/.test(sent[0].html));
sent.length = 0;
await E.sendVerificationDecisionEmail({ to: 'a@b.c', name: 'Ana', type: 'police', approved: true });
ck('a New Zealander still gets "criminal check"', /criminal check/i.test(sent[0].html));

// ---- the pages ---------------------------------------------------------------
const read = (f) => readFileSync('C:/Matchmaid/' + f, 'utf8');
const AU_PAGES = ['au/index.html', 'au/for-customers.html', 'au/for-maids.html', 'au/browse.html',
  'au/cleaners/index.html', 'au/cleaners/sydney.html', 'au/cleaners/melbourne.html',
  'au/cleaners/brisbane.html', 'au/cleaners/perth.html', 'au/cleaners/hobart.html', 'au/cleaners/darwin.html'];
for (const f of AU_PAGES) {
  const h = read(f);
  // hreflang="en-NZ" and matchmaid.co.nz canonicals are CORRECT - they point at
  // the New Zealand alternate. Everything else must be Australian.
  const stripped = h.replace(/hreflang="en-NZ"/g, '').replace(/matchmaid\.co\.nz/g, '');
  ck(`${f}: no "New Zealand"`, !/New Zealand/.test(stripped), stripped.match(/.{0,40}New Zealand.{0,30}/)?.[0]);
  ck(`  no NZ city`, !/Christchurch|Auckland|Wellington|Dunedin/.test(stripped), stripped.match(/.{0,30}(Christchurch|Auckland|Wellington|Dunedin).{0,20}/)?.[0]);
  ck(`  no "criminal check"`, !/criminal/i.test(stripped), stripped.match(/.{0,40}criminal.{0,25}/i)?.[0]);
  ck(`  no bare "NZ"`, !/\bNZ\b/.test(stripped), stripped.match(/.{0,35}\bNZ\b.{0,25}/)?.[0]);
  ck(`  lang and inLanguage are en-AU`, /<html lang="en-AU">/.test(h) && !/"inLanguage":\s*"en-NZ"/.test(h));
  ck(`  Australian badge artwork`, !/trust_badges\.svg/.test(h) || !/trust_badges/.test(h), 'uses the NZ badge');
}
// And the NZ pages are still New Zealand.
for (const f of ['index.html', 'for-customers.html', 'cleaners/ponsonby.html']) {
  const h = read(f);
  ck(`${f} is still New Zealand`, /New Zealand|Christchurch|Auckland/.test(h));
  ck(`  ...and still says criminal check`, !/police check/i.test(h) || /criminal/i.test(h));
}
// The maid portal's police-check copy.
const maid = read('maid.js');
ck('maid.js has an Australian police-check block', /National Police Check/.test(maid) && /afp\.gov\.au/.test(maid));
ck('  ...and keeps the NZ one', /Ministry of Justice/.test(maid) && /checkplease/.test(maid));
ck('  ...chosen by country', /POLICE_CHECK\[MM_COUNTRY\]/.test(maid));

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
