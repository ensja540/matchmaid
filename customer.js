// Customer portal — fully backed by the real API (no demo data).
// Reference constants (calendar labels, service catalogue) still come from DEMO.
const { DAYS, SLOTS } = DEMO;

const sessionUser = Session.get();
const uid = sessionUser?.id && sessionUser.id !== 'demo' ? sessionUser.id : null;
const displayName = sessionUser?.fullName || 'there';
document.getElementById('who').textContent = `Hi, ${displayName.split(' ')[0]} (customer)`;
document.getElementById('logout').addEventListener('click', () => {
  Session.clear();
  location.href = '/';
});
// Same account, other side: flip the session role and head to the maid portal.
document.getElementById('switchSide')?.addEventListener('click', () => {
  const u = Session.get();
  if (u) { u.role = 'cleaner'; Session.set(u); }
});

const panel = document.getElementById('panel');
const tabs = document.getElementById('tabs');
let current = 'overview';

// ---- Working state (all loaded from the API) ----
const find = { suburb: 'Riccarton', service: 'regular', desiredRate: 35, slots: [], ran: false, results: [] };
let suburbList = DEMO.suburbs.slice();
let directory = []; // active cleaners (for the messages picker)
let convos = []; // this user's conversations
let msgCache = {}; // conversationId -> messages[]
let activeConvo = null;
let myEnquiries = []; // enquiries this customer has sent

const PROFILE_DEFAULTS = {
  photo: '', fullName: displayName, email: sessionUser?.email || '', phone: '',
  suburb: 'Riccarton', address: '', bedrooms: '3', bathrooms: '1', stairs: false, homeType: 'House', notes: '',
};
let cprof = { ...PROFILE_DEFAULTS };

// ---- API helpers ----
const HAS_FETCH = typeof fetch !== 'undefined';
const getJSON = (url) =>
  HAS_FETCH ? fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(r))) : Promise.reject();
const postJSON = (url, body) =>
  HAS_FETCH
    ? fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) =>
        r.ok ? r.json() : Promise.reject(r)
      )
    : Promise.reject();

function loadSuburbs() {
  getJSON('/api/suburbs')
    .then((list) => { suburbList = list.map((s) => s.name); reRenderIf('find', 'profile'); })
    .catch(() => {});
}
function loadDirectory() {
  getJSON('/api/directory').then((list) => { directory = list; reRenderIf('messages'); }).catch(() => {});
}
function loadProfile() {
  getJSON(`/api/client-profile?userId=${encodeURIComponent(uid)}`)
    .then((data) => { cprof = { ...PROFILE_DEFAULTS, ...data }; reRenderIf('profile', 'overview'); })
    .catch(() => {});
}
function loadEnquiries() {
  getJSON(`/api/enquiries?userId=${encodeURIComponent(uid)}`)
    .then((list) => { myEnquiries = list.filter((e) => e.role === 'client'); reRenderIf('overview'); })
    .catch(() => {});
}
function refreshConvos() {
  return getJSON(`/api/conversations?userId=${encodeURIComponent(uid)}`)
    .then((list) => { convos = list; })
    .catch(() => {});
}
function loadMsgs(id) {
  return getJSON(`/api/messages?conversationId=${encodeURIComponent(id)}&userId=${encodeURIComponent(uid)}`)
    .then((data) => { msgCache[id] = data.messages || []; })
    .catch(() => { msgCache[id] = []; });
}
const apiContact = (cleanerId, message) =>
  postJSON('/api/contact', { clientUserId: uid, cleanerId, message, serviceSlug: find.service, suburb: find.suburb }).then(
    (d) => d.conversationId
  );

function reRenderIf(...panels) {
  if (panels.includes(current)) render();
}

