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
let activeConvo = DEMO.conversations[0].id;

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
    const convo = DEMO.conversations.find((c) => c.id === activeConvo);
    return `
      <h1>Messages</h1>
      <div class="msg-layout">
        <div class="convo-list">
          ${DEMO.conversations
            .map(
              (c) => `<button type="button" class="convo ${c.id === activeConvo ? 'active' : ''}" data-convo="${c.id}">
                <strong>${c.with}</strong>
                <span class="muted">${c.messages[c.messages.length - 1].body.slice(0, 38)}…</span>
                ${c.unread ? `<span class="unread">${c.unread}</span>` : ''}
              </button>`
            )
            .join('')}
        </div>
        <div class="thread">
          <div class="thread-head"><strong>${convo.with}</strong></div>
          <div class="bubbles" id="bubbles">
            ${convo.messages.map((m) => `<div class="bubble ${m.from}"><p>${m.body}</p><span>${m.at}</span></div>`).join('')}
          </div>
          <form class="composer" id="composer">
            <input name="body" placeholder="Write a message…" autocomplete="off" />
            <button class="btn solid" type="submit">Send</button>
          </form>
        </div>
      </div>`;
  },

  profile() {
    return `
      <h1>Your profile</h1>
      <form class="profile-form" id="profileForm">
        <div class="field-row">
          <label class="field"><span>Full name</span><input name="name" value="${displayName}" /></label>
          <label class="field"><span>Email</span><input name="email" type="email" value="${customer.email}" /></label>
        </div>
        <label class="field"><span>Default suburb</span>
          <select name="suburb">${DEMO.suburbs.map((s) => opt(s, s, customer.defaultSuburb)).join('')}</select>
        </label>
        <label class="field"><span>Address</span><input name="address" value="${customer.address}" /></label>
        <label class="field"><span>Notes for your cleaner</span><textarea name="notes" rows="2">${customer.notes}</textarea></label>
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
        const c = DEMO.conversations.find((x) => x.id === activeConvo);
        if (c) c.unread = 0;
        render();
      })
    );
    const composer = panel.querySelector('#composer');
    composer.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = composer.body.value.trim();
      if (!text) return;
      const convo = DEMO.conversations.find((c) => c.id === activeConvo);
      convo.messages.push({ from: 'me', body: text, at: 'Just now' });
      render();
    });
  },
  profile() {
    panel.querySelector('#profileForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const el = panel.querySelector('#profMsg');
      el.textContent = 'Saved (demo). Your details are up to date.';
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
