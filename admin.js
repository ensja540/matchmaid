// Admin verification review. Gated server-side to the admin email; a
// non-admin session just gets a 403 and a friendly message.
const sessionUser = window.Session && Session.get();
const body = document.getElementById('adminBody');
const who = document.getElementById('who');
if (who && sessionUser) who.textContent = sessionUser.name || sessionUser.email || '';

const TYPE_LBL = { id: 'Identity document', police: 'Criminal check', insurance: 'Insurance' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Documents are stored as data: URLs (base64 in the DB). Two problems with
// linking to them directly: browsers refuse to open a data: URL as a top-level
// tab (so "Open document" did nothing), and anything that opens a file risks a
// download. Turning the data: URL into a blob: URL fixes both - the browser
// renders it inline in its own viewer (PDF or image), and nothing hits the disk.
// Nothing is ever downloaded or executed; it is only ever viewed in the browser.
const blobCache = new Map(); // data URL -> blob: URL, so we build each once
function toBlobUrl(dataUrl) {
  if (!dataUrl || !/^data:/.test(dataUrl)) return dataUrl || '';
  if (blobCache.has(dataUrl)) return blobCache.get(dataUrl);
  try {
    const comma = dataUrl.indexOf(',');
    const meta = dataUrl.slice(5, comma);
    const mime = (meta.split(';')[0]) || 'application/octet-stream';
    const isB64 = /;base64/i.test(meta);
    const body = dataUrl.slice(comma + 1);
    let blob;
    if (isB64) {
      const bin = atob(body);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      blob = new Blob([bytes], { type: mime });
    } else {
      blob = new Blob([decodeURIComponent(body)], { type: mime });
    }
    const url = URL.createObjectURL(blob);
    blobCache.set(dataUrl, url);
    return url;
  } catch {
    return dataUrl; // fall back to the raw URL rather than breaking the card
  }
}
// Open a stored file inline in a new tab (the browser renders PDFs/images in its
// own viewer - viewing, never downloading). Used for "view full size".
function viewStoredFile(dataUrl) {
  const url = toBlobUrl(dataUrl);
  if (url) window.open(url, '_blank', 'noopener');
}

const feedbackBody = document.getElementById('feedbackBody');
const reviewsBody = document.getElementById('reviewsBody');
const statsBody = document.getElementById('statsBody');

// ---- Signup stats -----------------------------------------------------------
// Stacked columns: each day's total split into the two sides, which is a
// part-to-whole reading rather than a comparison of two independent series.
// Two fixed series colours, never reassigned by size: customers teal, cleaners
// amber. Both clear the CVD separation check against a light surface; amber
// sits under 3:1 contrast, which is why the table view below is not optional.
const SERIES = [
  { key: 'customers', label: 'Customers', color: '#0e9384' },
  { key: 'cleaners', label: 'Cleaners', color: '#f59e0b' },
];
// Declared before the entry point below: loadStats() reads statsRange while
// building its request, so with `let` (not hoisted) it must exist by then.
let statsRange = 30;
let statsData = null;
let statsTable = false;

if (!sessionUser) {
  body.innerHTML = '<div class="panel-card"><p class="muted">Please <a href="/login">log in</a> with the admin account to review documents.</p></div>';
} else {
  load();
  loadFeedback();
  loadReviews();
  loadStats();
}

// One section visible at a time. Everything still loads up front (the queries
// are cheap and it keeps the tab counts live), the tabs just decide what shows.
const adminTabs = document.getElementById('adminTabs');
adminTabs?.addEventListener('click', (e) => {
  const btn = e.target.closest('.portal-tab');
  if (!btn) return;
  adminTabs.querySelectorAll('.portal-tab').forEach((b) => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.admin-panel').forEach((p) => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
  // Leaflet measures the container on creation. Built inside a hidden panel it
  // reads 0x0 and renders a grey box, so the map is only built once its tab is
  // first shown, and told to re-measure on every later visit.
  if (btn.dataset.tab === 'coverage') showCoverage();
});
// A count on a tab, so a full review queue is visible without opening it.
function setTabCount(tab, n) {
  const btn = adminTabs?.querySelector(`[data-tab="${tab}"]`);
  if (!btn) return;
  let b = btn.querySelector('.tab-count');
  if (!n) { b?.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'tab-count'; btn.appendChild(b); }
  b.textContent = n;
}

// ---------- Coverage heatmap ----------
// How many active cleaners can service each suburb, as a point map per city.
//
// Colour is the encoding, so it is a sequential one-hue ramp (light -> dark),
// not a rainbow: the reader should be able to rank two suburbs by shade alone.
// Steps were checked with the palette validator rather than picked by eye - the
// light end clears 2:1 on the map surface, lightness is monotone, and the hue
// spread across the ramp is 1 degree.
//
// Zero is deliberately NOT the lightest step. "No cleaner at all" is a different
// kind of fact from "not many", and it is the one worth acting on, so it gets a
// hollow neutral ring that reads as a hole in the map rather than a pale fill.
const COV_RAMP = ['#43c6b4', '#17a998', '#0e7d71', '#0a534b'];
const COV_NONE = '#5b7480';
const covBucket = (n) => (n <= 0 ? -1 : Math.min(n, COV_RAMP.length) - 1);
const covColor = (n) => (n <= 0 ? COV_NONE : COV_RAMP[covBucket(n)]);

const coverageBody = document.getElementById('coverageBody');
let coverageData = null, coverageCity = 'chch', coverageMap = null, coverageTable = false;

async function showCoverage() {
  if (!coverageBody) return;
  if (coverageData) { renderCoverage(); return; }
  coverageBody.innerHTML = '<div class="panel-card"><p class="muted">Loading coverage…</p></div>';
  try {
    const res = await fetch(`/api/admin/coverage?userId=${encodeURIComponent(sessionUser.id)}`);
    if (res.status === 403) {
      coverageBody.innerHTML = '<div class="panel-card"><p class="muted">Admin only.</p></div>';
      return;
    }
    if (!res.ok) throw new Error(`server returned ${res.status}`);
    coverageData = await res.json();
    renderCoverage();
  } catch (err) {
    console.error('coverage:', err);
    coverageBody.innerHTML =
      `<div class="panel-card"><p class="muted">Could not load coverage (${esc(err.message || 'network error')}).
       <button class="btn ghost sm" type="button" data-cov-retry>Retry</button></p></div>`;
    coverageBody.querySelector('[data-cov-retry]')?.addEventListener('click', showCoverage);
  }
}

// The ramp as a key. Max drives how many steps are shown, so the legend never
// advertises a "4+" band nobody has reached.
function covLegendHTML(max) {
  const steps = COV_RAMP.slice(0, Math.max(1, Math.min(max, COV_RAMP.length)))
    .map((c, i) => {
      const last = i === COV_RAMP.length - 1 || i === max - 1;
      const label = last && max > i + 1 ? `${i + 1}+` : String(i + 1);
      return `<span class="cov-key"><i style="background:${c}"></i>${label}</span>`;
    })
    .join('');
  return `<div class="cov-legend">
    <span class="cov-key"><i class="cov-key-none"></i>none</span>
    ${steps}
    <span class="cov-key-label">cleaners covering the suburb</span>
  </div>`;
}

// Region-by-region coverage, for the national view only. The map shows where
// the dots are; this says how thin they are - a region with 3 of 233 suburbs
// covered looks like a presence on a map and is barely one in fact.
function regionBarsHTML(city) {
  const regions = (city.regions || []).filter((r) => r.region);
  if (!regions.length) return '';
  const shown = regions.filter((r) => r.covered > 0);
  const empty = regions.length - shown.length;
  if (!shown.length) return '<p class="muted cov-regions-note">No region has a single covered suburb yet.</p>';
  return `<div class="cov-regions">
    <h4 class="adv-group-title">Where we actually reach</h4>
    <ol class="tt-list">${shown.map((r) => {
      const pct = r.total ? Math.round((r.covered / r.total) * 100) : 0;
      return `<li class="tt-row">
        <span class="tt-name">${esc(r.region)}</span>
        <span class="tt-bar" aria-hidden="true"><i class="tt-fill tt-cust" style="width:${pct}%"></i></span>
        <span class="tt-count">${r.covered}<span class="tt-split">of ${r.total} · ${pct}%</span></span>
      </li>`;
    }).join('')}</ol>
    ${empty ? `<p class="muted cov-regions-note">${empty} other region${empty === 1 ? '' : 's'} with no cleaner at all.</p>` : ''}
  </div>`;
}

function renderCoverage() {
  const d = coverageData;
  if (!d || !coverageBody) return;
  const city = (d.cities || []).find((c) => c.key === coverageCity) || (d.cities || [])[0];
  if (!city) { coverageBody.innerHTML = '<div class="panel-card"><p class="muted">No coverage data.</p></div>'; return; }
  coverageCity = city.key;
  const s = city.stats;
  const pct = s.total ? Math.round((s.covered / s.total) * 100) : 0;

  coverageBody.innerHTML = `
    <div class="panel-card">
      <div class="sg-controls">
        ${(d.cities || []).map((c) =>
          `<button class="chip select ${c.key === coverageCity ? 'on' : ''}" type="button" data-city="${esc(c.key)}">${esc(c.name)}</button>`
        ).join('')}
        <button class="btn ghost sm sg-toggle" type="button" data-cov-table>${coverageTable ? 'Show map' : 'Show table'}</button>
      </div>
      <div class="sg-kpis">
        <div class="sg-kpi"><span class="sg-kpi-label">${city.national ? 'Suburbs in NZ' : 'Suburbs in range'}</span><span class="sg-kpi-value">${s.total.toLocaleString()}</span><span class="sg-kpi-sub">${city.national ? 'every suburb we know of' : `within ${city.radiusKm}km of the centre`}</span></div>
        <div class="sg-kpi"><span class="sg-kpi-label">Covered</span><span class="sg-kpi-value">${s.covered}</span><span class="sg-kpi-sub">${pct}% of them</span></div>
        <div class="sg-kpi"><span class="sg-kpi-label">No cleaner</span><span class="sg-kpi-value">${s.uncovered.toLocaleString()}</span><span class="sg-kpi-sub">gaps to recruit into</span></div>
        ${city.national
          ? `<div class="sg-kpi"><span class="sg-kpi-label">Regions reached</span><span class="sg-kpi-value">${s.regionsCovered} <span class="sg-kpi-of">/ ${s.regionsTotal}</span></span><span class="sg-kpi-sub">with at least one cleaner</span></div>`
          : `<div class="sg-kpi"><span class="sg-kpi-label">Best covered</span><span class="sg-kpi-value">${s.max}</span><span class="sg-kpi-sub">cleaners on one suburb</span></div>`}
      </div>
      ${city.national ? regionBarsHTML(city) : ''}
      ${coverageTable ? covTableHTML(city) : `${covLegendHTML(s.max)}<div class="cov-map" id="covMap"></div>`}
    </div>`;

  coverageBody.querySelectorAll('[data-city]').forEach((b) =>
    b.addEventListener('click', () => { coverageCity = b.dataset.city; renderCoverage(); })
  );
  coverageBody.querySelector('[data-cov-table]')?.addEventListener('click', () => {
    coverageTable = !coverageTable;
    renderCoverage();
  });
  if (!coverageTable) drawCoverageMap(city);
}

// A table view of the same numbers, so the map is never the only way to read it
// (and so a suburb can be found by name rather than by hunting for a dot).
function covTableHTML(city) {
  const rows = city.suburbs.slice().sort((a, b) => b.cleaners - a.cleaners || a.name.localeCompare(b.name));
  return `<div class="sg-tablewrap"><table class="sg-table cov-table">
    <thead><tr><th>Suburb</th><th>Town</th><th class="cov-num">Cleaners</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${esc(r.name)}</td><td class="muted">${esc(r.town || '')}</td>
      <td class="cov-num">${r.cleaners === 0
        ? '<span class="cov-zero">0</span>'
        : `<span class="cov-swatch" style="background:${covColor(r.cleaners)}"></span>${r.cleaners}`}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function drawCoverageMap(city) {
  const mount = document.getElementById('covMap');
  if (!mount || typeof L === 'undefined') return;
  if (coverageMap) { coverageMap.remove(); coverageMap = null; }

  // preferCanvas: the national view draws 1,688 markers, and one SVG node each
  // makes panning crawl. Canvas renders them as paint rather than DOM, which is
  // the difference between smooth and unusable at that count.
  const map = L.map(mount, { scrollWheelZoom: false, zoomControl: true, preferCanvas: true })
    .setView([city.center.lat, city.center.lng], city.zoom || 11);
  coverageMap = map;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // Covered suburbs are drawn last so a filled dot is never hidden under a
  // hollow one where two suburb centres nearly coincide.
  const ordered = city.suburbs.slice().sort((a, b) => a.cleaners - b.cleaners);
  const pts = [];
  // Zoomed out to the whole country the dots would merge into one smear, so they
  // shrink. Covered stays a touch bigger than uncovered either way - at national
  // zoom the handful of covered suburbs is the signal, and it has to survive
  // being surrounded by 1,500 empty ones.
  const rNone = city.national ? 2.5 : 5;
  const rSome = city.national ? 4.5 : 7;
  for (const sub of ordered) {
    const none = sub.cleaners === 0;
    pts.push([sub.lat, sub.lng]);
    L.circleMarker([sub.lat, sub.lng], {
      radius: none ? rNone : rSome,
      color: none ? COV_NONE : '#ffffff', // white ring separates touching marks
      // A 1.5px ring on a 2.5px dot is mostly ring, which turns the national
      // view grey. Thinner outlines when zoomed out.
      weight: city.national ? 0.8 : 1.5,
      opacity: 1,
      fillColor: none ? '#ffffff' : covColor(sub.cleaners),
      fillOpacity: none ? 0.35 : 0.92,
    })
      .bindTooltip(
        `<strong>${esc(sub.name)}</strong><br />${sub.cleaners} cleaner${sub.cleaners === 1 ? '' : 's'}` +
          (sub.town && sub.town !== sub.name ? `<br /><span class="cov-tip-town">${esc(sub.town)}</span>` : ''),
        { direction: 'top', className: 'cov-tip' }
      )
      .addTo(map);
  }
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.06));
  // The panel was hidden until a moment ago; re-measure once it has real size.
  setTimeout(() => { if (coverageMap === map) map.invalidateSize(); }, 60);
}

async function loadStats() {
  if (!statsBody) return;
  // Hold the previous render at reduced opacity rather than flashing a skeleton.
  const plot = statsBody.querySelector('.sg-wrap');
  if (plot) plot.style.opacity = '0.45';
  try {
    const res = await fetch(
      `/api/admin/stats?userId=${encodeURIComponent(sessionUser.id)}&days=${statsRange}`
    );
    if (res.status === 403) {
      statsBody.innerHTML = '<div class="panel-card"><p class="muted">Admin only.</p></div>';
      return;
    }
    if (!res.ok) throw new Error(`server returned ${res.status}`);
    statsData = await res.json();
    renderStats();
  } catch (err) {
    // Say what actually went wrong. A bare "could not load" gave no way to tell
    // a mid-deploy 404 from a broken query.
    console.error('signup stats:', err);
    statsBody.innerHTML =
      `<div class="panel-card"><p class="muted">Could not load signup stats (${esc(err.message || 'network error')}).
       <button class="btn ghost sm" type="button" data-retry>Retry</button></p></div>`;
    statsBody.querySelector('[data-retry]')?.addEventListener('click', loadStats);
  }
}

function renderStats() {
  const d = statsData;
  if (!d) return;
  const series = d.series || [];
  const totalInRange = series.reduce((n, r) => n + r.customers + r.cleaners, 0);

  statsBody.innerHTML = `
    <div class="panel-card">
      <div class="sg-controls">
        ${[30, 60, 90].map((n) =>
          `<button class="chip select ${n === statsRange ? 'on' : ''}" type="button" data-range="${n}">${n} days</button>`
        ).join('')}
        <button class="btn ghost sm sg-toggle" type="button" data-table>${statsTable ? 'Show chart' : 'Show table'}</button>
      </div>

      ${kpiRowHTML(d, totalInRange)}
      ${statsTable ? tableHTML(series) : chartHTML(series)}
    </div>
    ${funnelHTML(d)}
    ${sourcesHTML(d)}
    ${advancedHTML(d)}
    ${topTownsHTML(d)}`;

  statsBody.querySelectorAll('[data-range]').forEach((b) =>
    b.addEventListener('click', () => { statsRange = Number(b.dataset.range); loadStats(); })
  );
  statsBody.querySelector('[data-table]')?.addEventListener('click', () => {
    statsTable = !statsTable;
    renderStats();
  });
  if (!statsTable) wireChartHover();
}

// Headline numbers as stat tiles, not a chart - a handful of single values.
// Proportional figures (no tabular-nums) at this size.
function kpiRowHTML(d, totalInRange) {
  const t = d.totals || {};
  const tiles = [
    { label: 'Customers, all time', value: t.customers ?? 0, sub: `${t.customersActive ?? 0} active` },
    { label: 'Cleaners, all time', value: t.cleaners ?? 0, sub: `${t.cleanersActive ?? 0} active` },
    { label: `Signups, last ${d.days} days`, value: totalInRange, sub: 'both sides' },
  ];
  return `<div class="sg-kpis">${tiles.map((k) => `
    <div class="sg-kpi">
      <span class="sg-kpi-label">${esc(k.label)}</span>
      <span class="sg-kpi-value">${k.value.toLocaleString()}</span>
      <span class="sg-kpi-sub">${esc(k.sub)}</span>
    </div>`).join('')}</div>`;
}

// Onboarding funnel, one column per side. Bars are widthed against the TOP of
// the funnel, not the biggest remaining stage, so the shape of the drop-off is
// the thing you see. Two percentages per row because they answer different
// questions: "of everyone who signed up" (overall) and "of the people who got
// this far" (step) - the second is what tells you which step is leaking.
function funnelSideHTML(title, stages, removed) {
  if (!stages || !stages.length) return '';
  const top = stages[0].value;
  const rows = stages.map((s, i) => {
    const prev = i === 0 ? null : stages[i - 1].value;
    const pctTop = top ? Math.round((s.value / top) * 100) : 0;
    const pctStep = prev == null ? null : prev ? Math.round((s.value / prev) * 100) : 0;
    const drop = prev == null ? 0 : prev - s.value;
    return `<li class="fn-row">
      <div class="fn-line">
        <span class="fn-label">${esc(s.label)}</span>
        <span class="fn-count">${s.value.toLocaleString()}</span>
      </div>
      <div class="fn-track"><span class="fn-bar" style="width:${top ? Math.max(pctTop, 1.5) : 0}%"></span></div>
      <div class="fn-line fn-meta">
        <span class="muted">${pctTop}% of signups</span>
        ${pctStep == null
          ? '<span class="muted">—</span>'
          : `<span class="${drop > 0 ? 'fn-drop' : 'muted'}">${pctStep}% of previous${drop > 0 ? ` · lost ${drop}` : ''}</span>`}
      </div>
    </li>`;
  });
  return `<div class="fn-side">
    <h4 class="adv-group-title">${esc(title)}</h4>
    <ol class="fn-list">${rows.join('')}</ol>
    ${removed ? `<p class="fn-note muted">Excludes ${removed} removed account${removed === 1 ? '' : 's'}.</p>` : ''}
  </div>`;
}
function funnelHTML(d) {
  const f = d.funnel;
  if (!f) return '';
  return `<div class="panel-card adv-card">
    <h3 class="adv-head">Onboarding funnel</h3>
    <div class="fn-grid">
      ${funnelSideHTML('Cleaners', f.cleaners, f.removedCleaners)}
      ${funnelSideHTML('Customers', f.customers, f.removedCustomers)}
    </div>
  </div>`;
}

// Where signups came from. A ranked bar per channel, split cleaner/customer.
//
// "unknown" is shown, never hidden and never folded into direct. It is everyone
// who signed up before attribution was recorded, plus anyone whose browser
// cleared storage between landing and signing up. Dropping it would make the
// attributed slice read as 100% of signups when it isn't - so it is called out
// above the list with how much of the window it accounts for.
const SOURCE_LABEL = {
  direct: 'Direct / typed the address',
  google: 'Google',
  flyer: 'Flyer',
  unknown: 'Unknown',
  bing: 'Bing',
  facebook: 'Facebook',
  instagram: 'Instagram',
  neighbourly: 'Neighbourly',
  trademe: 'Trade Me',
};
const MEDIUM_LABEL = { organic: 'organic', cpc: 'paid', social: 'social', referral: 'referral', print: 'print', none: '', unknown: '' };
function sourceName(s) {
  return SOURCE_LABEL[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown');
}
function sourcesHTML(d) {
  const rows = d.sources || [];
  if (!rows.length) {
    return `<div class="panel-card">
      <h3 class="adv-head">Where signups came from</h3>
      <p class="muted">No signups in the last ${d.days} days.</p>
    </div>`;
  }
  const total = rows.reduce((n, r) => n + r.total, 0);
  const unknown = rows.filter((r) => r.source === 'unknown').reduce((n, r) => n + r.total, 0);
  const max = Math.max(...rows.map((r) => r.total));
  // Same two colours, same two meanings, as Top towns directly below - a reader
  // shouldn't have to relearn which side is which between two adjacent charts.
  const list = rows.map((r) => {
    const med = MEDIUM_LABEL[r.medium] != null ? MEDIUM_LABEL[r.medium] : r.medium;
    const pct = total ? Math.round((r.total / total) * 100) : 0;
    return `<li class="tt-row">
      <span class="tt-name">${esc(sourceName(r.source))}${med ? `<span class="src-medium">${esc(med)}</span>` : ''}</span>
      <span class="tt-bar" aria-hidden="true">
        <i class="tt-fill tt-cust" style="width:${max ? (r.customers / max) * 100 : 0}%"></i>
        <i class="tt-fill tt-clean" style="width:${max ? (r.cleaners / max) * 100 : 0}%"></i>
      </span>
      <span class="tt-count">${r.total}<span class="tt-split">${pct}% · ${r.customers}c · ${r.cleaners}m</span></span>
    </li>`;
  }).join('');
  const attributed = total - unknown;
  return `<div class="panel-card">
    <h3 class="tt-head">Where signups came from <span class="muted tt-sub">last ${d.days} days</span></h3>
    <p class="muted src-note">First touch: the channel that first brought them to the site, not the last one before signing up.
      ${unknown
        ? `<strong>${attributed} of ${total}</strong> carry a source - the other ${unknown} signed up before attribution was recorded.`
        : `All ${total} carry a source.`}</p>
    <div class="sg-legend tt-legend">
      <span class="sg-key"><i class="tt-cust"></i>Customers</span>
      <span class="sg-key"><i class="tt-clean"></i>Cleaners</span>
    </div>
    <ol class="tt-list">${list}</ol>
  </div>`;
}

// Marketplace health, grouped the way a two-sided market is read: supply on one
// side, demand on the other, growth and quality below. Each is a compact tile.
function metricTile(label, value, sub) {
  return `<div class="adv-metric">
    <span class="adv-label">${esc(label)}</span>
    <span class="adv-value">${value}</span>
    ${sub ? `<span class="adv-sub">${esc(sub)}</span>` : ''}
  </div>`;
}
function advancedHTML(d) {
  const a = d.advanced;
  if (!a) return '';
  const t = d.totals || {};
  const wow = a.signupsWowPct;
  const wowStr = wow == null ? '—' : `${wow > 0 ? '+' : ''}${wow}%`;
  const wowCls = wow == null ? '' : wow > 0 ? 'up' : wow < 0 ? 'down' : '';
  const num = (n) => (n == null ? '—' : Number(n).toLocaleString());
  const groups = [
    ['Supply', [
      metricTile('Active listings', num(a.activeListings), `${num(t.cleaners)} cleaners total`),
      metricTile('ID verified', num(a.verifiedId)),
      metricTile('Police checked', num(a.verifiedPolice)),
      metricTile('Insured', num(a.verifiedInsurance)),
      metricTile('Suburbs covered', num(a.suburbsCovered), 'by an active listing'),
    ]],
    ['Demand', [
      metricTile('Customers', num(t.customers)),
      metricTile('Enquiries', num(a.enquiriesTotal), `${num(a.enquiriesWindow)} in ${d.days} days`),
      metricTile('Reply rate', a.enquiryResponseRate == null ? '—' : `${a.enquiryResponseRate}%`, 'enquiries answered'),
      metricTile('Per listing', a.customersPerListing == null ? '—' : a.customersPerListing, 'customers each'),
      metricTile('Bookings', num(a.bookings)),
    ]],
    ['Growth & quality', [
      metricTile('New this week', num(a.signupsThisWeek), `${num(a.signupsPrevWeek)} the week before`),
      metricTile('Week on week', `<span class="adv-wow ${wowCls}">${wowStr}</span>`),
      metricTile('Reviews', num(a.reviews)),
      metricTile('Avg rating', a.avgRating != null ? a.avgRating.toFixed(2) : '—', a.reviews ? 'out of 5' : 'none yet'),
    ]],
  ];
  return `<div class="panel-card adv-card">
    <h3 class="adv-head">Marketplace health</h3>
    ${groups.map(([title, tiles]) => `<div class="adv-group">
      <h4 class="adv-group-title">${title}</h4>
      <div class="adv-grid">${tiles.join('')}</div>
    </div>`).join('')}
  </div>`;
}

// Where signups came from, over the same window as the chart. A ranked bar per
// town, split into customers and cleaners so an admin can see, say, a town full
// of customers with no cleaner to serve them.
function topTownsHTML(d) {
  const towns = d.topTowns || [];
  if (!towns.length) {
    return `<div class="panel-card">
      <h3 class="tt-head">Top towns</h3>
      <p class="muted">No signups with a saved location in the last ${d.days} days.</p>
    </div>`;
  }
  const max = Math.max(...towns.map((t) => t.total));
  const rows = towns.map((t) => `
    <li class="tt-row">
      <span class="tt-name">${esc(t.town)}</span>
      <span class="tt-bar" aria-hidden="true">
        <i class="tt-fill tt-cust" style="width:${(t.customers / max) * 100}%"></i>
        <i class="tt-fill tt-clean" style="width:${(t.cleaners / max) * 100}%"></i>
      </span>
      <span class="tt-count">${t.total}<span class="tt-split">${t.customers}c · ${t.cleaners}m</span></span>
    </li>`).join('');
  return `<div class="panel-card">
    <h3 class="tt-head">Top towns <span class="muted tt-sub">signups, last ${d.days} days</span></h3>
    <div class="sg-legend tt-legend">
      <span class="sg-key"><i class="tt-cust"></i>Customers</span>
      <span class="sg-key"><i class="tt-clean"></i>Cleaners</span>
    </div>
    <ol class="tt-list">${rows}</ol>
  </div>`;
}

function chartHTML(series) {
  const max = Math.max(1, ...series.map((r) => r.customers + r.cleaners));
  // Always leave headroom above the tallest column: the peak label sits inside
  // the plot box (the scroll container clips anything above it), so a bar that
  // reached 100% would push its own label out of view.
  let top = max <= 8 ? max + 1 : Math.ceil(max / 4) * 4;
  if (top <= max) top = max + 1;
  const ticks = [top, Math.round(top / 2), 0];
  // Label only the busiest day - a number on every column is noise.
  const peak = series.reduce((best, r, i) =>
    (r.customers + r.cleaners) > (series[best] ? series[best].customers + series[best].cleaners : -1) ? i : best, 0);
  const peakTotal = series[peak] ? series[peak].customers + series[peak].cleaners : 0;

  const cols = series.map((r, i) => {
    const total = r.customers + r.cleaners;
    // Only non-zero segments render, so the 2px gap never appears on its own.
    const segs = SERIES
      .filter((s) => r[s.key] > 0)
      .map((s, idx, arr) => {
        const isTop = idx === arr.length - 1;
        return `<span class="sg-seg${isTop ? ' sg-seg-top' : ''}"
          style="height:${(r[s.key] / top) * 100}%; background:${s.color}"></span>`;
      })
      .reverse() // cleaners sit above customers in the stack
      .join('');
    // Anchored off the baseline so it rides just above its own bar, staying
    // inside the plot box rather than being clipped by the scroll container.
    const label = i === peak && peakTotal > 0
      ? `<span class="sg-peak" style="bottom:calc(${(peakTotal / top) * 100}% + 3px)">${peakTotal}</span>` : '';
    return `<div class="sg-col" data-i="${i}" tabindex="0"
      aria-label="${esc(fmtDay(r.date))}: ${r.customers} customers, ${r.cleaners} cleaners">
      ${label}<span class="sg-stack">${segs}</span></div>`;
  }).join('');

  // Roughly six x labels, whatever the range.
  const step = Math.max(1, Math.round(series.length / 6));
  const xlabels = series.map((r, i) =>
    `<span class="sg-x">${i % step === 0 ? esc(fmtDay(r.date)) : ''}</span>`).join('');

  return `
    <div class="sg-legend">
      ${SERIES.map((s) =>
        `<span class="sg-key"><i style="background:${s.color}"></i>${s.label}</span>`).join('')}
    </div>
    <div class="sg-wrap">
      <div class="sg-yaxis">${ticks.map((t) => `<span>${t}</span>`).join('')}</div>
      <div class="sg-plot">
        <div class="sg-grid">${ticks.map(() => '<i></i>').join('')}</div>
        <div class="sg-cols">${cols}</div>
      </div>
      <div class="sg-tip" id="sgTip" hidden></div>
    </div>
    <div class="sg-xaxis"><span class="sg-xpad"></span><div class="sg-xlabels">${xlabels}</div></div>`;
}

// The table view: every value reachable without hover or colour.
function tableHTML(series) {
  const rows = series
    .filter((r) => r.customers + r.cleaners > 0)
    .reverse()
    .map((r) => `<tr><td>${esc(fmtDay(r.date))}</td><td>${r.customers}</td><td>${r.cleaners}</td>
      <td><strong>${r.customers + r.cleaners}</strong></td></tr>`)
    .join('');
  return `<div class="sg-tablewrap">
    <table class="sg-table">
      <thead><tr><th>Day</th><th>Customers</th><th>Cleaners</th><th>Total</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted">No signups in this period.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function fmtDay(iso) {
  // iso is already YYYY-MM-DD in NZ time - split it rather than letting Date
  // reinterpret it in the browser's timezone.
  const [y, m, dd] = String(iso).split('-').map(Number);
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dd} ${MON[(m || 1) - 1]}`;
}

function wireChartHover() {
  const tip = statsBody.querySelector('#sgTip');
  const wrap = statsBody.querySelector('.sg-wrap');
  if (!tip || !wrap) return;
  const show = (col) => {
    const r = (statsData.series || [])[Number(col.dataset.i)];
    if (!r) return;
    tip.innerHTML = `<strong>${esc(fmtDay(r.date))}</strong>
      ${SERIES.map((s) => `<span class="sg-tip-row"><i style="background:${s.color}"></i>${s.label}<b>${r[s.key]}</b></span>`).join('')}`;
    tip.hidden = false;
    const cr = col.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    // Keep the tip inside the card rather than letting it run off the edge.
    const x = Math.min(Math.max(cr.left - wr.left + cr.width / 2, 60), wr.width - 60);
    tip.style.left = `${x}px`;
  };
  statsBody.querySelectorAll('.sg-col').forEach((col) => {
    col.addEventListener('mouseenter', () => show(col));
    col.addEventListener('focus', () => show(col)); // keyboard gets the same
  });
  wrap.addEventListener('mouseleave', () => { tip.hidden = true; });
}

async function loadFeedback() {
  if (!feedbackBody) return;
  feedbackBody.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const res = await fetch(`/api/admin/feedback?userId=${encodeURIComponent(sessionUser.id)}`);
    if (res.status === 403) { feedbackBody.innerHTML = '<div class="panel-card"><p class="muted">Admin only.</p></div>'; return; }
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) {
      feedbackBody.innerHTML = '<div class="panel-card"><p class="muted">No feedback yet.</p></div>';
      return;
    }
    feedbackBody.innerHTML = list.map(feedbackHTML).join('');
  } catch {
    feedbackBody.innerHTML = '<div class="panel-card"><p class="muted">Could not load feedback.</p></div>';
  }
}

function feedbackHTML(f) {
  const when = f.created_at ? new Date(f.created_at).toLocaleString('en-NZ') : '';
  const from = [f.full_name, f.email].filter(Boolean).map(esc).join(' · ') || 'Anonymous';
  const role = f.role ? ` (${esc(f.role === 'cleaner' ? 'maid' : 'customer')})` : '';
  return `<div class="panel-card admin-fb">
    <p class="admin-fb-msg">${esc(f.message)}</p>
    <p class="muted admin-fb-meta">${from}${role} · ${esc(f.page || '')} · ${esc(when)}</p>
  </div>`;
}

async function load() {
  body.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const res = await fetch(`/api/admin/verifications?userId=${encodeURIComponent(sessionUser.id)}`);
    if (res.status === 403) {
      body.innerHTML = '<div class="panel-card"><p class="muted">This account isn’t set up as an admin, so it can’t review documents.</p></div>';
      return;
    }
    render(await res.json());
  } catch {
    body.innerHTML = '<div class="panel-card"><p class="muted">Could not load the review queue.</p></div>';
  }
}

function render(list) {
  setTabCount('verifications', Array.isArray(list) ? list.length : 0);
  if (!Array.isArray(list) || !list.length) {
    body.innerHTML = '<div class="panel-card"><p class="muted">Nothing waiting for review right now. 🎉</p></div>';
    return;
  }
  body.innerHTML = list.map(cardHTML).join('');
  body.querySelectorAll('[data-decide]').forEach((b) =>
    b.addEventListener('click', () => decide(b, b.dataset.id, b.dataset.decide))
  );
  body.querySelectorAll('[data-openfile]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const v = list.find((x) => String(x.id) === el.dataset.id);
      if (v) viewStoredFile(el.dataset.openfile === 'selfie' ? v.selfieUrl : v.documentUrl);
    })
  );
}

function cardHTML(v) {
  const isImg = /^data:image\//.test(v.documentUrl || '');
  const isPdf = /^data:application\/pdf/.test(v.documentUrl || '');
  // Everything renders inline - image thumbnail, or an embedded PDF viewer -
  // with "view full size" opening the same blob in the browser's own viewer.
  // No link ever points at a downloadable file.
  const doc = !v.documentUrl
    ? '<span class="muted">No file attached</span>'
    : isImg
      ? `<a class="admin-doc-open" data-openfile="doc" data-id="${v.id}" title="View full size">
           <img class="admin-doc" src="${v.documentUrl}" alt="Uploaded document" /></a>`
      : isPdf
        ? `<div class="admin-doc-pdf">
             <iframe class="admin-doc-frame" src="${toBlobUrl(v.documentUrl)}" title="Uploaded document"></iframe>
             <button type="button" class="btn outline sm" data-openfile="doc" data-id="${v.id}">View full size</button>
           </div>`
        : `<button type="button" class="btn outline sm" data-openfile="doc" data-id="${v.id}">View document</button>`;
  // ID checks carry a selfie: show it beside the document so the reviewer can
  // compare the face against the photo without opening two tabs.
  const selfie = v.selfieUrl
    ? `<figure class="admin-selfie"><a class="admin-doc-open" data-openfile="selfie" data-id="${v.id}" title="View full size"><img class="admin-doc" src="${v.selfieUrl}" alt="Selfie" /></a><figcaption>Selfie</figcaption></figure>`
    : v.type === 'id'
      ? '<p class="admin-noselfie muted">No selfie submitted</p>'
      : '';
  const rate = v.rateMin != null
    ? (v.rateMax && v.rateMax !== v.rateMin ? `$${v.rateMin}–$${v.rateMax}/hr` : `$${v.rateMin}/hr`)
    : '';
  const areas = Array.isArray(v.areas) && v.areas.length ? v.areas.join(', ') : '';
  // Details to check the document against - legal name first, it's what an ID shows.
  const info = [
    ['Legal name', v.fullName],
    ['Based in', v.residentialAddress],
    ['Business', v.businessName],
    ['Email', v.email],
    ['Phone', v.phone],
    ['Rate', rate],
    ['Experience', v.years != null ? `${v.years} yr${v.years === 1 ? '' : 's'}` : ''],
    ['Works', areas],
    ['Joined', v.joined],
  ].filter(([, val]) => val);
  const details = `<dl class="admin-vdetails">${info
    .map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`)
    .join('')}</dl>`;
  return `<div class="panel-card admin-vrow" id="v-${v.id}">
    <div class="admin-vinfo">
      <strong>${esc(v.cleaner)}</strong> · ${esc(TYPE_LBL[v.type] || v.type)}
      <span class="muted">Uploaded ${esc(v.when)}</span>
      ${details}
      ${v.extractedText ? `<p class="verif-read">Scanned from document: “${esc(v.extractedText)}”</p>` : ''}
      <div class="admin-vactions">
        <button class="btn solid sm" data-decide="approve" data-id="${esc(v.id)}" type="button">Approve</button>
        <button class="btn outline sm" data-decide="reject" data-id="${esc(v.id)}" type="button">Reject</button>
      </div>
    </div>
    <div class="admin-vdoc">${v.type === 'id' && v.selfieUrl ? `<figure class="admin-selfie"><span class="admin-doc-wrap">${doc}</span><figcaption>Document</figcaption></figure>` : doc}${selfie}</div>
  </div>`;
}

async function decide(btn, id, decision) {
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/verification-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: sessionUser.id, id, decision }),
    });
    if (res.ok) load();
    else btn.disabled = false;
  } catch {
    btn.disabled = false;
  }
}

