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

// Which country's marketplace the board is reporting on. The two share tables
// and nothing else, so summing them would produce a number that describes no
// real market - "23 cleaners" across two countries tells you nothing about
// whether either one works. One at a time, switched here.
let adminCountry = 'NZ';
const COUNTRY_LABEL = { NZ: 'New Zealand', AU: 'Australia' };
const withAdminCountry = (url) => url + (url.includes('?') ? '&' : '?') + 'country=' + adminCountry;


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
function mountCountrySwitch() {
  const head = document.querySelector('.admin-head');
  if (!head || head.querySelector('.cc-switch')) return;
  const wrap = document.createElement('div');
  wrap.className = 'cc-switch';
  wrap.innerHTML = Object.keys(COUNTRY_LABEL)
    .map((c) => `<button type="button" class="cc-btn ${c === adminCountry ? 'active' : ''}" data-cc="${c}">${COUNTRY_LABEL[c]}</button>`)
    .join('');
  head.appendChild(wrap);
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cc]');
    if (!b || b.dataset.cc === adminCountry) return;
    adminCountry = b.dataset.cc;
    wrap.querySelectorAll('.cc-btn').forEach((x) => x.classList.toggle('active', x === b));
    // Every cached payload belongs to the country it was fetched for, so all of
    // it is thrown away rather than shown under the wrong flag.
    peopleData = null; coverageData = null; pairingsData = null; messagesData = null; refData = null;
    openThread = null;
    // Tear the Leaflet map down rather than dropping the reference: an
    // orphaned map keeps its handlers and its tiles for the old country.
    if (coverageMap) { coverageMap.remove(); coverageMap = null; }
    coverageCity = null;
    const panel = document.querySelector('.admin-panel:not([hidden])')?.dataset.panel;
    loadStats();
    // Reload whatever is on screen. Verifications and reviews hold no cache of
    // their own, so they only need re-fetching; the rest were cleared above.
    if (panel === 'people') showPeople();
    if (panel === 'coverage') showCoverage();
    if (panel === 'pairings') showPairings();
    if (panel === 'messages') showMessages();
    if (panel === 'referrals') showReferrals();
    if (panel === 'verifications') load();
    if (panel === 'reviews') loadReviews();
  });
}
document.addEventListener('DOMContentLoaded', mountCountrySwitch);
if (document.readyState !== 'loading') mountCountrySwitch();

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
  if (btn.dataset.tab === 'people') showPeople();
  if (btn.dataset.tab === 'pairings') showPairings();
  if (btn.dataset.tab === 'messages') showMessages();
  if (btn.dataset.tab === 'referrals') showReferrals();
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

// ---------- Pairings: the marketplace's own scoreboard ----------
// Signups measure arrival. This measures the thing people arrived for: a
// customer and a cleaner finding each other, agreeing a date, and a house
// getting cleaned. It is the one board where a number going up means the
// business worked rather than that a page was visited.
const pairingsBody = document.getElementById('pairingsBody');
let pairingsData = null;

async function showPairings() {
  if (!pairingsBody) return;
  if (pairingsData) { renderPairings(); return; }
  pairingsBody.innerHTML = '<div class="panel-card"><p class="muted">Loading…</p></div>';
  try {
    const res = await fetch(withAdminCountry(`/api/admin/pairings?userId=${encodeURIComponent(sessionUser.id)}`));
    if (res.status === 403) {
      pairingsBody.innerHTML = '<div class="panel-card"><p class="muted">Admin only.</p></div>';
      return;
    }
    if (!res.ok) throw new Error(`server returned ${res.status}`);
    pairingsData = await res.json();
    renderPairings();
  } catch (err) {
    console.error('pairings:', err);
    pairingsBody.innerHTML =
      `<div class="panel-card"><p class="muted">Could not load pairings (${esc(err.message || 'network error')}).
       <button class="btn ghost sm" type="button" data-pair-retry>Retry</button></p></div>`;
    pairingsBody.querySelector('[data-pair-retry]')?.addEventListener('click', showPairings);
  }
}

const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

