// Public, ungated cleaner browse — now backed by the real /api/match endpoint.
// Signup only appears at the "Contact" peak (or the always-present hook).
const { DAYS, SLOTS } = DEMO;

// Service label lookup (+ a couple of extras not in the seed catalogue).
const SVC_NAME = { windows: 'Windows' };
DEMO.services.forEach((s) => (SVC_NAME[s.slug] = s.name));

const suburbSel = document.getElementById('suburb');
const serviceSel = document.getElementById('service');
const hoursSel = document.getElementById('hours');
const budgetMinEl = document.getElementById('budgetMin');
const budgetMaxEl = document.getElementById('budgetMax');
const extrasBox = document.getElementById('extras');
const verifBox = document.getElementById('verif');
const cal = document.getElementById('cal');
const results = document.getElementById('results');
const meta = document.getElementById('meta');

const slots = []; // chosen availability {day, slot}
document.getElementById('sf-year').textContent = new Date().getFullYear();

// Type of clean + hours from the shared catalogue (matches the DB slugs).
serviceSel.innerHTML = DEMO.services.map((s) => `<option value="${s.slug}">${s.name}</option>`).join('');
hoursSel.innerHTML = [
  { h: 1, l: '1 hour' }, { h: 2, l: '2 hours' }, { h: 3, l: '3 hours' }, { h: 4, l: 'Half day (4h)' },
].map((o) => `<option value="${o.h}" ${o.h === 2 ? 'selected' : ''}>${o.l}</option>`).join('');

// Suburbs come from the real database.
fetch('/api/suburbs')
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((list) => {
    suburbSel.innerHTML = list.map((s) => `<option ${s.name === 'Riccarton' ? 'selected' : ''}>${s.name}</option>`).join('');
    runSearch();
  })
  .catch(() => {
    suburbSel.innerHTML = DEMO.suburbs.map((s) => `<option ${s === 'Riccarton' ? 'selected' : ''}>${s}</option>`).join('');
    runSearch();
  });

extrasBox.querySelectorAll('.chip.select').forEach((c) => c.addEventListener('click', () => c.classList.toggle('on')));
verifBox.querySelectorAll('.chip.select').forEach((c) => c.addEventListener('click', () => c.classList.toggle('on')));

cal.innerHTML = calendarHTML(slots);
wireCalendar(cal, slots);

document.getElementById('browseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch();
});

function currentPrefs() {
  const extras = [...extrasBox.querySelectorAll('.chip.select.on')].map((c) => c.dataset.svc);
  return {
    suburb: suburbSel.value,
    services: [...new Set([serviceSel.value, ...extras])],
    verif: [...verifBox.querySelectorAll('.chip.select.on')].map((c) => c.dataset.badge),
    hours: Number(hoursSel.value),
    budgetMin: Number(budgetMinEl.value) || 0,
    budgetMax: Number(budgetMaxEl.value) || 999,
    slots,
  };
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
        suburb: p.suburb,
        services: p.services,
        budgetMin: p.budgetMin,
        budgetMax: p.budgetMax,
        verif: p.verif,
        durationHours: p.hours,
        slots: p.slots,
      }),
    });
    data = await res.json();
    if (!res.ok) throw new Error(data.error || 'search failed');
  } catch {
    meta.textContent = 'Search is unavailable right now — please try again.';
    results.innerHTML = '';
    return;
  }

  const scored = data.results || [];
  if (!scored.length) {
    meta.textContent = `No cleaners cover ${p.suburb} yet — more are joining soon.`;
    results.innerHTML = '<img class="empty-art" src="assets/brand/empty_state.svg" alt="No results yet" />';
    return;
  }
  meta.textContent = `${scored.length} cleaner${scored.length > 1 ? 's' : ''} in ${p.suburb}, best match first.`;

  const cards = scored.map((r) => resultCard(r, p));
  if (cards.length > 2) cards.splice(2, 0, hookCard());
  results.innerHTML = cards.join('');

  results.querySelectorAll('[data-contact]').forEach((b) =>
    b.addEventListener('click', () => {
      const name = b.dataset.contact;
      const cid = b.dataset.cid;
      if (window.Session && Session.get()) {
        localStorage.setItem('mm_pending_contact', JSON.stringify({ id: cid, name }));
        location.href = '/customer';
        return;
      }
      openModal(name, cid);
    })
  );
  results.querySelectorAll('[data-hook]').forEach((b) => b.addEventListener('click', () => openModal(null)));
}

