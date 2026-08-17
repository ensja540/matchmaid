// Public, ungated cleaner browse - now backed by the real /api/match endpoint.
// Signup only appears at the "Contact" peak (or the always-present hook).
const { DAYS, SLOTS } = DEMO;

// Service label lookup (+ a couple of extras not in the seed catalogue).
const SVC_NAME = { windows: 'Windows' };
DEMO.services.forEach((s) => (SVC_NAME[s.slug] = s.name));

const suburbSel = document.getElementById('suburb');
const serviceSel = document.getElementById('service');
const hoursSel = document.getElementById('hours');
const rateEl = document.getElementById('rate');
const rateOut = document.getElementById('rateOut');
const extrasBox = document.getElementById('extras');
const verifBox = document.getElementById('verif');
const productsBox = document.getElementById('products');
const cal = document.getElementById('cal');
const results = document.getElementById('results');
const meta = document.getElementById('meta');

const slots = []; // chosen availability {day, slot}
let lastResults = [];
let lastPrefs = null;
let sortBy = 'relevance';
document.getElementById('sf-year').textContent = new Date().getFullYear();
document.getElementById('sortBy')?.addEventListener('change', (e) => {
  sortBy = e.target.value;
  paintResults();
});

// Type of clean + hours from the shared catalogue (matches the DB slugs).
serviceSel.innerHTML = DEMO.services.map((s) => `<option value="${s.slug}">${s.name}</option>`).join('');
hoursSel.innerHTML = [
  { h: 1, l: '1 hour' }, { h: 2, l: '2 hours' }, { h: 3, l: '3 hours' }, { h: 4, l: 'Half day (4h)' },
].map((o) => `<option value="${o.h}" ${o.h === 2 ? 'selected' : ''}>${o.l}</option>`).join('');

// Location selector: cities with a "(all)" option and their suburbs; default
// Christchurch (all).
function locationOptions(sel) {
  return Object.entries(DEMO.towns)
    .map(([town, subs]) =>
      `<optgroup label="${town}"><option value="town:${town}" ${sel === 'town:' + town ? 'selected' : ''}>${town} (all)</option>${subs
        .map((s) => `<option value="${s}" ${sel === s ? 'selected' : ''}>${s}</option>`)
        .join('')}</optgroup>`
    )
    .join('');
}
function parseLoc(val) {
  if (val && val.startsWith('town:')) { const t = val.slice(5); return { label: `${t} (all)`, suburbs: DEMO.towns[t] || [] }; }
  return { label: val, suburbs: val ? [val] : [] };
}
suburbSel.innerHTML = locationOptions('town:Christchurch');
showSearchPrompt();

extrasBox.querySelectorAll('.chip.select').forEach((c) => c.addEventListener('click', () => c.classList.toggle('on')));
verifBox.querySelectorAll('.chip.select').forEach((c) => c.addEventListener('click', () => c.classList.toggle('on')));
productsBox?.querySelectorAll('.chip.select').forEach((c) => c.addEventListener('click', () => c.classList.toggle('on')));

rateEl.addEventListener('input', () => { rateOut.textContent = `$${rateEl.value}/hr`; renderHist(); });

// ---- Price-supply histogram: show where local cleaners' rates actually sit,
// highlighting the buckets at or below the chosen rate (i.e. within budget).
const rateHist = document.getElementById('rateHist');
const histCaption = document.getElementById('histCaption');
const H_MIN = 20, H_MAX = 80, H_BUCKET = 5;
const H_N = (H_MAX - H_MIN) / H_BUCKET; // 12 columns across the slider range
const bucketOf = (v) => Math.min(H_N - 1, Math.max(0, Math.floor((v - H_MIN) / H_BUCKET)));
let supplyRates = [];
let supplyLoaded = false;