// One card per relationship. Booked pairs lead, because they are the point;
// the ones still talking sit underneath as the pipeline behind them.
function pairingCard(p) {
  const repeat = p.bookings > 1 ? `<span class="pr-repeat">×${p.bookings} booked</span>` : '';
  const speed = p.daysToBook == null ? ''
    : `<span class="pr-fact">agreed a date in ${p.daysToBook < 1 ? 'under a day' : `${p.daysToBook} day${p.daysToBook === 1 ? '' : 's'}`}</span>`;
  const quote = p.review
    ? `<blockquote class="pr-quote">
         <span class="pr-stars" aria-label="${p.review.overall} out of 5">${stars(p.review.overall)}</span>
         ${p.review.comment ? `<p>“${esc(p.review.comment)}”</p>` : ''}
         <cite>${esc(p.customer)}, ${p.review.when}</cite>
       </blockquote>`
    : '';
  return `<article class="pr-card ${p.booked ? 'won' : 'talking'}">
    <div class="pr-head">
      <h4>${esc(p.cleaner)} <span class="pr-amp">&amp;</span> ${esc(p.customer)}</h4>
      ${p.booked ? `<span class="status status-accepted">Booked</span>${repeat}` : '<span class="status status-new">Talking</span>'}
    </div>
    <p class="pr-facts">
      ${p.suburb ? `<span class="pr-fact">${esc(p.suburb)}</span>` : ''}
      ${p.service ? `<span class="pr-fact">${esc(p.service)}</span>` : ''}
      <span class="pr-fact">matched ${esc(p.firstMatched)}</span>
      ${speed}
      ${p.cleans ? `<span class="pr-fact">${p.cleans} clean${p.cleans === 1 ? '' : 's'} done</span>` : ''}
      ${p.latestClean ? `<span class="pr-fact">latest ${esc(p.latestClean)}</span>` : ''}
    </p>
    ${quote}
  </article>`;
}

function renderPairings() {
  const d = pairingsData;
  if (!d || !pairingsBody) return;
  const f = d.funnel || {};
  const won = d.pairings.filter((p) => p.booked);
  const repeats = won.filter((p) => p.bookings > 1).length;
  // The headline is a count of relationships, not of enquiries: two people who
  // have booked four times are one pairing, and the fourth booking shows up in
  // the repeat rate rather than inflating the top line.
  const rate = f.matched ? Math.round((f.booked / f.matched) * 100) : 0;

  const hero = `<div class="panel-card pr-hero">
    <div class="pr-hero-num">
      <strong>${won.length.toLocaleString()}</strong>
      <span>successful pairing${won.length === 1 ? '' : 's'}</span>
    </div>
    <dl class="pr-hero-side">
      <div><dt>Cleans booked</dt><dd>${(f.booked || 0).toLocaleString()}</dd></div>
      <div><dt>Cleans done</dt><dd>${(f.cleaned || 0).toLocaleString()}</dd></div>
      <div><dt>Booked again</dt><dd>${repeats.toLocaleString()}</dd></div>
      <div><dt>Enquiry → booking</dt><dd>${rate}%</dd></div>
    </dl>
  </div>`;

  const stages = [
    { label: 'Enquiry sent', value: f.matched || 0 },
    { label: 'Cleaner replied', value: f.talking || 0 },
    { label: 'Date on the table', value: f.dated || 0 },
    { label: 'Date confirmed — booked', value: f.booked || 0 },
    { label: 'Clean done', value: f.cleaned || 0 },
  ];
  const funnel = `<div class="panel-card adv-card">
    <h3 class="adv-head">From enquiry to a clean</h3>
    <div class="pr-funnel">${funnelSideHTML('', stages, 0, 'enquiries')}</div>
    ${f.declined ? `<p class="fn-note muted">${f.declined} enquir${f.declined === 1 ? 'y was' : 'ies were'} turned down by the cleaner.</p>` : ''}
  </div>`;

  // Said plainly rather than quietly dropped: "0 pairings" reads very
  // differently once you know your own test traffic was taken out of it.
  const excluded = d.selfExcluded
    ? `<p class="fn-note muted">Excludes ${d.selfExcluded} enquir${d.selfExcluded === 1 ? 'y' : 'ies'} involving your own account.</p>`
    : '';

  const list = d.pairings.length
    ? `<div class="pr-list">${d.pairings.map(pairingCard).join('')}</div>`
    : `<div class="panel-card"><p class="muted">No pairings yet. The first customer to agree a date with a cleaner lands here.</p>${excluded}</div>`;


  pairingsBody.innerHTML =
    hero + funnel + list + (d.pairings.length && excluded ? `<div class="panel-card">${excluded}</div>` : '');
}

// ---------- Messages: the threads, and which ones have gone quiet ----------
// Pairings is the scoreboard; this is the tape. It exists to answer one
// question quickly - "did that enquiry actually reach someone, and did they do
// anything about it" - so the sort is by whatever moved last and the filters
// are the three ways a thread goes wrong, not a generic search box.
const messagesBody = document.getElementById('messagesBody');
let messagesData = null, messagesFilter = 'all', messagesQuery = '', openThread = null;

