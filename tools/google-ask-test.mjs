// The Google ask: only after a good rating, only once, only if configured.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
let fails = 0;
const ck = (l, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${!ok && d !== undefined ? '  -> ' + String(d).slice(0,150) : ''}`); };

function load(storedUrl, alreadyAsked) {
  const store = alreadyAsked ? { mm_google_asked: '1' } : {};
  const shown = [];
  const el = () => ({ className:'', innerHTML:'', style:{}, appendChild(){}, remove(){ shown.pop(); },
    addEventListener(){}, querySelector(){ return { addEventListener(){} }; } });
  const ctx = {
    console,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k,v)=>{store[k]=v;}, removeItem: k=>{delete store[k];} },
    document: { createElement: () => { const n = el(); return n; },
      body: { appendChild(n){ shown.push(n); } }, addEventListener(){} },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ url: storedUrl }) }),
    setTimeout, Number, String,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync('C:/Matchmaid/google-review.js','utf8'), ctx);
  return { ctx, shown, store };
}
const settle = () => new Promise(r => setTimeout(r, 20));

// Below the bar: silent.
for (const score of [1, 2, 3, 3.9]) {
  const { ctx, shown } = load('https://g.page/x/review', false);
  ctx.GoogleAsk.maybeAsk(score, {}); await settle();
  ck(`${score}/5 does NOT ask`, shown.length === 0, shown.length);
}
// At or above: asks.
for (const score of [4, 4.5, 5]) {
  const { ctx, shown } = load('https://g.page/x/review', false);
  ctx.GoogleAsk.maybeAsk(score, {}); await settle();
  ck(`${score}/5 asks`, shown.length === 1, shown.length);
}
// Once per person, ever.
{
  const { ctx, shown } = load('https://g.page/x/review', true);
  ctx.GoogleAsk.maybeAsk(5, {}); await settle();
  ck('someone already asked is never asked again', shown.length === 0, shown.length);
}
// No Business Profile: nothing at all.
{
  const { ctx, shown } = load('', false);
  ctx.GoogleAsk.maybeAsk(5, {}); await settle();
  ck('no Google URL configured means no ask', shown.length === 0, shown.length);
}
ck('the threshold is 4', load('x', false).ctx.GoogleAsk.MIN_SCORE === 4);
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
