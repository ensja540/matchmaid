// The stepped review flow, run headlessly against the real review.js.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let fails = 0;
const ck = (l, ok, d) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${!ok && d !== undefined ? '  -> ' + String(d).slice(0, 180) : ''}`); };

// A DOM stub just deep enough for querySelector/classList/dataset and events.
function makeDom(html) {
  const nodes = [];
  const mk = (tag, attrs = {}) => {
    const cls = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    const listeners = {};
    const n = {
      tag, attrs, dataset: {}, children: [], style: {}, textContent: '', innerHTML: '',
      hidden: false, disabled: false,
      classList: {
        add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c),
        toggle: (c, on) => { if (on === undefined) cls.has(c) ? cls.delete(c) : cls.add(c); else on ? cls.add(c) : cls.delete(c); },
      },
      get className() { return [...cls].join(' '); },
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k] ?? null; },
      hasAttribute(k) { return k in attrs; },
      addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
      fire(t, ev = {}) { (listeners[t] || []).forEach((fn) => fn({ preventDefault() {}, ...ev })); },
      focus() {}, scrollIntoView() {}, setPointerCapture() {},
      getBoundingClientRect: () => ({ left: 0, width: 250, top: 0, height: 50 }),
      matches: () => false,
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) { return nodes.filter((x) => x !== this && matchSel(x, sel)); },
    };
    nodes.push(n);
    return n;
  };
  const matchSel = (n, sel) =>
    sel.split(',').map((s) => s.trim()).some((s) => {
      if (s.startsWith('.')) return n.classList.contains(s.slice(1).split('[')[0]) &&
        (!s.includes('[') || s.slice(s.indexOf('[') + 1, -1).split('=')[0] in n.attrs);
      if (s.startsWith('#')) return n.attrs.id === s.slice(1);
      if (s.startsWith('[')) { const k = s.slice(1, -1).split('=')[0]; return k in n.attrs; }
      return n.tag === s;
    });
  return { mk, nodes };
}
console.log('(structural assertions on generated markup)\n');

const SRC = readFileSync('C:/Matchmaid/review.js', 'utf8');
const ctx = { window: {}, document: { createElement: () => ({}) } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(SRC, ctx);
const R = ctx.Review;

// ---- fresh review ---------------------------------------------------------
let h = R.stepsHTML(null);
// data-step, not class="rv-step" - that prefix also matches rv-step-count and
// the rv-steps wrapper.
ck('renders one step per category plus a final step',
  (h.match(/data-step="\d+"/g) || []).length === R.DIMS.length + 1, (h.match(/data-step="\d+"/g) || []).length);
ck('only the first step starts visible', (h.match(/rv-step on/g) || []).length === 1);
ck('every category starts at ZERO', (h.match(/data-value="0"/g) || []).length === R.DIMS.length,
  h.match(/data-value="\d[^"]*"/g));
ck('  ...and shows a dash, not a number', h.includes('>—<'));
ck('  ...with no stars filled', (h.match(/style="width:0%"/g) || []).length === R.DIMS.length);
ck('prompts to click or drag', /Tap a star, or drag across/.test(h));
ck('uses the extra-large star size', h.includes('rating-stars xl'));
ck('Next starts disabled - you cannot skip a category', /data-next disabled/.test(h));
ck('Back is hidden on the first step', /data-back hidden/.test(h));
ck('Submit is hidden until the end', /data-submit hidden/.test(h));
ck('has a progress dot per step',
  (h.match(/rv-dot/g) || []).length >= R.DIMS.length + 1);
ck('each category names itself and its question', R.DIMS.every((d) => h.includes(d.label) && h.includes(d.hint)));
ck('the slider is keyboard reachable', h.includes('tabindex="0"') && h.includes('role="slider"'));
ck('  ...and announces "not rated yet"', h.includes('not rated yet'));
ck('the last step asks would-book-again', /Would you book them again/.test(h));
ck('  ...and offers a comment box', h.includes('name="comment"'));

// ---- editing an existing review -------------------------------------------
h = R.stepsHTML({ quality: 5, value: 4.5, timeliness: 3, punctuality: 4, communication: 4.2,
                  wouldUseAgain: true, comment: 'Great work' });
ck('editing prefills every score', !h.includes('data-value="0"'), h.match(/data-value="[^"]*"/g));
ck('  ...prefills the comment', h.includes('Great work'));
ck('  ...and preselects the yes/no', /data-again="yes"[^>]*\sclass="[^"]*\bon\b|class="[^"]*\bon\b[^"]*"[^>]*data-again="yes"/.test(h) || h.includes('chip select lg on'));
ck('  ...and fills the stars', h.includes('width:100%') && h.includes('width:90%'));

// ---- the word scale --------------------------------------------------------
for (const [n, want] of [[0, ''], [1, 'Poor'], [2, 'Below par'], [3, 'Good'], [4, 'Great'], [5, 'Excellent'], [4.6, 'Excellent'], [3.4, 'Good']]) {
  ck(`${n} reads as "${want}"`, R.wordFor(n) === want, R.wordFor(n));
}

// ---- escaping ---------------------------------------------------------------
h = R.stepsHTML({ quality: 5, value: 5, timeliness: 5, punctuality: 5, communication: 5,
                  wouldUseAgain: true, comment: '<script>alert(1)</script>' });
ck('a saved comment is escaped when re-editing', !h.includes('<script>') && h.includes('&lt;script&gt;'));

// ---- the payload shape has not changed --------------------------------------
ck('still exposes the five dimension keys the server expects',
  R.DIMS.map((d) => d.key).join(',') === 'quality,value,timeliness,punctuality,communication',
  R.DIMS.map((d) => d.key));
ck('barsHTML (the public profile) still works',
  R.barsHTML({ count: 2, overall: 4.4, quality: 5, value: 4, timeliness: 4, punctuality: 5, communication: 4, wouldUseAgainPct: 100 }).includes('Quality of clean'));
ck('formHTML is still exported for older callers', typeof R.formHTML === 'function');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