async function showMessages() {
  if (!messagesBody) return;
  if (messagesData) { renderMessages(); return; }
  messagesBody.innerHTML = '<div class="panel-card"><p class="muted">Loading…</p></div>';
  try {
    const res = await fetch(withAdminCountry(`/api/admin/conversations?userId=${encodeURIComponent(sessionUser.id)}`));
    if (res.status === 403) {
      messagesBody.innerHTML = '<div class="panel-card"><p class="muted">Admin only.</p></div>';
      return;
    }
    if (!res.ok) throw new Error(`server returned ${res.status}`);
    messagesData = await res.json();
    renderMessages();
  } catch (err) {
    console.error('conversations:', err);
    messagesBody.innerHTML =
      `<div class="panel-card"><p class="muted">Could not load conversations (${esc(err.message || 'network error')}).
       <button class="btn ghost sm" type="button" data-msg-retry>Retry</button></p></div>`;
    messagesBody.querySelector('[data-msg-retry]')?.addEventListener('click', () => { messagesData = null; showMessages(); });
  }
}

// "3 days" is the unit that matters here - an enquiry answered in four hours
// and one answered in four minutes are the same good outcome, and one left for
// a week is the only thing worth a second look.
function ago(iso) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// What the thread needs, in one phrase, ranked worst first. Only one shows:
// a thread that is both unopened and a week old is not two problems.
function threadState(t) {
  if (!t.cleanerReplied && t.neverOpened) return { cls: 'bad', label: t.waitingDays >= 1 ? `Never opened · ${t.waitingDays}d` : 'Never opened' };
  if (!t.cleanerReplied && t.awaiting === 'cleaner') return { cls: 'warn', label: t.waitingDays >= 1 ? `No reply · ${t.waitingDays}d` : 'Read, no reply yet' };
  if (t.awaiting === 'cleaner') return { cls: 'warn', label: `Cleaner's turn · ${t.waitingDays}d` };
  if (t.awaiting === 'customer') return { cls: 'ok', label: `Customer's turn · ${t.waitingDays}d` };
  return { cls: 'ok', label: 'Talking' };
}

function messageRow(m) {
  // The two date actions are posted as messages but read as events, so they are
  // rendered as events - quoting "date_proposal" back as if someone typed it
  // would make the transcript a worse record than the portal it mirrors.
  if (m.kind !== 'text') {
    const what = m.kind === 'date_proposal' ? 'proposed a date'
      : m.kind === 'date_confirmed' ? 'confirmed the date'
      : m.kind.replace(/_/g, ' ');
    return `<p class="mt-event">${m.from === 'cleaner' ? 'Cleaner' : 'Customer'} ${esc(what)} · ${esc(stamp(m.sentAt))}</p>`;
  }
  return `<div class="mt-msg ${m.from}">
    <p class="mt-body">${esc(m.body)}</p>
    <p class="mt-meta">${esc(stamp(m.sentAt))}${m.readAt ? ` · read ${esc(stamp(m.readAt))}` : ' · unread'}</p>
  </div>`;
}

function threadCard(t) {
  const st = threadState(t);
  const open = openThread === t.id;
  const words = t.messages.filter((m) => m.kind === 'text').length;
  const transcript = open
    ? `<div class="mt-thread">
         ${t.messages.length ? t.messages.map(messageRow).join('') : '<p class="muted">The enquiry was opened but nothing was ever written.</p>'}
         <p class="mt-legend muted">Customer left, cleaner right. Started ${esc(stamp(t.startedAt))}${t.lastNotifiedAt ? ` · last reply email sent ${esc(stamp(t.lastNotifiedAt))}` : ''}</p>
       </div>`
    : '';
  return `<article class="mt-card ${st.cls}${open ? ' open' : ''}" data-thread="${esc(t.id)}">
    <button class="mt-head" type="button" data-thread-toggle="${esc(t.id)}" aria-expanded="${open}">
      <span class="mt-who">
        <strong>${esc(t.customer)}</strong> <span class="pr-amp">&rarr;</span> <strong>${esc(t.cleaner)}</strong>
        ${t.isSelf ? '<span class="mt-tag">your own account</span>' : ''}
      </span>
      <span class="mt-state ${st.cls}">${esc(st.label)}</span>
    </button>
    <p class="mt-facts">
      ${t.suburb ? `<span class="pr-fact">${esc(t.suburb)}</span>` : ''}
      ${t.service ? `<span class="pr-fact">${esc(t.service)}</span>` : ''}
      <span class="pr-fact">${words} message${words === 1 ? '' : 's'}</span>
      <span class="pr-fact">last ${esc(ago(t.lastMessageAt || t.startedAt))}</span>
      ${t.unreadByCleaner ? `<span class="pr-fact">${t.unreadByCleaner} unread by cleaner</span>` : ''}
    </p>
    ${open ? '' : `<p class="mt-peek muted">${esc((t.messages.find((m) => m.kind === 'text')?.body || '').slice(0, 160))}</p>`}
    ${transcript}
  </article>`;
}