function renderHist() {
  if (!supplyLoaded) return;
  const rate = Number(rateEl.value);
  if (!supplyRates.length) { rateHist.hidden = true; histCaption.textContent = ''; return; }
  rateHist.hidden = false;
  const counts = new Array(H_N).fill(0);
  supplyRates.forEach((r) => { counts[bucketOf(r)]++; });
  const maxC = Math.max(...counts, 1);
  rateHist.innerHTML = counts
    .map((c, i) => {
      const lo = H_MIN + i * H_BUCKET;
      const inBudget = lo + H_BUCKET / 2 <= rate; // bucket midpoint within budget
      const h = c ? Math.round((c / maxC) * 100) : 0;
      return `<span class="hist-bar ${inBudget ? 'in' : ''}" style="height:${h}%" title="$${lo}–$${lo + H_BUCKET}/hr: ${c} cleaner${c === 1 ? '' : 's'}"></span>`;
    })
    .join('');
  const within = supplyRates.filter((r) => r <= rate).length;
  histCaption.textContent = `${within} of ${supplyRates.length} cleaner${supplyRates.length === 1 ? '' : 's'} here ${within === 1 ? 'is' : 'are'} at or below $${rate}/hr.`;
}

function loadSupply() {
  const parsed = parseLoc(suburbSel.value);
  const service = serviceSel.value;
  supplyLoaded = false;
  rateHist.hidden = true;
  histCaption.textContent = '';
  if (!parsed.suburbs.length || !service) return;
  fetch(`/api/cleaner-rates?suburbs=${encodeURIComponent(parsed.suburbs.join(','))}&service=${encodeURIComponent(service)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { supplyLoaded = true; supplyRates = d && Array.isArray(d.rates) ? d.rates : []; renderHist(); })
    .catch(() => {});
}
suburbSel.addEventListener('change', loadSupply);
serviceSel.addEventListener('change', loadSupply);
loadSupply();

cal.innerHTML = calendarHTML(slots);
wireCalendar(cal, slots);

document.getElementById('browseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch();
});

function currentPrefs() {
  const extras = [...extrasBox.querySelectorAll('.chip.select.on')].map((c) => c.dataset.svc);
  const parsed = parseLoc(suburbSel.value);
  return {
    locLabel: parsed.label,
    suburbs: parsed.suburbs,
    baseService: serviceSel.value,
    services: [...new Set([serviceSel.value, ...extras])],
    verif: [...verifBox.querySelectorAll('.chip.select.on')].map((c) => c.dataset.badge),
    products: !!productsBox?.querySelector('.chip.select.on'),
    hours: Number(hoursSel.value),
    // One rate in, a fair window out - same +/- $10 band the wizard uses.
    budgetMin: Math.max(0, Number(rateEl.value) - 10),
    budgetMax: Number(rateEl.value) + 10,
    slots,
  };
}

// Nothing shows until the visitor actually searches: no results, no empty-state
// image, and no prompt. The meta row keeps its height (see .browse-meta) so the
// page doesn't jump when the first result count lands in it.
function showSearchPrompt() {
  meta.textContent = '';
  const sw = document.getElementById('sortWrap');
  if (sw) sw.hidden = true;
  results.innerHTML = '';
}

async function runSearch() {
  const p = currentPrefs();
  meta.textContent = 'Searching…';
  let data;
  try {
    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suburbs: p.suburbs,
        services: p.services,
        budgetMin: p.budgetMin,
        budgetMax: p.budgetMax,
        verif: p.verif,
        products: p.products,
        baseService: p.baseService,
        durationHours: p.hours,
        slots: p.slots,
      }),
    });
    data = await res.json();
    if (!res.ok) throw new Error(data.error || 'search failed');
  } catch {
    meta.textContent = 'Search is unavailable right now. Please try again.';
    results.innerHTML = '';
    return;
  }

  lastResults = data.results || [];
  lastPrefs = p;
  document.getElementById('sortWrap').hidden = !lastResults.length;
  paintResults();
}

const rateKey = (r) => r.fair ?? r.rateMin ?? r.rateMax ?? 9999;
function paintResults() {
  const p = lastPrefs;
  const scored = (lastResults || []).slice();
  if (!scored.length) {
    meta.textContent = `No cleaners cover ${p.locLabel} yet. More are joining soon.`;
    results.innerHTML = '<img class="empty-art" src="assets/brand/empty_state.svg" alt="No results yet" />';
    return;
  }
  if (sortBy === 'price-asc') scored.sort((a, b) => rateKey(a) - rateKey(b));
  else if (sortBy === 'price-desc') scored.sort((a, b) => rateKey(b) - rateKey(a));
  const lead = sortBy === 'price-asc' ? 'lowest price first' : sortBy === 'price-desc' ? 'highest price first' : 'best match first';
  meta.textContent = `${scored.length} relevant cleaner${scored.length > 1 ? 's' : ''} in ${p.locLabel}, ${lead}.`;

  const cards = scored.map((r) => resultCard(r, p));
  // The hook card says cleaners aren't taking enquiries yet - which would flatly
  // contradict a working Contact button, so it only shows while messaging is off.
  if (cards.length > 2 && !messagingOpen) cards.splice(2, 0, hookCard());
  results.innerHTML = cards.join('');

  results.querySelectorAll('[data-contact]').forEach((b) =>
    b.addEventListener('click', () =>
      messagingOpen
        ? openCompose(b.dataset.contact, b.dataset.contactId)
        : goWaitlist(b.dataset.contact)
    )
  );
  results.querySelectorAll('[data-hook]').forEach((b) => b.addEventListener('click', () => goWaitlist(null)));
  results.querySelectorAll('[data-cleaner]').forEach((b) =>
    b.addEventListener('click', () => openCleanerModal(b.dataset.cleaner))
  );
}

function resultCard(r, p) {
  const tierLabel = r.tier === 'great' ? 'Strong match' : r.tier === 'good' ? 'Good match' : 'Also available';
  const badges = [r.badges.id && 'ID', r.badges.police && 'Criminal check', r.badges.insurance && 'Insured', r.bringsProducts && 'Brings products'].filter(Boolean);
  const offeredChips = (r.offered || []).map((s) => `<span class="chip on">${SVC_NAME[s] || s}</span>`).join('');
  const missingChips = (r.missing || []).map((s) => `<span class="chip off">no ${SVC_NAME[s] || s}</span>`).join('');
  const slotChips = (r.matched || [])
    .map((m) => `<span class="chip on">${DAYS[m.day]} ${(SLOTS.find((s) => s.key === m.slot) || {}).label || m.slot}</span>`)
    .join('');
  const rateStr = serviceRateLabel(r, p);
  const fairStr = '';
  const costStr = r.estCost != null ? ` · ~$${r.estCost} for ${p.hours}h` : '';
  const first = contactName(r.name, r.isBusiness);
  return `<article class="result ${r.featured ? 'featured' : ''}">
    <div class="result-head">
      <div><h3><button class="linklike" type="button" data-cleaner="${r.id}">${r.name}</button>${Rating.badge(r.rating, r.reviews)} ${r.featured ? '<span class="pin">Promoted</span>' : ''}</h3>
        <p class="result-meta">${rateStr}${fairStr}${costStr}</p></div>
      <span class="tier tier-${r.tier}">${tierLabel}</span>
    </div>
    ${r.bondGuaranteed ? '<p class="bond-badge">✓ Bond-back guaranteed on end-of-tenancy cleans</p>' : ''}
    ${badges.length ? `<p class="verif">${badges.map((b) => `<span class="chip">${b}</span>`).join('')}</p>` : ''}
    ${offeredChips || missingChips ? `<div class="chips">${offeredChips}${missingChips}</div>` : ''}
    ${(r.matched || []).length ? `<div class="chips">${slotChips}</div>` : ''}
    <div class="result-actions">
      ${contacted.has(r.id)
        ? `<button class="btn sm contacted" type="button" disabled>Sent ✓</button>`
        : `<button class="btn solid sm" type="button" data-contact="${escapeHtml(r.name)}" data-contact-id="${escapeHtml(r.id)}">Contact ${first}</button>`}
    </div>
  </article>`;
}

function hookCard() {
  return `<div class="hook-card">
    <div><h3>Found someone you like?</h3><p>Create a free account to message them directly. Rates are already shown above - no quotes to chase, and you only ever contact the one you pick.</p></div>
    <button class="btn solid create" type="button" data-hook>Create free account</button>
  </div>`;
}

// ---- Cleaner profile modal (click a cleaner's name) ----
const cleanerModal = document.getElementById('cleanerModal');
const cleanerModalBody = document.getElementById('cleanerModalBody');
document.getElementById('cleanerModalClose')?.addEventListener('click', () => { cleanerModal.hidden = true; });
cleanerModal?.addEventListener('click', (e) => { if (e.target === cleanerModal) cleanerModal.hidden = true; });

async function openCleanerModal(id) {
  if (!cleanerModal) return;
  cleanerModalBody.innerHTML = '<p class="muted">Loading…</p>';
  cleanerModal.hidden = false;
  try {
    const res = await fetch(`/api/cleaner-profile?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error();
    const c = await res.json();
    cleanerModalBody.innerHTML = cleanerCardHTML(c);
    const btn = cleanerModalBody.querySelector('[data-cpcontact]');
    // Same fork as the Contact button on a result card - the profile modal must
    // not still dead-end into the waitlist once messaging is open.
    btn?.addEventListener('click', () => {
      cleanerModal.hidden = true;
      if (messagingOpen) openCompose(btn.dataset.cpname, btn.dataset.cpcontact);
      else goWaitlist(btn.dataset.cpname);
    });
  } catch {
    cleanerModalBody.innerHTML = '<p class="muted">Could not load this profile.</p>';
  }
}
// What to put after "Contact" / "Message".
//
// A person gets their first name, which is friendlier and keeps the button
// short. A trading name is used whole: "Contact Simply" reads as a typo, and
// splitting a business name at the first space produces a company that does not
// exist. The server says which it is - the display name is business_name when
// there is one and the person's name otherwise, and the two are not
// distinguishable from the string alone.
function contactName(name, isBusiness) {
  const full = String(name || 'them').trim();
  if (isBusiness) return full;
  return full.split(/['\s]/)[0] || full;
}
function rateLabel(min, max) {
  // Single price only - never a range.
  const r = min ?? max;
  return r == null ? 'rate on enquiry' : `$${r}/hr`;
}
// The profile card isn't scoped to one clean type, so a cleaner who charges $45
// regular and $65 deep can't be summed up by a single number. "from $45/hr"
// says that honestly; the Rates list below it itemises each type. Still not a
// range - a range in the headline was what made people read the low end as the
// price.
function profileRateLabel(c) {
  const min = c.rateMin, max = c.rateMax;
  if (min == null && max == null) return 'rate on enquiry';
  if (min != null && max != null && max > min) return `from $${min}/hr`;
  return `$${min ?? max}/hr`;
}
// What this cleaner charges for the clean that was actually searched for, plus
// any priced extra that was ticked.
//
// The card used to print rateMin, which is the bottom of a cleaner's band across
// ALL their clean types - so a cleaner at $45 regular / $65 deep advertised
// "$45/hr" on a deep-clean search. The rate now names the clean it is for, so
// there is nothing to misread; when the cleaner doesn't offer that clean at all
// it reads "from $X/hr" rather than quoting a price for work they don't do.
function serviceRateLabel(r, p) {
  const rate = r.rateForService != null ? r.rateForService : (r.rateMin ?? r.rateMax);
  if (rate == null) return 'rate on enquiry';
  const svc = SVC_NAME[r.serviceSlug || p.baseService] || '';
  const head = r.rateIsExact === false
    ? `from $${rate}/hr`
    : `$${rate}/hr${svc ? ` <span class="rate-for">${escapeHtml(svc.toLowerCase())}</span>` : ''}`;
  // Flat-priced extras the customer asked for, itemised rather than folded
  // silently into the hourly figure.
  const extras = (r.extraFees || [])
    .map((e) => ` + $${e.price} ${escapeHtml((SVC_NAME[e.slug] || e.slug).toLowerCase())}`)
    .join('');
  return head + extras;
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function cleanerCardHTML(c) {
  const initial = escapeHtml((c.name || '?').slice(0, 1).toUpperCase());
  const first = escapeHtml(contactName(c.name || 'them', c.isBusiness));
  const svc = c.services.length ? c.services.map((s) => `<span class="chip on">${escapeHtml(s)}</span>`).join('') : '<span class="muted">-</span>';
  const SLOTLBL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
  const avail = c.availability.length
    ? c.availability.slice().sort((a, b) => a.day - b.day).map((a) => `<span class="chip on">${DAYS[a.day]} ${SLOTLBL[a.slot] || a.slot}</span>`).join('')
    : '<span class="muted">Ask about times</span>';
  return `
    <div class="cv-head">
      <div class="avatar lg">${c.photo ? `<img src="${escapeHtml(c.photo)}" alt="" />` : `<span>${initial}</span>`}</div>
      <div>
        <h2>${escapeHtml(c.name)}${Rating.badge(c.rating, c.reviews)}</h2>
        <p class="muted" style="margin:0">${profileRateLabel(c)}${c.years ? ` · ${c.years} yrs exp` : ''}</p>
      </div>
    </div>
    ${Badges.earned(c.badges, c.bringsProducts)}
    ${c.bondGuaranteed ? '<p class="bond-badge">✓ Bond-back guaranteed on end-of-tenancy cleans</p>' : ''}
    ${c.bio ? `<p>${escapeHtml(c.bio)}</p>` : ''}
    <div class="cv-section"><h4>Services</h4><div class="chips">${svc}</div></div>
    ${c.cleanFees && c.cleanFees.length
      ? `<div class="cv-section"><h4>Rates</h4><ul class="addon-menu">${c.cleanFees
          .map((f) => `<li><span>${escapeHtml(SVC_NAME[f.slug] || f.slug)}</span><span class="addon-cost">$${f.price}/hr</span></li>`)
          .join('')}${c.endOfLease
            ? `<li><span>End of lease</span><span class="addon-cost">at the deep-clean rate</span></li>`
            : ''}</ul></div>`
      : ''}
    <div class="cv-section"><h4>Areas covered</h4><p>${c.areas.length ? escapeHtml(c.areas.join(', ')) : '-'}</p></div>
    <div class="cv-section"><h4>Availability</h4><div class="chips">${avail}</div></div>
    ${Review.barsHTML(c.breakdown)}
    <div class="cp-actions">${contacted.has(c.id)
      ? '<button class="btn full contacted" type="button" disabled>Sent ✓</button>'
      : `<button class="btn solid full" type="button" data-cpcontact="${escapeHtml(c.id)}" data-cpname="${escapeHtml(c.name)}">Message ${first}</button>`}</div>`;
}

// ---- Calendar helpers ----
function calendarHTML(sel) {
  const isSel = (day, slot) => sel.some((s) => s.day === day && s.slot === slot);
  let html = '<div class="cal-grid"><div class="cal-corner"></div>';
  DAYS.forEach((d) => (html += `<div class="cal-day">${d}</div>`));
  SLOTS.forEach((slot) => {
    html += `<div class="cal-slot"><strong>${slot.label}</strong><span>${slot.time}</span></div>`;
    DAYS.forEach((_, day) => {
      html += `<button type="button" class="cal-cell ${isSel(day, slot.key) ? 'on' : ''}" data-day="${day}" data-slot="${slot.key}"></button>`;
    });
  });
  return html + '</div>';
}
function wireCalendar(container, sel) {
  container.querySelectorAll('.cal-cell').forEach((cell) =>
    cell.addEventListener('click', () => {
      const day = Number(cell.dataset.day);
      const slot = cell.dataset.slot;
      const i = sel.findIndex((s) => s.day === day && s.slot === slot);
      const on = i < 0;
      if (on) sel.push({ day, slot });
      else sel.splice(i, 1);
      cell.classList.toggle('on', on);
    })
  );
}

// ---- Capture modal (signup at the peak) ----
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalSub = document.getElementById('modalSub');
const capForm = document.getElementById('capForm');
const capMsg = document.getElementById('capMsg');
const capBody = document.getElementById('capBody');
const capNotice = document.getElementById('capNotice');
const capCompose = document.getElementById('capCompose');
let pendingCleaner = null;
let pendingCleanerId = null;
// Cleaners already contacted this visit. Held here rather than read off the
// button, because sorting the results rebuilds every card and would otherwise
// forget. Not persisted: a reload legitimately starts over, and the portal is
// the real record of who has been messaged.
const contacted = new Set();

// Messaging is off for the public while the network is being built, but open to
// specific accounts so the flow can be used and watched before launch. The
// server decides (admin, or MESSAGING_OPEN); this only decides what to render.
let messagingOpen = false;
(function checkMessaging() {
  const u = window.Session && Session.get();
  if (!u || !u.id) return;
  fetch(`/api/can-message?userId=${encodeURIComponent(u.id)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !d.allowed) return;
      messagingOpen = true;
      // Results may already be on screen - repaint so the waitlist hook card
      // goes away and Contact starts meaning contact.
      if (lastResults && lastResults.length) paintResults();
    })
    .catch(() => {});
})();

document.getElementById('signupHook')?.addEventListener('click', () => goWaitlist(null));
document.getElementById('capNoticeOk')?.addEventListener('click', closeModal);
document.getElementById('modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

// Messaging is switched off while we build the cleaner network, so no contact
// CTA on browse can reach an enquiry. Customers already on the waitlist just
// get told to sit tight; everyone else is offered the signup that puts them on
// it. Either way they stay on browse - no handoff to the portal.
function goWaitlist(cleanerName) {
  openModal(cleanerName || null, !!(window.Session && Session.get()));
}

// Real enquiry, for accounts messaging is open to. Posts to /api/contact, which
// reuses an existing thread with this cleaner rather than starting a second one.
function openCompose(cleanerName, cleanerId) {
  pendingCleaner = cleanerName;
  pendingCleanerId = cleanerId;
  capBody.hidden = true;
  capNotice.hidden = true;
  capCompose.hidden = false;
  modalTitle.textContent = `Message ${cleanerName}`;
  modalSub.textContent = 'Exclusively yours - this goes to this cleaner only, not out to a pool.';
  const out = document.getElementById('composeMsgOut');
  out.textContent = '';
  out.className = 'auth-msg';
  modal.hidden = false;
  setTimeout(() => document.getElementById('composeMsg')?.focus(), 30);
}

document.getElementById('composeForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('composeSend');
  const out = document.getElementById('composeMsgOut');
  const body = document.getElementById('composeMsg').value.trim();
  const user = window.Session && Session.get();
  if (!user || !user.id) { out.className = 'auth-msg error'; out.textContent = 'Log in first.'; return; }
  if (!body) { out.className = 'auth-msg error'; out.textContent = 'Write a short message first.'; return; }
  btn.disabled = true;
  out.className = 'auth-msg';
  out.textContent = 'Sending…';
  try {
    const p = lastPrefs || currentPrefs();
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientUserId: user.id,
        cleanerId: pendingCleanerId,
        message: body,
        serviceSlug: p.baseService,
        // The search may be a whole town, so send one real suburb rather than
        // a label like "Christchurch (all)" that resolves to nothing.
        suburb: p.suburbs && p.suburbs.length === 1 ? p.suburbs[0] : '',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'could not send');
    // Confirm, then get out of the way. Leaving the composer open after a
    // successful send invites a second copy of the same message, and the reply
    // does not arrive here anyway - it lands in the portal.
    out.className = 'auth-msg ok';
    out.textContent = `Sent to ${pendingCleaner}.`;
    document.getElementById('composeMsg').value = '';
    contacted.add(pendingCleanerId);
    btn.textContent = 'Sent';
    // Long enough to read, short enough not to feel stuck. The button stays
    // disabled through it - re-enabling on success would leave a live Send
    // button sitting under the cursor for most of a second, and the second
    // press posts the message again.
    setTimeout(() => {
      closeModal();
      btn.textContent = 'Send enquiry';
      btn.disabled = false;
      // Repaint so the card for this cleaner now reads "Sent" - the modal has
      // gone, so the list is the only place left that can say so.
      if (lastResults && lastResults.length) paintResults();
    }, 900);
    return; // don't fall through to the re-enable below
  } catch (err) {
    out.className = 'auth-msg error';
    out.textContent = `Could not send that (${err.message}). Try again.`;
  }
  btn.disabled = false;
});

// Messaging is open, so this is no longer a waitlist - it is the signup that
// stands between a visitor and the cleaner they just picked. Two cases only:
// they have no account (make one, then message), or they have one and we could
// not establish that they may message, which is a fault rather than a phase.
function openModal(cleanerName, loggedIn) {
  pendingCleaner = cleanerName;
  const who = cleanerName ? `message ${cleanerName}` : 'message a cleaner';
  capCompose.hidden = true;
  capBody.hidden = !!loggedIn;
  capNotice.hidden = !loggedIn;
  if (loggedIn) {
    // Signed in but the permission check never came back - say so plainly
    // rather than inventing a launch date that has already passed.
    modalTitle.textContent = "Couldn't open that just now";
    modalSub.textContent = 'Something went wrong checking your account. Reload the page and try again - your message has not been sent.';
  } else if (cleanerName) {
    modalTitle.textContent = `Create your free account to ${who}`;
    modalSub.textContent = 'About 20 seconds, free for households always, and your message goes straight to them once you are in.';
  } else {
    modalTitle.textContent = 'Create your free account';
    modalSub.textContent = 'Free for households, always. About 20 seconds, and you can message any cleaner you like.';
  }
  capMsg.textContent = '';
  capMsg.className = 'auth-msg';
  modal.hidden = false;
  // Don't focus a field that isn't there - the notice variant has no form.
  setTimeout(() => (loggedIn ? capNotice.querySelector('button') : capForm.fullName)?.focus(), 30);
}
function closeModal() {
  modal.hidden = true;
}

capForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  capMsg.className = 'auth-msg';
  capMsg.textContent = 'Creating your account…';
  const body = {
    role: 'customer',
    fullName: capForm.fullName.value,
    email: capForm.email.value,
    password: capForm.password.value,
  };
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      // A real failure - most often "that email already has an account". Show
      // the server's own message; never fake a session or a success redirect.
      capMsg.textContent = data.error || 'Could not create your account.';
      capMsg.classList.add('error');
      return;
    }
    // Account created from the browse capture modal - count the conversion.
    window.mmTrack && mmTrack('sign_up', { method: 'customer' });
    // With email confirmation on, the account is created but not logged in until
    // the code is entered. Don't store a half-session - send them to confirm.
    if (data.needsVerification || !data.user) {
      capMsg.classList.remove('error');
      capMsg.textContent = 'Almost there - check your email for a confirmation code, then log in.';
      setTimeout(() => { location.href = '/login?role=customer'; }, 2500);
      return;
    }
    Session.set(data.user);
    location.href = '/customer#find';
  } catch {
    capMsg.textContent = 'Could not reach the server. Please try again.';
    capMsg.classList.add('error');
  }
});
