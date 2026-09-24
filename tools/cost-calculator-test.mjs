// The cost calculator on /cleaning-cost-calculator.
//
// It is the page most likely to be quoted back at us ("your site said $120"),
// so what matters is that the arithmetic matches the working the page prints
// underneath it, and that it never presents a range as a quote.
//
//   node tools/cost-calculator-test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let fails = 0;
const ck = (l, ok, d) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${!ok && d !== undefined ? '  -> ' + String(d).slice(0, 160) : ''}`);
};

// Runs the calculator once with the given selections and hands back what it
// rendered. estimate() fires on load, so the values are set before the script.
function run({ beds = '3', baths = '1', type = 'regular', freq = 'fortnightly' } = {}) {
  const outEl = { innerHTML: '' };
  const freqRow = { hidden: false };
  const handlers = {};
  const els = {
    calcBeds: { value: beds }, calcBaths: { value: baths },
    calcType: { value: type }, calcFreq: { value: freq },
    calcOut: outEl, calcFreqRow: freqRow,
    calc: { addEventListener: (ev, fn) => { handlers[ev] = fn; } },
  };
  const ctx = {
    console, Math, Number, String, Date, JSON,
    document: { getElementById: (id) => els[id] || null },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync('C:/Matchmaid/cost-calculator.js', 'utf8'), ctx);
  const html = outEl.innerHTML;
  const money = [...html.matchAll(/\$([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  return {
    html,
    hours: Number(/([\d.]+) hours/.exec(html)?.[1]),
    low: money[0], high: money[1],
    freqHidden: freqRow.hidden,
  };
}

// ---- the working the page prints ------------------------------------------
// 1h base + 0.45/bedroom + 0.35/bathroom, x1 regular, x1.0 fortnightly.
{
  const r = run({ beds: '3', baths: '1' });
  // (1 + 1.35 + 0.35) = 2.7 -> shown to the nearest half hour
  ck('3 bed / 1 bath fortnightly is about 2.5 hours', r.hours === 2.5, r.hours);
  ck('  ...at $35-$50/hr that is $95 to $135', r.low === 95 && r.high === 135, `${r.low}/${r.high}`);
  ck('  ...and it shows a monthly total too', /a month/.test(r.html), r.html.slice(0, 120));
}
{
  const r = run({ beds: '1', baths: '1' });
  ck('a one-bedroom flat is about 2 hours', r.hours === 2, r.hours);
}
{
  const r = run({ beds: '4', baths: '2' });
  ck('a four-bed two-bath is about 3.5 hours', r.hours === 3.5, r.hours);
}

// ---- frequency is the lever, and it moves the right way --------------------
{
  const weekly = run({ freq: 'weekly' });
  const fortnightly = run({ freq: 'fortnightly' });
  const monthly = run({ freq: 'monthly' });
  const oneOff = run({ freq: 'one-off' });
  ck('weekly costs less per visit than fortnightly', weekly.low < fortnightly.low,
    `${weekly.low} vs ${fortnightly.low}`);
  ck('monthly costs more per visit than fortnightly', monthly.low > fortnightly.low,
    `${monthly.low} vs ${fortnightly.low}`);
  ck('a one-off costs the most per visit', oneOff.low > monthly.low,
    `${oneOff.low} vs ${monthly.low}`);
  ck('a one-off is priced for the job, not per visit', /for the job/.test(oneOff.html));
  ck('  ...and shows no monthly total', !/a month/.test(oneOff.html));
}

// ---- clean type ------------------------------------------------------------
{
  const regular = run({ type: 'regular' });
  const deep = run({ type: 'deep' });
  ck('a deep clean takes longer than a regular one', deep.hours > regular.hours * 2,
    `${deep.hours} vs ${regular.hours}`);
  ck('  ...and costs more', deep.low > regular.low, `${deep.low} vs ${regular.low}`);
  ck('  ...quoting the deep-clean rate band', /\$50 to \$65 an hour/.test(deep.html));
}

// ---- an end-of-tenancy clean happens once, by definition -------------------
{
  const r = run({ type: 'end-of-tenancy', freq: 'weekly' });
  ck('end of tenancy hides the frequency control', r.freqHidden === true, r.freqHidden);
  ck('  ...and ignores a frequency it was handed anyway', /for the job/.test(r.html), r.html.slice(0, 140));
  ck('  ...and never offers a monthly total', !/a month/.test(r.html));
}

// ---- it must read as an estimate, and lead somewhere -----------------------
{
  const r = run();
  ck('it always shows a range, never one number', r.high > r.low, `${r.low}/${r.high}`);
  ck('it shows its working', /Based on cleaners charging/.test(r.html));
  ck('it deep-links into browse with the clean type', /href="\/browse\?service=regular"/.test(r.html));
}
{
  const r = run({ type: 'deep' });
  ck('  ...carrying the right clean type', /href="\/browse\?service=deep"/.test(r.html));
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