function renderMessages() {
  const d = messagesData;
  if (!d || !messagesBody) return;
  const tot = d.totals || {};

  const chips = [
    ['all', 'All', d.threads.length],
    ['awaiting', 'Cleaner’s turn', tot.awaitingCleaner || 0],
    ['unopened', 'Never opened', tot.neverOpened || 0],
    ['stuck', 'Stuck', tot.stuck || 0],
  ];

  const q = messagesQuery.trim().toLowerCase();
  const list = d.threads.filter((t) => {
    if (messagesFilter === 'awaiting' && t.awaiting !== 'cleaner') return false;
    if (messagesFilter === 'unopened' && !t.neverOpened) return false;
    if (messagesFilter === 'stuck' && !(!t.cleanerReplied && t.awaiting === 'cleaner' && t.waitingDays >= 1)) return false;
    if (!q) return true;
    return [t.customer, t.cleaner, t.customerEmail, t.cleanerEmail, t.suburb]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  });

  const hero = `<div class="panel-card pr-hero">
    <div class="pr-hero-num">
      <strong>${(tot.threads || 0).toLocaleString()}</strong>
      <span>conversation${tot.threads === 1 ? '' : 's'}</span>
    </div>
    <dl class="pr-hero-side">
      <div><dt>Cleaner’s turn</dt><dd>${(tot.awaitingCleaner || 0).toLocaleString()}</dd></div>
      <div><dt>Never opened</dt><dd>${(tot.neverOpened || 0).toLocaleString()}</dd></div>
      <div><dt>Stuck a day+</dt><dd>${(tot.stuck || 0).toLocaleString()}</dd></div>
    </dl>
  </div>`;

  const controls = `<div class="panel-card mt-controls">
    <div class="mt-chips">${chips.map(([k, label, n]) =>
      `<button type="button" class="mt-chip ${messagesFilter === k ? 'active' : ''}" data-msg-filter="${k}">${label}${n ? ` <span class="mt-chip-n">${n}</span>` : ''}</button>`).join('')}</div>
    <input class="mt-search" type="search" placeholder="Search a name, email or suburb" value="${esc(messagesQuery)}" data-msg-search />
  </div>`;

  // Said out loud rather than quietly filtered, same as the pairings board:
  // the totals above exclude your own test threads, but the list still shows
  // them, tagged - they are usually the ones you came here to check.
  const note = tot.selfTest
    ? `<p class="fn-note muted">The counts above leave out ${tot.selfTest} thread${tot.selfTest === 1 ? '' : 's'} involving your own account. ${tot.selfTest === 1 ? 'It is' : 'They are'} still listed below, tagged.</p>`
    : '';

  const body = list.length
    ? `<div class="mt-list">${list.map(threadCard).join('')}</div>`
    : `<div class="panel-card"><p class="muted">${d.threads.length ? 'No conversation matches that filter.' : 'No conversations yet. The first enquiry a customer sends lands here.'}</p></div>`;

  messagesBody.innerHTML = hero + controls + (note ? `<div class="panel-card">${note}</div>` : '') + body;

  messagesBody.querySelectorAll('[data-msg-filter]').forEach((b) =>
    b.addEventListener('click', () => { messagesFilter = b.dataset.msgFilter; renderMessages(); }));
  const search = messagesBody.querySelector('[data-msg-search]');
  search?.addEventListener('input', () => {
    messagesQuery = search.value;
    const at = search.selectionStart;
    renderMessages();
    // Re-rendering replaces the input, so the caret is put back where it was -
    // otherwise typing a second character jumps to the end of the field.
    const next = messagesBody.querySelector('[data-msg-search]');
    next?.focus();
    try { next?.setSelectionRange(at, at); } catch {}
  });
  messagesBody.querySelectorAll('[data-thread-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      // One open at a time: these are read one after another, and a page of
      // expanded transcripts is a worse way to find the next problem.
      openThread = openThread === b.dataset.threadToggle ? null : b.dataset.threadToggle;
      renderMessages();
      if (openThread) messagesBody.querySelector(`[data-thread="${openThread}"]`)?.scrollIntoView({ block: 'nearest' });
    }));
}

// ---------- Referrals: who is bringing people, and who looks like they aren't ----------
// The scheme is deliberately permissive - a cleaner bringing a customer they
// already clean for is the point of it, and that is the same shape as a made-up
// referral. So nothing here is blocked and nothing is accused. It ranks by how
// many odd things stack up on one person and shows the reasons, so a human can
// look at four in a row and decide.
const refBody = document.getElementById('referralsBody');
let refData = null, refOnlyFlagged = false;

