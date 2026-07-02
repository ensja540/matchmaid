// Customer portal. Runs on demo data so it works standalone.
const { DAYS, SLOTS } = DEMO;
const customer = DEMO.customerProfile;

const sessionUser = Session.get();
const displayName = sessionUser?.fullName || customer.fullName;
document.getElementById('who').textContent = `Hi, ${displayName.split(' ')[0]} (customer)`;
document.getElementById('logout').addEventListener('click', () => {
  Session.clear();
  location.href = '/';
});

const panel = document.getElementById('panel');
const tabs = document.getElementById('tabs');
let current = 'overview';

// Find-a-cleaner working state
const find = { suburb: customer.defaultSuburb, service: 'regular', desiredRate: 35, slots: [], ran: false };

// ---- Persistent chat store (localStorage — kept indefinitely per browser) ----
const CHATS_KEY = 'mm_chats';
function loadChats() {
  try {
    const s = JSON.parse(localStorage.getItem(CHATS_KEY));
    if (Array.isArray(s)) return s;
  } catch {}
  const seed = DEMO.conversations.map((c) => ({
    id: c.id, with: c.with, cleanerId: c.cleanerId, messages: c.messages.map((m) => ({ ...m })),
  }));
  localStorage.setItem(CHATS_KEY, JSON.stringify(seed));
  return seed;
}
let chats = loadChats();
const saveChats = () => localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
function getOrCreateChat(name, cleanerId) {
  let c = chats.find((x) => x.with === name);
  if (!c) {
    c = { id: 'c' + Date.now(), with: name, cleanerId: cleanerId || null, messages: [] };
    chats.unshift(c);
    saveChats();
  }
  return c;
}
let activeConvo = chats[0]?.id || null;

// ---- Persistent customer profile (localStorage) ----
const CPROF_KEY = 'mm_customer_profile';
const PROFILE_DEFAULTS = {
  photo: '', fullName: displayName, email: customer.email, phone: '',
  suburb: customer.defaultSuburb, address: customer.address,
  bedrooms: '3', bathrooms: '1', stairs: false, homeType: 'House', notes: customer.notes,
};
function loadCProfile() {
  try { return { ...PROFILE_DEFAULTS, ...JSON.parse(localStorage.getItem(CPROF_KEY)) }; } catch { return { ...PROFILE_DEFAULTS }; }
}
let cprof = loadCProfile();
const saveCProfile = () => localStorage.setItem(CPROF_KEY, JSON.stringify(cprof));

// Arriving from browse "Contact {cleaner}" opens that chat.
const pendingChat = localStorage.getItem('mm_pending_chat');
if (pendingChat) {
  const cl = DEMO.cleaners.find((c) => c.name === pendingChat);
  activeConvo = getOrCreateChat(pendingChat, cl?.id).id;
  localStorage.removeItem('mm_pending_chat');
  current = 'messages';
}

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

render();
function render() {
  panel.innerHTML = PANELS[current]();
  WIRE[current]?.();
}

