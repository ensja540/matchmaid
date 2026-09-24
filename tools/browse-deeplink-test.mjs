// Deep links into /browse from the service and city pages.
//
// The service pages send people here with the clean type they already chose
// (/browse?service=end-of-tenancy). Landing on "Regular house clean" instead
// makes them redo that choice, and a fair number just leave - so this covers
// what gets preselected, what gets ignored, and when the search runs itself.
//
//   node tools/browse-deeplink-test.mjs
//
// browse.js is a page script, not a module: it reads the DOM at load. Rather
// than a headless browser for four branches, it runs in a vm against a DOM stub
// - the same approach tools/google-ask-test.mjs takes with google-review.js.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let fails = 0;
const ck = (l, ok, d) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${!ok && d !== undefined ? '  -> ' + String(d).slice(0, 140) : ''}`);
};

const SERVICES = [
  { slug: 'regular', name: 'Regular house clean' },
  { slug: 'deep', name: 'Deep clean' },
  { slug: 'end-of-tenancy', name: 'End of tenancy clean' },
  { slug: 'oven', name: 'Oven clean' },
];
const TOWNS = { Christchurch: ['Riccarton', 'Papanui'], Auckland: ['Ponsonby', 'Remuera'] };

// A <select> that behaves enough like the real thing: options are parsed out of
// whatever innerHTML the page assigns, and `value` refuses anything not in them
// exactly as a real select does. That refusal is the whole point of the test.
function makeSelect() {
  const el = {
    _value: '', options: [],
    set innerHTML(html) {
      this.options = [...String(html).matchAll(/<option value="([^"]*)"/g)].map((m) => ({ value: m[1] }));
      const selected = /<option value="([^"]*)"[^>]*selected/.exec(String(html));
      this._value = selected ? selected[1] : (this.options[0]?.value ?? '');
    },
    get innerHTML() { return ''; },
    set value(v) { if (this.options.some((o) => o.value === v)) this._value = v; },
    get value() { return this._value; },
    addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
  };
  return el;
}

function load(search) {
  const searched = [];
  const generic = () => ({
    innerHTML: '', textContent: '', value: '40', hidden: false, dataset: {}, style: {},
    addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, remove() {}, setAttribute() {}, getAttribute: () => null,
  });
  const selects = { suburb: makeSelect(), service: makeSelect(), hours: makeSelect() };
  const ctx = {
    console, DEMO: { DAYS: [], SLOTS: [], services: SERVICES, towns: TOWNS, cleaners: [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search, pathname: '/browse', href: 'https://matchmaid.co.nz/browse' + search },
    URLSearchParams, Number, String, Math, Date, JSON, Array, Object, Set,
    setTimeout, clearTimeout,
    // Only /api/match is a search. The page also calls /api/cleaner-rates on
    // load to draw the price histogram - that fires either way and is not what
    // is under test here.
    fetch: (url) => { if (String(url).startsWith('/api/match')) searched.push(url); return new Promise(() => {}); },
    document: {
      getElementById: (id) => selects[id] || generic(),
      querySelectorAll: () => [], querySelector: () => null,
      createElement: generic, addEventListener() {}, body: generic(),
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  try {
    vm.runInContext(readFileSync('C:/Matchmaid/browse.js', 'utf8'), ctx);
  } catch (err) {
    // The script does plenty this stub does not model; what matters is that it
    // got past the preselect block, which sits near the top.
    if (!/Cannot read|is not a function|not defined/.test(err.message)) throw err;
  }
  return { service: selects.service.value, place: selects.suburb.value, searched };
}

// ---- nothing in the URL: the defaults stand -------------------------------
{
  const r = load('');
  ck('no params leaves the default clean type', r.service === 'regular', r.service);
  ck('  ...and the default location', r.place === 'town:Christchurch', r.place);
  ck('  ...and does not run a search', r.searched.length === 0, r.searched);
}

// ---- a service page link ---------------------------------------------------
{
  const r = load('?service=end-of-tenancy');
  ck('?service preselects that clean type', r.service === 'end-of-tenancy', r.service);
  ck('  ...leaving the location alone', r.place === 'town:Christchurch', r.place);
  ck('  ...and waits for the visitor to search', r.searched.length === 0, r.searched);
}
{
  const r = load('?service=deep');
  ck('?service=deep works too', r.service === 'deep', r.service);
}

// ---- a service page link that names a city ---------------------------------
{
  const r = load('?service=deep&town=Auckland');
  ck('service + town preselects both', r.service === 'deep' && r.place === 'town:Auckland',
    `${r.service} / ${r.place}`);
  ck('  ...and runs the search on arrival', r.searched.length === 1, r.searched);
}
{
  const r = load('?service=regular&suburb=Riccarton');
  ck('?suburb works as well as ?town', r.place === 'Riccarton', r.place);
  ck('  ...and also runs the search', r.searched.length === 1, r.searched);
}

// ---- rubbish in the URL is ignored, not obeyed ------------------------------
{
  const r = load('?service=not-a-service');
  ck('an unknown service falls back to the default', r.service === 'regular', r.service);
  ck('  ...and does not run a search on a half-understood link', r.searched.length === 0, r.searched);
}
{
  const r = load('?town=Narnia');
  ck('an unknown town falls back to the default', r.place === 'town:Christchurch', r.place);
}
{
  const r = load('?service=deep&town=Narnia');
  ck('a good service with a bad town keeps the service', r.service === 'deep', r.service);
  ck('  ...but does not auto-search on a half-valid link', r.searched.length === 0, r.searched);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