async function showReferrals() {
  if (!refBody) return;
  if (refData) { renderReferrals(); return; }
  refBody.innerHTML = '<div class="panel-card"><p class="muted">Loading…</p></div>';
  try {
    const res = await fetch(withAdminCountry(`/api/admin/referrals?userId=${encodeURIComponent(sessionUser.id)}`));
    if (res.status === 403) {
      refBody.innerHTML = '<div class="panel-card"><p class="muted">Admin only.</p></div>';
      return;
    }
    if (!res.ok) throw new Error(`server returned ${res.status}`);
    refData = await res.json();
    renderReferrals();
  } catch (err) {
    console.error('referrals:', err);
    refBody.innerHTML =
      `<div class="panel-card"><p class="muted">Could not load referrals (${esc(err.message || 'network error')}).
       <button class="btn ghost sm" type="button" data-ref-retry>Retry</button></p></div>`;
    refBody.querySelector('[data-ref-retry]')?.addEventListener('click', () => { refData = null; showReferrals(); });
  }
}

// Three bands, named for what to do rather than for a number: most referrals are
// fine, a few are worth a glance, and a couple are worth actually checking.
function riskBand(risk) {
  if (risk >= 7) return { cls: 'bad', label: 'Worth checking' };
  if (risk >= 4) return { cls: 'warn', label: 'Worth a glance' };
  return { cls: 'ok', label: 'Looks ordinary' };
}

function refRow(r) {
  const band = riskBand(r.risk);
  const flags = r.flags.length
    ? `<ul class="rf-flags">${r.flags.map((f) => `<li>${esc(f.why)}</li>`).join('')}</ul>`
    : '';
  return `<article class="rf-card ${band.cls}">
    <div class="rf-head">
      <span class="rf-who">
        <strong>${esc(r.referee)}</strong>
        <span class="ref-kind">${r.kind}</span>
        <span class="pr-amp">via</span> <strong>${esc(r.referrer)}</strong>
      </span>
      <span class="mt-state ${band.cls}">${esc(band.label)}</span>
    </div>
    <p class="mt-facts">
      <span class="pr-fact">${esc(r.refereeEmail || '')}</span>
      ${r.credited ? `<span class="pr-fact">$${r.creditDollars} credited</span>` : '<span class="pr-fact">not credited yet</span>'}
    </p>
    ${flags}
  </article>`;
}

function renderReferrals() {
  const d = refData;
  if (!d || !refBody) return;

  if (!d.referrals.length) {
    refBody.innerHTML = '<div class="panel-card"><p class="muted">No referrals yet. The first cleaner to bring someone lands here.</p></div>';
    return;
  }

  const credited = d.referrals.filter((r) => r.credited);
  const owed = credited.reduce((a, r) => a + r.creditDollars, 0);

  const hero = `<div class="panel-card pr-hero">
    <div class="pr-hero-num">
      <strong>${d.referrals.length.toLocaleString()}</strong>
      <span>referral${d.referrals.length === 1 ? '' : 's'}</span>
    </div>
    <dl class="pr-hero-side">
      <div><dt>Credited</dt><dd>${credited.length.toLocaleString()}</dd></div>
      <div><dt>Credit owed</dt><dd>$${owed.toLocaleString()}</dd></div>
      <div><dt>Worth a look</dt><dd>${(d.flagged || 0).toLocaleString()}</dd></div>
    </dl>
  </div>`;

  // The per-cleaner rollup first: one odd referral is noise, four from one
  // person is the thing actually worth opening.
  const cleaners = d.cleaners.filter((c) => c.flagged || c.burst);
  const rollup = cleaners.length
    ? `<div class="panel-card">
        <h3 class="adv-head">Cleaners worth a look</h3>
        <p class="fn-note muted">Ranked by how much stacks up, not by how many referrals they have made.</p>
        <div class="ref-list">${cleaners.map((c) => `<div class="ref-row">
          <span>${esc(c.referrer)} <span class="ref-kind">${c.customers} customer${c.customers === 1 ? '' : 's'}</span></span>
          <span class="mt-state ${c.risk >= 7 ? 'bad' : 'warn'}">${c.flagged} flagged${c.burst ? ' · signed up in a burst' : ''}</span>
        </div>`).join('')}</div>
      </div>`
    : '';

  const list = (refOnlyFlagged ? d.referrals.filter((r) => r.risk >= 4) : d.referrals);
  const controls = `<div class="panel-card mt-controls">
    <div class="mt-chips">
      <button type="button" class="mt-chip ${refOnlyFlagged ? '' : 'active'}" data-ref-filter="all">All${d.referrals.length ? ` <span class="mt-chip-n">${d.referrals.length}</span>` : ''}</button>
      <button type="button" class="mt-chip ${refOnlyFlagged ? 'active' : ''}" data-ref-filter="flagged">Worth a look${d.flagged ? ` <span class="mt-chip-n">${d.flagged}</span>` : ''}</button>
    </div>
  </div>`;

  // Said plainly, because a page of red boxes invites the wrong conclusion.
  const caveat = `<div class="panel-card"><p class="fn-note muted">Every flag here has an innocent
    explanation on its own &mdash; a cleaner’s regular customer really might book the day they join,
    and really might only ever book with them. Nothing is blocked. What is worth opening is several
    flags stacking on the same cleaner.</p></div>`;

  refBody.innerHTML = hero + rollup + controls +
    (list.length ? `<div class="mt-list">${list.map(refRow).join('')}</div>`
                 : '<div class="panel-card"><p class="muted">Nothing flagged. Everything looks ordinary.</p></div>') +
    caveat;

  refBody.querySelectorAll('[data-ref-filter]').forEach((b) =>
    b.addEventListener('click', () => { refOnlyFlagged = b.dataset.refFilter === 'flagged'; renderReferrals(); }));
}