const PANELS = {
  overview() {
    const saved = DEMO.savedCleaners
      .map((id) => DEMO.cleaners.find((c) => c.id === id))
      .filter(Boolean);
    return `
      <h1>Welcome, ${displayName.split(' ')[0]}.</h1>
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
          <li><span class="num">02</span><div><h3>Compare openly</h3><p>Check each maid's hourly rate, rating, reviews and verified badges. Nothing hidden.</p></div></li>
          <li><span class="num">03</span><div><h3>Contact your pick</h3><p>Message the single cleaner you like — no bidding wars, no shared leads.</p></div></li>
          <li><span class="num">04</span><div><h3>Arrange it directly</h3><p>Agree the day, time and price between you. Payment stays between you and your cleaner.</p></div></li>
          <li><span class="num">05</span><div><h3>Review after the clean</h3><p>Rate cleanliness, value and punctuality to help the next household choose well.</p></div></li>
        </ol></div>
      </div>

      <div class="panel-card">
        <h2>Your enquiries</h2>
        ${DEMO.customerEnquiries
          .map(
            (e) => `<div class="enquiry-row">
              <div><strong>${e.cleaner}</strong> · ${e.service}<br /><span class="muted">${e.when}</span></div>
              <span class="status status-${e.status}">${e.status}</span>
            </div>`
          )
          .join('')}
      </div>

      <div class="panel-card">
        <h2>Saved cleaners</h2>
        <div class="results">${saved.map((c) => savedRow(c)).join('')}</div>
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
            <select name="suburb">${DEMO.suburbs.map((s) => opt(s, s, find.suburb)).join('')}</select>
          </label>
          <label class="field"><span>Service</span>
            <select name="service">${DEMO.services.map((s) => opt(s.slug, s.name, find.service)).join('')}</select>
          </label>
        </div>
        <label class="field"><span>Ideal hourly rate: <strong id="rateOut">$${find.desiredRate}/hr</strong></span>
          <input type="range" id="rate" min="20" max="80" value="${find.desiredRate}" />
        </label>
        <div class="field"><span>When suits you? (optional)</span>
          <div class="cal" id="cal">${calendarHTML(find.slots)}</div>
        </div>
        <button class="btn solid" type="submit">Show my matches</button>
      </form>
      <div id="findResults" class="results">${find.ran ? renderResults() : ''}</div>`;
  },

  messages() {
    const convo = chats.find((c) => c.id === activeConvo) || chats[0];
    const unmessaged = DEMO.cleaners.filter((c) => !chats.some((ch) => ch.with === c.name));
    return `
      <h1>Messages</h1>
      <p class="wizard-lede">Chat directly with any cleaner on Match Maid. Your history is saved and stays here.</p>
      <div class="msg-layout">
        <div class="convo-col">
          <form class="new-chat" id="newChat">
            <select id="newCleaner">${
              unmessaged.length
                ? unmessaged.map((c) => `<option value="${c.name}">${c.name}</option>`).join('')
                : '<option value="">All cleaners messaged</option>'
            }</select>
            <button class="btn outline sm" type="submit" ${unmessaged.length ? '' : 'disabled'}>New</button>
          </form>
          <div class="convo-list">
            ${
              chats.length
                ? chats
                    .map(
                      (c) => `<button type="button" class="convo ${c.id === activeConvo ? 'active' : ''}" data-convo="${c.id}">
                        <strong>${c.with}</strong>
                        <span class="muted">${lastLine(c)}</span>
                      </button>`
                    )
                    .join('')
                : '<p class="muted" style="padding:1rem">No chats yet.</p>'
            }
          </div>
        </div>
        <div class="thread">
          ${
            convo
              ? threadHTML(convo)
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
          <label class="field"><span>Suburb</span><select name="suburb">${DEMO.suburbs.map((s) => opt(s, s, cprof.suburb)).join('')}</select></label>
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
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      find.suburb = form.suburb.value;
      find.service = form.service.value;
      find.ran = true;
      panel.querySelector('#findResults').innerHTML = renderResults();
      panel.querySelectorAll('#findResults [data-save]').forEach(saveBtnWire);
    });
  },
  messages() {
    panel.querySelectorAll('[data-convo]').forEach((b) =>
      b.addEventListener('click', () => {
        activeConvo = b.dataset.convo;
        render();
      })
    );
    const nc = panel.querySelector('#newChat');
    nc?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = panel.querySelector('#newCleaner').value;
      if (!name) return;
      const cl = DEMO.cleaners.find((c) => c.name === name);
      activeConvo = getOrCreateChat(name, cl?.id).id;
      render();
    });
    const composer = panel.querySelector('#composer');
    composer?.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = composer.body.value.trim();
      if (!t) return;
      const c = chats.find((x) => x.id === activeConvo);
      c.messages.push({ from: 'me', body: t, at: nowLabel() });
      saveChats();
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
    panel.querySelector('#profileForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      Object.assign(cprof, {
        fullName: f.fullName.value, email: f.email.value, phone: f.phone.value,
        suburb: f.suburb.value, address: f.address.value,
        bedrooms: f.bedrooms.value, bathrooms: f.bathrooms.value,
        homeType: f.homeType.value, stairs: f.stairs.checked, notes: f.notes.value,
      });
      saveCProfile();
      const el = panel.querySelector('#profMsg');
      el.textContent = 'Saved. Your profile is stored on this device.';
      el.className = 'save-msg ok';
    });
  },
};

// ---------- Results ----------
function renderResults() {
  const scored = DEMO.cleaners
    .map((c) => DEMO.scoreCleaner(c, find))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || Number(b.featured) - Number(a.featured) || b.rating - a.rating);

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
  const slotChips = r.matched
    .map((m) => `<span class="chip on">${DAYS[m.day]} ${SLOTS.find((s) => s.key === m.slot).label}</span>`)
    .join('');
  return `<article class="result ${r.featured ? 'featured' : ''}">
    <div class="result-head">
      <div><h3>${r.name} ${r.featured ? '<span class="pin">Promoted</span>' : ''}</h3>
        <p class="result-meta">★ ${r.rating.toFixed(1)} (${r.reviews}) · $${r.rate}/hr</p></div>
      <span class="tier tier-${r.tier}">${tierLabel}</span>
    </div>
    ${badges.length ? `<p class="verif">${badges.map((b) => `<span class="chip">${b}</span>`).join('')}</p>` : ''}
    ${r.requestedCount > 0 && r.matched.length ? `<div class="chips">${slotChips}</div>` : ''}
    ${r.requestedCount > 0 && !r.matched.length ? `<p class="no-overlap">Not free at your chosen times, ask about other slots.</p>` : ''}
    <div class="result-actions"><button class="btn solid sm" type="button">Contact ${r.name.split(/['\s]/)[0]}</button></div>
  </article>`;
}

function savedRow(c) {
  return `<article class="result">
    <div class="result-head">
      <div><h3>${c.name}</h3><p class="result-meta">★ ${c.rating.toFixed(1)} (${c.reviews}) · $${c.rate}/hr · ${c.areas.join(', ')}</p></div>
      <button class="btn outline sm" type="button">Contact</button>
    </div>
  </article>`;
}

function saveBtnWire() {}

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
function nowLabel() {
  return new Date().toLocaleString('en-NZ', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}
function lastLine(c) {
  const m = c.messages[c.messages.length - 1];
  return m ? escapeHtml(m.body.slice(0, 36)) + (m.body.length > 36 ? '…' : '') : 'New conversation';
}
function threadHTML(c) {
  return `<div class="thread-head"><strong>${c.with}</strong></div>
    <div class="bubbles" id="bubbles">
      ${
        c.messages.length
          ? c.messages.map((m) => `<div class="bubble ${m.from}"><p>${escapeHtml(m.body)}</p><span>${m.at}</span></div>`).join('')
          : '<p class="muted" style="margin:auto">Say hi 👋</p>'
      }
    </div>
    <form class="composer" id="composer">
      <input name="body" placeholder="Write a message…" autocomplete="off" />
      <button class="btn solid" type="submit">Send</button>
    </form>`;
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
