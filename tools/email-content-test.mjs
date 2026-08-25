// Capture what would actually be sent, by giving Resend a fake key and
// intercepting the HTTP call.
process.env.RESEND_API_KEY = 'test-key-not-real';
const sent = [];
globalThis.fetch = async (url, opts) => {
  sent.push(JSON.parse(opts.body));
  return { ok: true, status: 200, text: async () => '' };
};
const { sendCleanerReviewEmail, sendReviewRequestEmail } =
  await import('file:///C:/Matchmaid/server/email.js');

let fails = 0;
const ck = (l, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${!ok && d ? '  -> ' + String(d).slice(0, 200) : ''}`); };

const dims = [
  { label: 'Quality of clean', value: 5 },
  { label: 'Value for money', value: 4.5 },
  { label: 'Finished on time', value: 3.1 },
  { label: 'Turned up on time', value: 5 },
  { label: 'Communication', value: 4 },
];
const base = {
  to: 'c@example.invalid', cleanerName: 'Ana Smith', clientName: 'Ben Kerr',
  dims, wouldUseAgain: true, comment: 'Spotless, and lovely to deal with.',
  referralLink: 'https://matchmaid.co.nz/login?role=maid&mode=signup&ref=ABC123',
  creditDollars: 20, googleUrl: 'https://g.page/r/EXAMPLE/review',
};

// --- a good review: everything, including both asks ------------------------
sent.length = 0;
await sendCleanerReviewEmail({ ...base, overall: 4.32 });
let m = sent[0];
ck('subject names the customer and the score', m.subject === 'Ben rated your clean 4.3/5', m.subject);
for (const d of dims) ck(`  shows "${d.label}"`, m.html.includes(d.label));
for (const v of ['5.0', '4.5', '3.1', '4.0']) ck(`  shows the ${v} score`, m.html.includes(v), v);
ck('  shows the overall', m.html.includes('4.3'));
ck('  shows would-book-again', /would book you again/i.test(m.html));
ck('  quotes the comment', m.html.includes('Spotless'));
ck('  asks for a Google review', /Review Match Maid on Google/.test(m.html) && m.html.includes('g.page'));
ck('  asks them to refer a cleaner', /Share your referral link/.test(m.html) && m.html.includes('ref=ABC123'));
ck('  names the credit', m.html.includes('$20 credit'));
ck('  plain-text part carries every category',
  dims.every((d) => m.text.includes(d.label)), m.text.slice(0, 200));
ck('  plain-text part carries both asks',
  m.text.includes('g.page') && m.text.includes('ref=ABC123'));

// --- a poor review: the review, but no asks --------------------------------
sent.length = 0;
await sendCleanerReviewEmail({ ...base, overall: 2.4, wouldUseAgain: false, comment: 'Rushed it.' });
m = sent[0];
ck('a poor review is still delivered in full', m.html.includes('Quality of clean') && m.html.includes('Rushed it'));
ck('  says they would NOT book again', /did not say they would book again/i.test(m.html));
ck('  does NOT ask for a Google review', !/Review Match Maid on Google/.test(m.html));
ck('  does NOT ask for referrals', !/Share your referral link/.test(m.html));
ck('  and neither ask leaks into the text part',
  !m.text.includes('g.page') && !m.text.includes('ref=ABC123'));

// --- 4.0 exactly is the boundary -------------------------------------------
sent.length = 0;
await sendCleanerReviewEmail({ ...base, overall: 4.0 });
ck('exactly 4.0 counts as good', /Review Match Maid on Google/.test(sent[0].html));
sent.length = 0;
await sendCleanerReviewEmail({ ...base, overall: 3.9 });
ck('3.9 does not', !/Review Match Maid on Google/.test(sent[0].html));

// --- no Google Business Profile yet ----------------------------------------
sent.length = 0;
await sendCleanerReviewEmail({ ...base, overall: 5, googleUrl: '' });
m = sent[0];
ck('with no Google URL set, that ask is omitted entirely', !/Google/.test(m.html), m.html.match(/.{0,40}Google.{0,40}/)?.[0]);
ck('  ...but the referral ask still goes', /Share your referral link/.test(m.html));
ck('  ...and no empty link is rendered', !/href=""/.test(m.html));

// --- a cleaner with no referral code ---------------------------------------
sent.length = 0;
await sendCleanerReviewEmail({ ...base, overall: 5, referralLink: '' });
ck('no referral code means no referral ask', !/Share your referral link/.test(sent[0].html));
ck('  ...and the Google ask is unaffected', /Review Match Maid on Google/.test(sent[0].html));

// --- the customer prompt ----------------------------------------------------
sent.length = 0;
await sendReviewRequestEmail({ to: 'x@example.invalid', name: 'Ben Kerr', cleanerName: 'Ana Smith', when: 'Fri 21 Aug' });
m = sent[0];
ck('the customer prompt names the cleaner in the subject',
  m.subject === 'How did your clean with Ana Smith go?', m.subject);
ck('  greets them by first name only', m.html.includes('Hi Ben,') && !m.html.includes('Hi Ben Kerr,'));
ck('  says when the clean was', m.html.includes('Fri 21 Aug'));
ck('  links straight to the thread', m.html.includes('/customer?tab=messages'));
ck('  invites a complaint rather than only praise', /something went wrong/i.test(m.html));
ck('  has a plain-text part', typeof m.text === 'string' && m.text.length > 40);

// --- escaping ---------------------------------------------------------------
sent.length = 0;
await sendCleanerReviewEmail({ ...base, overall: 5, comment: '<script>alert(1)</script> & "quotes"' });
ck('a comment is HTML-escaped', !sent[0].html.includes('<script>') && sent[0].html.includes('&lt;script&gt;'));
sent.length = 0;
await sendReviewRequestEmail({ to: 'x@example.invalid', name: 'B', cleanerName: '<b>Evil</b>', when: '' });
ck('a business name is escaped too', !sent[0].html.includes('<b>Evil</b>'));

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