// ---------- People: the register ----------
const peopleBody = document.getElementById('peopleBody');
let peopleData = null, peopleFilter = 'all', peopleQuery = '';

async function showPeople() {
  if (!peopleBody) return;
  if (peopleData) { renderPeople(); return; }
  peopleBody.innerHTML = '<div class="panel-card"><p class="muted">Loading…</p></div>';
  try {
    const res = await fetch(withAdminCountry(`/api/admin/users?userId=${encodeURIComponent(sessionUser.id)}`));
    if (res.status === 403) {
      peopleBody.innerHTML = '<div class="panel-card"><p class="muted">Admin only.</p></div>';
      return;
    }
    if (!res.ok) throw new Error(`server returned ${res.status}`);
    peopleData = await res.json();
    renderPeople();
  } catch (err) {
    console.error('people:', err);
    peopleBody.innerHTML =
      `<div class="panel-card"><p class="muted">Could not load the register (${esc(err.message || 'network error')}).
       <button class="btn ghost sm" type="button" data-people-retry>Retry</button></p></div>`;
    peopleBody.querySelector('[data-people-retry]')?.addEventListener('click', showPeople);
  }
}

const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`;
};

// What is still missing for this person, as short chips. The register doubles as
// a to-do list this way - "who has signed up" and "who needs chasing" are the
// same question at this size.
function gapChips(p) {
  const gaps = [];
  if (!p.verified) gaps.push('email unconfirmed');
  if (p.role === 'cleaner') {
    if (!p.hasRate) gaps.push('no rate');
    if (!p.slots) gaps.push('no hours');
    if (!p.areas) gaps.push('no areas');
    if (!p.badges.id) gaps.push('no ID');
    if (p.listing && p.listing !== 'active') gaps.push(p.listing);
  } else {
    if (!p.suburb) gaps.push('no suburb');
  }
  return gaps.map((g) => `<span class="pp-gap">${esc(g)}</span>`).join('');
}

function renderPeople() {
  const d = peopleData;
  if (!d || !peopleBody) return;
  const q = peopleQuery.trim().toLowerCase();
  const all = d.users || [];
  const rows = all.filter((p) => {
    if (peopleFilter === 'cleaner' && p.role !== 'cleaner') return false;
    if (peopleFilter === 'client' && p.role !== 'client') return false;
    if (!q) return true;
    return [p.name, p.email, p.business, p.suburb, p.source].some((v) => v && String(v).toLowerCase().includes(q));
  });
  const counts = {
    all: all.length,
    cleaner: all.filter((p) => p.role === 'cleaner').length,
    client: all.filter((p) => p.role === 'client').length,
  };

  peopleBody.innerHTML = `
    <div class="panel-card">
      <div class="sg-controls">
        ${[['all', 'Everyone'], ['cleaner', 'Cleaners'], ['client', 'Customers']].map(([k, label]) =>
          `<button class="chip select ${k === peopleFilter ? 'on' : ''}" type="button" data-pf="${k}">${label} <span class="muted">${counts[k]}</span></button>`
        ).join('')}
        <input class="pp-search" type="search" id="ppSearch" placeholder="Search name, email, suburb…" value="${esc(peopleQuery)}" />
        <button class="btn ghost sm" type="button" data-copy-emails>Copy ${rows.length} email${rows.length === 1 ? '' : 's'}</button>
      </div>
      <div class="sg-tablewrap">
        <table class="sg-table pp-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>From</th><th>Still missing</th></tr></thead>
          <tbody>${rows.map((p) => `
            <tr class="${p.removed ? 'pp-removed' : ''}">
              <td>
                <strong>${esc(p.name || '(no name)')}</strong>
                ${p.business ? `<span class="pp-biz">${esc(p.business)}</span>` : ''}
                ${p.email.toLowerCase() === (d.adminEmail || '') ? '<span class="pp-you">you</span>' : ''}
                ${p.removed ? '<span class="pp-gap">removed</span>' : ''}
              </td>
              <td><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></td>
              <td>${p.role === 'cleaner' ? 'Cleaner' : 'Customer'}</td>
              <td class="pp-nowrap">${fmtDate(p.joined)}</td>
              <td>${p.source ? esc(p.source) : '<span class="muted">unknown</span>'}</td>
              <td>${gapChips(p) || '<span class="pp-ok">nothing</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${rows.length ? '' : '<p class="muted" style="margin-top:1rem">Nobody matches that.</p>'}
    </div>`;

  peopleBody.querySelectorAll('[data-pf]').forEach((b) =>
    b.addEventListener('click', () => { peopleFilter = b.dataset.pf; renderPeople(); })
  );
  const search = peopleBody.querySelector('#ppSearch');
  search?.addEventListener('input', () => {
    peopleQuery = search.value;
    renderPeople();
    // Re-rendering blows away focus and the caret, which makes typing
    // impossible - put both back where they were.
    const again = peopleBody.querySelector('#ppSearch');
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  });
  peopleBody.querySelector('[data-copy-emails]')?.addEventListener('click', (e) => {
    const list = rows.map((p) => p.email).join(', ');
    navigator.clipboard?.writeText(list).then(
      () => { e.target.textContent = 'Copied'; setTimeout(() => renderPeople(), 1200); },
      () => { e.target.textContent = 'Copy failed'; }
    );
  });
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
    const res = await fetch(withAdminCountry(`/api/admin/coverage?userId=${encodeURIComponent(sessionUser.id)}`));
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
  // Wheel zoom only while the pointer is over the map - see map-gestures.js.
  if (window.mmHoverZoom) mmHoverZoom(map, mount);
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
      withAdminCountry(`/api/admin/stats?userId=${encodeURIComponent(sessionUser.id)}&days=${statsRange}`)
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
      <p class="muted stats-note">Your own accounts are left out of every number here, and off the
        coverage map - they are test data, not market signal.</p>
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
function funnelSideHTML(title, stages, removed, ofLabel = 'signups') {
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
        <span class="muted">${pctTop}% of ${esc(ofLabel)}</span>
        ${pctStep == null
          ? '<span class="muted">—</span>'
          : `<span class="${drop > 0 ? 'fn-drop' : 'muted'}">${pctStep}% of previous${drop > 0 ? ` · lost ${drop}` : ''}</span>`}
      </div>
    </li>`;
  });
  return `<div class="fn-side">
    ${title ? `<h4 class="adv-group-title">${esc(title)}</h4>` : ''}
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

// Two aligned panels, one x-axis, a scale each.
//
// Deliberately NOT one chart with two y-axes. A running total and a daily count
// sit on completely different scales - by day thirty the cumulative line is an
// order of magnitude above the daily one - so overlaying them means choosing
// two scales by hand until the lines look related. Whatever shape that makes is
// an artefact of the scales picked, and readers take the crossings and the gaps
// between them for findings. Stacked panels keep every real comparison (the two
// series against each other, any day against any other day) and drop only the
// false one.
//
// Cumulative on top because it answers the first question - how big is this
// network - with new-per-day underneath as the texture behind that line.
function chartHTML(series) {
  if (!series.length) return '<p class="muted">No signups in this range.</p>';

  // Running totals start from everyone who already existed rather than from
  // zero, or changing the range would redraw history.
  const prior = statsData.prior || { customers: 0, cleaners: 0 };
  let cc = Number(prior.customers) || 0;
  let kk = Number(prior.cleaners) || 0;
  const cum = series.map((r) => {
    cc += r.customers;
    kk += r.cleaners;
    return { date: r.date, customers: cc, cleaners: kk };
  });

  return `
    <div class="sg-legend">
      ${SERIES.map((s) => `<span class="sg-key"><i style="background:${s.color}"></i>${s.label}</span>`).join('')}
    </div>
    ${panelHTML(cum, 'Total on the platform', 'cum')}
    ${panelHTML(series, 'New signups per day', 'new')}
    <div class="sg-xaxis"><span class="sg-xpad"></span><div class="sg-xlabels">${xLabelsHTML(series)}</div></div>
    <div class="sg-tip" id="sgTip" hidden></div>`;
}

// A "nice" top for an axis: the smallest round number above the data, so ticks
// land on values a reader can hold (5, 10, 20, 50) rather than 37.
function niceTop(max) {
  if (max <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= max) return m * pow;
  }
  return 10 * pow;
}

function panelHTML(rows, title, kind) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.customers, r.cleaners)));
  const top = niceTop(max);
  const ticks = [top, top / 2, 0];
  const n = rows.length;
  // One point would divide by zero; put it in the middle instead.
  const xAt = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const yAt = (v) => 100 - (v / top) * 100;

  const lines = SERIES.map((sr) => {
    const pts = rows.map((r, i) => `${xAt(i)},${yAt(r[sr.key])}`).join(' ');
    // Markers only when there is room. On a 90-day range a dot per day is a
    // solid bar rather than a series of points.
    const dots = n <= 31
      ? rows.map((r, i) =>
        `<circle cx="${xAt(i)}" cy="${yAt(r[sr.key])}" r="1.1" fill="${sr.color}" stroke="var(--paper)" stroke-width="0.7" vector-effect="non-scaling-stroke" />`).join('')
      : '';
    return `<polyline points="${pts}" fill="none" stroke="${sr.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />${dots}`;
  }).join('');

  // Each series' latest value, labelled on the line itself: the number a reader
  // wants first, without hovering or tracking the legend across.
  const last = rows[n - 1] || { customers: 0, cleaners: 0 };
  const endLabels = SERIES.map((sr) =>
    `<span class="sg-end" style="top:calc(${yAt(last[sr.key])}% - 0.55em); color:${sr.color}">${last[sr.key]}</span>`).join('');

  const slots = rows.map((r, i) =>
    `<span class="sg-slot" data-i="${i}" tabindex="0" aria-label="${esc(fmtDay(r.date))}: ${r.customers} customers, ${r.cleaners} cleaners"></span>`).join('');

  return `
    <div class="sg-panel">
      <p class="sg-title">${esc(title)}</p>
      <div class="sg-wrap" data-kind="${kind}">
        <div class="sg-yaxis">${ticks.map((t) => `<span>${Math.round(t)}</span>`).join('')}</div>
        <div class="sg-plot">
          <div class="sg-grid">${ticks.map(() => '<i></i>').join('')}</div>
          <svg class="sg-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
          <span class="sg-cross" hidden></span>
          <div class="sg-hit">${slots}</div>
          ${endLabels}
        </div>
      </div>
    </div>`;
}