// ---- Customer reviews -----------------------------------------------------
async function loadReviews() {
  if (!reviewsBody) return;
  reviewsBody.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const res = await fetch(`/api/admin/reviews?userId=${encodeURIComponent(sessionUser.id)}`);
    if (res.status === 403) { reviewsBody.innerHTML = '<div class="panel-card"><p class="muted">Admin only.</p></div>'; return; }
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) {
      reviewsBody.innerHTML = '<div class="panel-card"><p class="muted">No reviews yet.</p></div>';
      return;
    }
    reviewsBody.innerHTML = list.map(reviewHTML).join('');
    reviewsBody.querySelectorAll('[data-moderate]').forEach((b) =>
      b.addEventListener('click', () => moderateReview(b, b.dataset.id, b.dataset.moderate))
    );
  } catch {
    reviewsBody.innerHTML = '<div class="panel-card"><p class="muted">Could not load reviews.</p></div>';
  }
}

function reviewHTML(r) {
  const hidden = r.status !== 'published';
  const cats = [['Quality', r.quality], ['Value', r.value], ['Timeliness', r.timeliness],
    ['Punctuality', r.punctuality], ['Communication', r.communication]]
    .map(([k, v]) => `${k} ${Number(v).toFixed(1)}`).join(' · ');
  const again = r.wouldUseAgain ? 'Would use again' : 'Would not use again';
  const badge = hidden ? '<span class="admin-rv-hidden">Hidden</span>' : '';
  const btn = hidden
    ? `<button class="btn outline sm" data-moderate="restore" data-id="${esc(r.id)}" type="button">Restore</button>`
    : `<button class="btn outline sm" data-moderate="hide" data-id="${esc(r.id)}" type="button">Hide</button>`;
  return `<div class="panel-card admin-rv${hidden ? ' is-hidden' : ''}">
    <div class="admin-rv-head"><strong>${Number(r.overall).toFixed(1)} ★</strong> ${badge}
      <span class="muted">${esc(again)}</span></div>
    ${r.comment ? `<p class="admin-rv-msg">“${esc(r.comment)}”</p>` : '<p class="muted admin-rv-msg">No comment left.</p>'}
    <p class="muted admin-rv-cats">${esc(cats)}</p>
    <p class="muted admin-rv-meta">${esc(r.cleaner)} · from ${esc(r.client)} · ${esc(r.when)}</p>
    <div class="admin-rv-actions">${btn}</div>
  </div>`;
}

async function moderateReview(btn, id, action) {
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/review-moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: sessionUser.id, id, action }),
    });
    if (res.ok) loadReviews();
    else btn.disabled = false;
  } catch {
    btn.disabled = false;
  }
}