// ---- Real-time polling (only while the Messages tab is open) ----
let pollTimer = null;
const msgSig = (m) => (m ? m.length + '|' + (m[m.length - 1]?.body || '') : '0');
const convoSig = () => convos.map((c) => c.id + ':' + (c.lastBody || '')).join('~');
function startPolling() {
  if (pollTimer || !uid || !HAS_FETCH) return;
  pollTimer = setInterval(pollTick, 4000);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
async function pollTick() {
  if (current !== 'messages' || !uid) return;
  if (activeConvo) {
    const before = msgSig(msgCache[activeConvo]);
    await loadMsgs(activeConvo);
    if (current === 'messages' && msgSig(msgCache[activeConvo]) !== before) renderBubbles();
  }
  const beforeList = convoSig();
  await refreshConvos();
  if (current === 'messages' && convoSig() !== beforeList) renderConvoList();
}
function renderBubbles() {
  const el = panel.querySelector('#bubbles');
  if (!el) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  el.innerHTML = bubblesHTML(msgCache[activeConvo] ?? null);
  if (nearBottom) el.scrollTop = el.scrollHeight;
}
function renderConvoList() {
  const el = panel.querySelector('.convo-list');
  if (!el) return;
  el.innerHTML = convoListHTML();
  bindConvoButtons();
}

async function initMessages() {
  await refreshConvos();
  const pending = localStorage.getItem('mm_pending_contact');
  if (pending) {
    localStorage.removeItem('mm_pending_contact');
    try {
      const { id } = JSON.parse(pending);
      activeConvo = await apiContact(id);
      current = 'messages';
      tabs.querySelectorAll('.portal-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'messages'));
      await refreshConvos();
    } catch {}
  }
  if (!activeConvo && convos[0]) activeConvo = convos[0].id;
  if (activeConvo) await loadMsgs(activeConvo);
  render();
}

// Kick off all loads for the logged-in customer.
if (uid) {
  loadSuburbs();
  loadDirectory();
  loadProfile();
  loadEnquiries();
  initMessages();
} else {
  loadSuburbs();
}

// ---- Navigation ----
tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.portal-tab');
  if (!btn) return;
  goTo(btn.dataset.tab);
});
function goTo(tab) {
  current = tab;
  tabs.querySelectorAll('.portal-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  render();
}
function render() {
  panel.innerHTML = PANELS[current]();
  WIRE[current]?.();
  if (current === 'messages') {
    startPolling();
    const b = panel.querySelector('#bubbles');
    if (b) b.scrollTop = b.scrollHeight;
  } else {
    stopPolling();
  }
}

const PANELS = {
  overview() {
    return `
      <h1>Welcome, ${escapeHtml(displayName.split(' ')[0])}.</h1>
      <div class="cta-card">
        <div>
          <h2>Need a clean?</h2>
          <p class="muted">Search local maids, compare rates openly, and contact just the one you choose.</p>
        </div>
        <button class="btn solid" data-goto="find" type="button">Find a cleaner</button>
      </div>

      <div class="panel-card">
        <h2>How Match Maid works</h2>
        <div class="howto"><ol class="steps">
          <li><span class="num">01</span><div><h3>Search your area</h3><p>Choose your suburb and the type of clean to see local maids, best match first.</p></div></li>
          <li><span class="num">02</span><div><h3>Compare openly</h3><p>Check each maid's rate range, rating, reviews and verified badges. Nothing hidden.</p></div></li>
          <li><span class="num">03</span><div><h3>Contact your pick</h3><p>Message the single cleaner you like — no bidding wars, no shared leads.</p></div></li>
          <li><span class="num">04</span><div><h3>Arrange it directly</h3><p>Agree the day, time and price between you. Payment stays between you and your cleaner.</p></div></li>
          <li><span class="num">05</span><div><h3>Review after the clean</h3><p>Rate cleanliness, value and punctuality to help the next household choose well.</p></div></li>
        </ol></div>
      </div>

      <div class="panel-card">
        <h2>Your enquiries</h2>
        ${myEnquiries.length
          ? myEnquiries
              .map(
                (e) => `<div class="enquiry-row">
                  <div><strong>${escapeHtml(e.cleaner)}</strong> · ${escapeHtml(e.service)}<br /><span class="muted">${escapeHtml(e.when)}</span></div>
                  <span class="status status-${e.status}">${e.status}</span>
                </div>`
              )
              .join('')
          : '<p class="muted">You haven\'t sent any enquiries yet. Find a cleaner and say hello.</p>'}
      </div>

      <div class="panel-card">
        <h2>Cleaners you've contacted</h2>
        ${convos.length
          ? `<div class="results">${convos.map(contactedRow).join('')}</div>`
          : '<p class="muted">No one yet — the cleaners you message will appear here.</p>'}
      </div>`;
  },

  find() {
    return `
      <h1>Find a cleaner</h1>
      <p class="wizard-lede">Set what you're after. We rank local maids by how well they match,
        closest first. You set your price, they set theirs.</p>
      <form class="find-form" id="findForm">
        <div class="field-row">
          <label class="field"><span>Suburb</span>
            <select name="suburb">${suburbList.map((s) => opt(s, s, find.suburb)).join('')}</select>
          </label>
          <label class="field"><span>Service</span>
            <select name="service">${DEMO.services.map((s) => opt(s.slug, s.name, find.service)).join('')}</select>
          </label>
        </div>
        <label class="field"><span>Ideal hourly rate: <strong id="rateOut">$${find.desiredRate}/hr</strong></span>
          <input type="range" id="rate" min="20" max="80" value="${find.desiredRate}" />
          <span class="muted" style="font-size:0.82rem">We find a fair value within each cleaner's rate range near this.</span>
        </label>
        <div class="field"><span>When suits you? (optional)</span>
          <div class="cal" id="cal">${calendarHTML(find.slots)}</div>
        </div>
        <button class="btn solid" type="submit">Show my matches</button>
      </form>
      <div id="findResults" class="results">${find.ran ? renderResults(find.results) : ''}</div>`;
  },

  messages() {
    const convo = convos.find((c) => c.id === activeConvo) || convos[0] || null;
    if (convo) activeConvo = convo.id;
    const contactedIds = new Set(convos.map((c) => c.cleanerId));
    const pickable = directory.filter((c) => !contactedIds.has(c.id));
    return `
      <h1>Messages</h1>
      <p class="wizard-lede">Chat directly with any cleaner on Match Maid. Your history is saved to your account.</p>
      <div class="msg-layout">
        <div class="convo-col">
          <form class="new-chat" id="newChat">
            <select id="newCleaner">${
              pickable.length
                ? pickable.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
                : '<option value="">All cleaners messaged</option>'
            }</select>
            <button class="btn outline sm" type="submit" ${pickable.length ? '' : 'disabled'}>New</button>
          </form>
          <div class="convo-list">${convoListHTML()}</div>
        </div>
        <div class="thread">
          ${
            convo
              ? threadHTML(convo, msgCache[convo.id] ?? null)
              : '<div class="bubbles"><p class="muted" style="margin:auto">Start a chat with any cleaner →</p></div>'
          }
        </div>
      </div>`;
  },

  profile() {
    const bedOpts = ['1', '2', '3', '4', '5', '6+'].map((v) => opt(v, v, cprof.bedrooms)).join('');
    const bathOpts = ['1', '2', '3', '4+'].map((v) => opt(v, v, cprof.bathrooms)).join('');
    const typeOpts = ['House', 'Apartment', 'Townhouse', 'Unit'].map((v) => opt(v, v, cprof.homeType)).join('');
    return `
      <h1>Your profile</h1>
      <form class="profile-form" id="profileForm">
        <div class="avatar-row">
          <div class="avatar" id="avatar">${cprof.photo ? `<img src="${cprof.photo}" alt="" />` : '<span>Photo</span>'}</div>
          <label class="btn outline sm">Upload photo<input type="file" id="photoInput" accept="image/*" hidden /></label>
        </div>

        <div class="field-row">
          <label class="field"><span>Full name</span><input name="fullName" value="${attr(cprof.fullName)}" /></label>
          <label class="field"><span>Email</span><input name="email" type="email" value="${attr(cprof.email)}" /></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Phone</span><input name="phone" value="${attr(cprof.phone)}" placeholder="Optional" /></label>
          <label class="field"><span>Suburb</span><select name="suburb">${suburbList.map((s) => opt(s, s, cprof.suburb)).join('')}</select></label>
        </div>
        <label class="field"><span>Address</span><input name="address" value="${attr(cprof.address)}" /></label>

        <span class="bf-label" style="margin-top:1.4rem">Your home</span>
        <div class="field-row">
          <label class="field"><span>Bedrooms</span><select name="bedrooms">${bedOpts}</select></label>
          <label class="field"><span>Bathrooms</span><select name="bathrooms">${bathOpts}</select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Home type</span><select name="homeType">${typeOpts}</select></label>
          <label class="check-inline" style="align-self:end"><input type="checkbox" name="stairs" ${cprof.stairs ? 'checked' : ''} /> Has stairs</label>
        </div>
        <label class="field"><span>Layout notes &amp; access</span><textarea name="notes" rows="3" placeholder="e.g. 3 bed 1 bath, stairs to the upper floor, park in the driveway, friendly dog.">${text(cprof.notes)}</textarea></label>

        <div class="save-row">
          <button class="btn solid" type="submit">Save profile</button>
          <span class="save-msg" id="profMsg"></span>
        </div>
      </form>`;
  },
};

const WIRE = {
  overview() {
    panel.querySelector('[data-goto]')?.addEventListener('click', () => goTo('find'));
    panel.querySelectorAll('[data-open]').forEach((b) =>
      b.addEventListener('click', () => openConvo(b.dataset.open, true))
    );
  },
  find() {
    const form = panel.querySelector('#findForm');
    const rate = panel.querySelector('#rate');
    const rateOut = panel.querySelector('#rateOut');
    rate.addEventListener('input', () => {
      find.desiredRate = Number(rate.value);
      rateOut.textContent = `$${find.desiredRate}/hr`;
    });
    wireCalendar(panel.querySelector('#cal'), find.slots);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      find.suburb = form.suburb.value;
      find.service = form.service.value;
      find.ran = true;
      const box = panel.querySelector('#findResults');
      box.innerHTML = '<p class="muted">Searching…</p>';
      try {
        const data = await postJSON('/api/match', {
          suburb: find.suburb,
          services: [find.service],
          budgetMin: Math.max(0, find.desiredRate - 10),
          budgetMax: find.desiredRate + 10,
          verif: [],
          durationHours: 2,
          slots: find.slots,
        });
        find.results = data.results || [];
      } catch {
        box.innerHTML = '<p class="muted">Search is unavailable right now — please try again.</p>';
        return;
      }
      box.innerHTML = renderResults(find.results);
      wireContact(box);
    });
  },
  messages() {
    bindConvoButtons();
    const nc = panel.querySelector('#newChat');
    nc?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cleanerId = panel.querySelector('#newCleaner').value;
      if (!cleanerId || !uid) return;
      activeConvo = await apiContact(cleanerId);
      await refreshConvos();
      await loadMsgs(activeConvo);
      render();
    });
    const composer = panel.querySelector('#composer');
    composer?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = composer.body.value.trim();
      if (!t || !activeConvo || !uid) return;
      composer.body.value = '';
      try {
        await postJSON('/api/messages', { conversationId: activeConvo, senderUserId: uid, body: t });
        await loadMsgs(activeConvo);
        await refreshConvos();
      } catch {}
      render();
      const bubbles = panel.querySelector('#bubbles');
      if (bubbles) bubbles.scrollTop = bubbles.scrollHeight;
    });
  },
  profile() {
    const avatar = panel.querySelector('#avatar');
    panel.querySelector('#photoInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        cprof.photo = reader.result;
        avatar.innerHTML = `<img src="${cprof.photo}" alt="" />`;
      };
      reader.readAsDataURL(file);
    });
    panel.querySelector('#profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      Object.assign(cprof, {
        fullName: f.fullName.value, email: f.email.value, phone: f.phone.value,
        suburb: f.suburb.value, address: f.address.value,
        bedrooms: f.bedrooms.value, bathrooms: f.bathrooms.value,
        homeType: f.homeType.value, stairs: f.stairs.checked, notes: f.notes.value,
      });
      const el = panel.querySelector('#profMsg');
      if (!uid) {
        el.textContent = 'Log in to save your profile.';
        el.className = 'save-msg err';
        return;
      }
      el.textContent = 'Saving…';
      el.className = 'save-msg';
      try {
        await putClientProfile({ userId: uid, ...cprof });
        el.textContent = 'Saved to your account.';
        el.className = 'save-msg ok';
      } catch {
        el.textContent = 'Could not save — please try again.';
        el.className = 'save-msg err';
      }
    });
  },
};
// PUT via fetch (postJSON is POST; client-profile needs PUT).
function putClientProfile(body) {
  if (!HAS_FETCH) return Promise.reject();
  return fetch('/api/client-profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => (r.ok ? r.json() : Promise.reject(r)));
}

async function openConvo(id, jump) {
  activeConvo = id;
  if (msgCache[id] === undefined) await loadMsgs(id);
  if (jump) goTo('messages');
  else render();
}

// ---------- Results (from the real /api/match) ----------
function renderResults(scored) {
  scored = scored || [];
  if (!scored.length)
    return `<p class="muted">No cleaners cover ${find.suburb} for that service yet. More are coming soon.</p>`;

  const great = scored.filter((r) => r.tier === 'great').length;
  return (
    `<p class="results-summary">Showing ${scored.length} cleaner${scored.length > 1 ? 's' : ''} in ${find.suburb}, best match first${
      great ? `, ${great} strong match${great > 1 ? 'es' : ''} at the top` : ''
    }.</p>` + scored.map(resultCard).join('')
  );
}

function resultCard(r) {
  const tierLabel = r.tier === 'great' ? 'Strong match' : r.tier === 'good' ? 'Good match' : 'Also available';
  const badges = [r.badges.id && 'ID', r.badges.police && 'Police', r.badges.insurance && 'Insured'].filter(Boolean);
  const slotChips = (r.matched || [])
    .map((m) => `<span class="chip on">${DAYS[m.day]} ${(SLOTS.find((s) => s.key === m.slot) || {}).label || m.slot}</span>`)
    .join('');
  const rateStr = r.rateMin != null && r.rateMax != null ? `$${r.rateMin}–$${r.rateMax}/hr` : 'rate on enquiry';
  const fairStr = r.fair != null ? ` · fair ~$${r.fair}/hr` : '';
  const reqSlots = find.slots.length;
  const first = escapeHtml(r.name.split(/['\s]/)[0]);
  return `<article class="result ${r.featured ? 'featured' : ''}">
    <div class="result-head">
      <div><h3>${escapeHtml(r.name)} ${r.featured ? '<span class="pin">Promoted</span>' : ''}</h3>
        <p class="result-meta">★ ${Number(r.rating).toFixed(1)} (${r.reviews}) · ${rateStr}${fairStr}</p></div>
      <span class="tier tier-${r.tier}">${tierLabel}</span>
    </div>
    ${badges.length ? `<p class="verif">${badges.map((b) => `<span class="chip">${b}</span>`).join('')}</p>` : ''}
    ${reqSlots && (r.matched || []).length ? `<div class="chips">${slotChips}</div>` : ''}
    ${reqSlots && !(r.matched || []).length ? `<p class="no-overlap">Not free at your chosen times — ask about other slots.</p>` : ''}
    <div class="result-actions"><button class="btn solid sm" type="button" data-contact="${attr(r.name)}" data-cid="${attr(r.id)}">Contact ${first}</button></div>
  </article>`;
}

// Contact from a result: start (or reuse) a real conversation, then open it.
function wireContact(box) {
  box.querySelectorAll('[data-contact]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!uid) {
        location.href = '/login?role=customer';
        return;
      }
      b.disabled = true;
      try {
        activeConvo = await apiContact(b.dataset.cid);
        await refreshConvos();
        await loadMsgs(activeConvo);
      } catch {}
      goTo('messages');
    })
  );
}

function contactedRow(c) {
  return `<article class="result">
    <div class="result-head">
      <div><h3>${escapeHtml(c.with)}</h3><p class="result-meta">${escapeHtml((c.lastBody || '').slice(0, 48))}</p></div>
      <button class="btn outline sm" type="button" data-open="${c.id}">Message</button>
    </div>
  </article>`;
}

// ---------- Shared helpers ----------
function opt(value, label, selected) {
  return `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`;
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const attr = escapeHtml;
const text = escapeHtml;
function bubblesHTML(msgs) {
  return msgs == null
    ? '<p class="muted" style="margin:auto">Loading…</p>'
    : msgs.length
    ? msgs.map((m) => `<div class="bubble ${m.from}"><p>${escapeHtml(m.body)}</p><span>${m.at}</span></div>`).join('')
    : '<p class="muted" style="margin:auto">Say hi 👋</p>';
}
function threadHTML(c, msgs) {
  return `<div class="thread-head"><strong>${escapeHtml(c.with)}</strong></div>
    <div class="bubbles" id="bubbles">${bubblesHTML(msgs)}</div>
    <form class="composer" id="composer">
      <input name="body" placeholder="Write a message…" autocomplete="off" />
      <button class="btn solid" type="submit">Send</button>
    </form>`;
}
function convoListHTML() {
  return convos.length
    ? convos
        .map(
          (c) => `<button type="button" class="convo ${c.id === activeConvo ? 'active' : ''}" data-convo="${c.id}">
            <strong>${escapeHtml(c.with)}</strong>
            <span class="muted">${escapeHtml((c.lastBody || '').slice(0, 36))}</span>
          </button>`
        )
        .join('')
    : '<p class="muted" style="padding:1rem">No chats yet.</p>';
}
function bindConvoButtons() {
  panel.querySelectorAll('[data-convo]').forEach((b) =>
    b.addEventListener('click', () => openConvo(b.dataset.convo))
  );
}
function calendarHTML(selected) {
  const isSel = (day, slot) => selected.some((s) => s.day === day && s.slot === slot);
  let html = '<div class="cal-grid"><div class="cal-corner"></div>';
  DAYS.forEach((d) => (html += `<div class="cal-day">${d}</div>`));
  SLOTS.forEach((slot) => {
    html += `<div class="cal-slot"><strong>${slot.label}</strong><span>${slot.time}</span></div>`;
    DAYS.forEach((_, day) => {
      html += `<button type="button" class="cal-cell ${isSel(day, slot.key) ? 'on' : ''}"
        data-day="${day}" data-slot="${slot.key}"></button>`;
    });
  });
  return html + '</div>';
}
function wireCalendar(container, selected) {
  container.querySelectorAll('.cal-cell').forEach((cell) =>
    cell.addEventListener('click', () => {
      const day = Number(cell.dataset.day);
      const slot = cell.dataset.slot;
      const i = selected.findIndex((s) => s.day === day && s.slot === slot);
      const on = i < 0;
      if (on) selected.push({ day, slot });
      else selected.splice(i, 1);
      cell.classList.toggle('on', on);
    })
  );
}

// First paint (data streams in from the API and re-renders as it arrives).
render();
