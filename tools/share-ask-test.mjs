// The share ask: five stars only, once only, and never stacked on the Google
// ask. Mirrors google-ask-test.mjs, which tests the ask next door to it.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
let fails = 0;
const ck = (l, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${!ok && d !== undefined ? '  -> ' + String(d).slice(0, 150) : ''}`); };

function load(alreadyAsked) {
  const store = alreadyAsked ? { mm_share_asked: '1' } : {};
  const shown = [];
  const clicks = {};
  // A node that remembers the handler hung on each data- hook, so a test can
  // press "Share" and see what it did.
  const el = () => ({
    className: '', innerHTML: '', style: {}, hidden: false, textContent: '',
    appendChild() {}, remove() { shown.pop(); }, addEventListener() {},
    querySelector(sel) {
      const node = { hidden: false, textContent: '', addEventListener(_e, fn) { clicks[sel] = fn; } };
      return node;
    },
  });
  const ctx = {
    console,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    document: { createElement: () => el(), body: { appendChild(n) { shown.push(n); } }, addEventListener() {} },
    navigator: {},
    setTimeout, Number, String,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync('C:/Matchmaid/share-ask.js', 'utf8'), ctx);
  return { ctx, shown, store, clicks };
}

const URL_ = 'https://matchmaid.co.nz';

// Anything short of five is not worth telling a friend about.
for (const score of [1, 2, 3, 4, 4.9]) {
  const { ctx, shown } = load(false);
  const r = ctx.ShareAsk.maybeAsk(score, { shareUrl: URL_ });
  ck(`${score}/5 does NOT ask`, shown.length === 0 && r === false, shown.length);
}

// Five does.
{
  const { ctx, shown } = load(false);
  const r = ctx.ShareAsk.maybeAsk(5, { shareUrl: URL_ });
  ck('5/5 asks', shown.length === 1 && r === true, shown.length);
}

// Once per person, ever.
{
  const { ctx, shown } = load(true);
  const r = ctx.ShareAsk.maybeAsk(5, { shareUrl: URL_ });
  ck('someone already asked is not asked again', shown.length === 0 && r === false, shown.length);
}

// Asking marks them asked, however they leave it.
{
  const { ctx, shown, store, clicks } = load(false);
  ctx.ShareAsk.maybeAsk(5, { shareUrl: URL_ });
  ck('  ...and the first ask is not yet remembered', store.mm_share_asked === undefined, store);
  clicks['[data-sa-no]']?.();
  ck('"Not now" counts as having been asked', store.mm_share_asked === '1', store);
  ck('  ...and closes the modal', shown.length === 0, shown.length);
}

// Nothing to share, nothing shown. A cleaner whose referral code has not
// loaded must not be offered a share button that shares nothing.
{
  const { ctx, shown } = load(false);
  const r = ctx.ShareAsk.maybeAsk(5, {});
  ck('no link means no ask', shown.length === 0 && r === false, shown.length);
}

// The native sheet is preferred where there is one.
{
  const { ctx, shown, clicks } = load(false);
  let got = null;
  ctx.navigator.share = (d) => { got = d; return Promise.resolve(); };
  ctx.ShareAsk.maybeAsk(5, { shareUrl: URL_, shareText: 'hello' });
  clicks['[data-sa-go]']?.();
  ck('the share sheet gets the link', got && got.url === URL_, got);
  ck('  ...and the words to go with it', got && got.text === 'hello', got);
}

// Without one, the link goes to the clipboard rather than nowhere.
{
  const { ctx, clicks } = load(false);
  let copied = null;
  ctx.navigator.clipboard = { writeText: (t) => { copied = t; return Promise.resolve(); } };
  ctx.ShareAsk.maybeAsk(5, { shareUrl: URL_ });
  clicks['[data-sa-go]']?.();
  ck('with no share sheet, the link is copied', copied === URL_, copied);
}

// Both portals have to actually load it, or none of the above runs.
for (const page of ['customer.html', 'maid.html']) {
  const h = readFileSync('C:/Matchmaid/' + page, 'utf8');
  ck(`${page} loads share-ask.js`, /share-ask\.js/.test(h));
}
// And both must chain the two asks rather than firing both.
for (const f of ['customer.js', 'maid.js']) {
  const js = readFileSync('C:/Matchmaid/' + f, 'utf8');
  ck(`${f} only asks to share when Google stayed quiet`, /if \(shown/.test(js) && /ShareAsk\?\.maybeAsk/.test(js));
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