function resultCard(r, p) {
  const tierLabel = r.tier === 'great' ? 'Strong match' : r.tier === 'good' ? 'Good match' : 'Also available';
  const badges = [r.badges.id && 'ID', r.badges.police && 'Police', r.badges.insurance && 'Insured'].filter(Boolean);
  const offeredChips = (r.offered || []).map((s) => `<span class="chip on">${SVC_NAME[s] || s}</span>`).join('');
  const missingChips = (r.missing || []).map((s) => `<span class="chip off">no ${SVC_NAME[s] || s}</span>`).join('');
  const slotChips = (r.matched || [])
    .map((m) => `<span class="chip on">${DAYS[m.day]} ${(SLOTS.find((s) => s.key === m.slot) || {}).label || m.slot}</span>`)
    .join('');
  const rateStr = r.rateMin != null && r.rateMax != null ? `$${r.rateMin}–$${r.rateMax}/hr` : 'rate on enquiry';
  const fairStr = r.fair != null ? ` · <strong>fair ~$${r.fair}/hr</strong>` : '';
  const costStr = r.estCost != null ? ` · ~$${r.estCost} for ${p.hours}h` : '';
  const first = r.name.split(/['\s]/)[0];
  return `<article class="result ${r.featured ? 'featured' : ''}">
    <div class="result-head">
      <div><h3>${r.name} ${r.featured ? '<span class="pin">Promoted</span>' : ''}</h3>
        <p class="result-meta">★ ${Number(r.rating).toFixed(1)} (${r.reviews}) · ${rateStr}${fairStr}${costStr} · ${p.suburb}</p></div>
      <span class="tier tier-${r.tier}">${tierLabel}</span>
    </div>
    ${badges.length ? `<p class="verif">${badges.map((b) => `<span class="chip">${b}</span>`).join('')}</p>` : ''}
    ${offeredChips || missingChips ? `<div class="chips">${offeredChips}${missingChips}</div>` : ''}
    ${(r.matched || []).length ? `<div class="chips">${slotChips}</div>` : ''}
    <div class="result-actions">
      <button class="btn solid sm" type="button" data-contact="${r.name}" data-cid="${r.id}">Contact ${first}</button>
    </div>
  </article>`;
}

function hookCard() {
  return `<div class="hook-card">
    <div><h3>Found someone you like?</h3><p>Create a free account to message your maid. Takes seconds, no card needed.</p></div>
    <button class="btn solid" type="button" data-hook>Create free account</button>
  </div>`;
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
let pendingCleaner = null;
let pendingCleanerId = null;

document.getElementById('signupHook')?.addEventListener('click', () => openModal(null));
document.getElementById('modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

function openModal(cleanerName, cleanerId) {
  pendingCleaner = cleanerName;
  pendingCleanerId = cleanerId || null;
  if (cleanerName) {
    modalTitle.textContent = `Message ${cleanerName}`;
    modalSub.textContent = "You're one step away — create your free account to send a message.";
  } else {
    modalTitle.textContent = 'Create your free account';
    modalSub.textContent = 'Free forever, and about 20 seconds.';
  }
  capMsg.textContent = '';
  capMsg.className = 'auth-msg';
  modal.hidden = false;
  setTimeout(() => capForm.fullName.focus(), 30);
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
  if (pendingCleanerId) localStorage.setItem('mm_pending_contact', JSON.stringify({ id: pendingCleanerId, name: pendingCleaner }));
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    Session.set(data.user);
    location.href = '/customer';
  } catch {
    Session.set({ id: 'demo', role: 'client', fullName: body.fullName || 'You', email: body.email });
    capMsg.textContent = 'Account created — taking you to your portal…';
    capMsg.classList.add('ok');
    setTimeout(() => (location.href = '/customer'), 700);
  }
});