function xLabelsHTML(series) {
  const step = Math.max(1, Math.round(series.length / 6));
  return series
    .map((r, i) => `<span class="sg-x">${i % step === 0 ? esc(fmtDay(r.date)) : ''}</span>`)
    .join('');
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

// One crosshair, both panels. Hovering a day should answer "what happened on
// this day" in full - how many joined, and what the totals reached - rather
// than making you hover twice in two places and assemble it yourself.
function wireChartHover() {
  const tip = statsBody.querySelector('#sgTip');
  const card = statsBody.querySelector('.panel-card');
  if (!tip || !card) return;
  const panels = [...statsBody.querySelectorAll('.sg-wrap')];
  if (!panels.length) return;

  const series = statsData.series || [];
  const prior = statsData.prior || { customers: 0, cleaners: 0 };
  let cc = Number(prior.customers) || 0;
  let kk = Number(prior.cleaners) || 0;
  const cum = series.map((r) => {
    cc += r.customers;
    kk += r.cleaners;
    return { customers: cc, cleaners: kk };
  });

  const show = (i, slot) => {
    const r = series[i];
    const t = cum[i];
    if (!r || !t) return;
    tip.innerHTML = `<strong>${esc(fmtDay(r.date))}</strong>` +
      SERIES.map((s) =>
        `<span class="sg-tip-row"><i style="background:${s.color}"></i>${s.label}<b>+${r[s.key]}</b><em>${t[s.key]} total</em></span>`).join('');
    tip.hidden = false;
    const sr = slot.getBoundingClientRect();
    const br = card.getBoundingClientRect();
    // Kept inside the card rather than allowed to run off its edge.
    tip.style.left = `${Math.min(Math.max(sr.left - br.left + sr.width / 2, 80), br.width - 80)}px`;
    tip.style.top = `${sr.top - br.top - 8}px`;
    // The same day is marked in BOTH panels, so the eye can read one against
    // the other - which is the whole reason they are stacked and aligned.
    panels.forEach((p) => {
      const cross = p.querySelector('.sg-cross');
      const target = p.querySelectorAll('.sg-slot')[i];
      const plot = p.querySelector('.sg-plot');
      if (!cross || !target || !plot) return;
      const pr = plot.getBoundingClientRect();
      const tr = target.getBoundingClientRect();
      cross.style.left = `${tr.left - pr.left + tr.width / 2}px`;
      cross.hidden = false;
    });
  };

  const hide = () => {
    tip.hidden = true;
    panels.forEach((p) => {
      const c = p.querySelector('.sg-cross');
      if (c) c.hidden = true;
    });
  };

  panels.forEach((p) => {
    p.querySelectorAll('.sg-slot').forEach((slot) => {
      const i = Number(slot.dataset.i);
      slot.addEventListener('mouseenter', () => show(i, slot));
      slot.addEventListener('focus', () => show(i, slot)); // keyboard gets the same
    });
    p.addEventListener('mouseleave', hide);
  });
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
    const res = await fetch(withAdminCountry(`/api/admin/verifications?userId=${encodeURIComponent(sessionUser.id)}`));
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
    const res = await fetch(withAdminCountry(`/api/admin/reviews?userId=${encodeURIComponent(sessionUser.id)}`));
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
