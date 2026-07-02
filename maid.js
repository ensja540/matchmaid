// Maid portal. Runs on demo data so it works standalone; if a real session
// exists we greet that user, otherwise we fall back to the demo maid.
const { DAYS, SLOTS } = DEMO;
const profile = DEMO.maidProfile;
const enquiries = DEMO.enquiriesForMaid.map((e) => ({ ...e }));

const sessionUser = Session.get();
const displayName = sessionUser?.fullName || profile.fullName;
document.getElementById('who').textContent = `Hi, ${displayName.split(' ')[0]} (maid)`;
document.getElementById('logout').addEventListener('click', () => {
  Session.clear();
  location.href = '/';
});

const panel = document.getElementById('panel');
const tabs = document.getElementById('tabs');
let current = 'overview';

tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.portal-tab');
  if (!btn) return;
  current = btn.dataset.tab;
  tabs.querySelectorAll('.portal-tab').forEach((t) => t.classList.toggle('active', t === btn));
  render();
});

render();
function render() {
  panel.innerHTML = PANELS[current]();
  WIRE[current]?.();
}

// ---------- Overview ----------
const PANELS = {
  overview() {
    const newCount = enquiries.filter((e) => e.status === 'new').length;
    const remaining = Math.max(0, profile.matchesTarget - profile.matchesUsed);
    const pct = Math.round((profile.matchesUsed / profile.matchesTarget) * 100);
    return `
      <h1>Welcome back, ${displayName.split(' ')[0]}.</h1>
      <div class="trial-banner">
        <div class="trial-top">
          <strong>Free trial</strong>
          <span>${profile.matchesUsed} of ${profile.matchesTarget} successful matches used</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <p class="muted">You're free until your 5th match. ${remaining} to go, then it's a flat
          $40/month (or $60/month to be promoted to the top of results).</p>
      </div>

      <div class="dash-grid">
        <div class="stat-card"><span class="stat-num">${profile.rating.toFixed(1)}★</span><span class="stat-label">Rating (${profile.reviews})</span></div>
        <div class="stat-card"><span class="stat-num">${newCount}</span><span class="stat-label">New enquiries</span></div>
        <div class="stat-card"><span class="stat-num">${profile.availability.length}</span><span class="stat-label">Weekly slots open</span></div>
        <div class="stat-card"><span class="stat-num cap">${profile.listingStatus}</span><span class="stat-label">Listing status</span></div>
      </div>

      <div class="panel-card">
        <div class="panel-card-head">
          <h2>Latest enquiries</h2>
          <button class="btn outline sm" data-goto="enquiries" type="button">View all</button>
        </div>
        ${enquiries.slice(0, 2).map(enquiryRow).join('')}
      </div>`;
  },

  availability() {
    return `
      <h1>Your weekly availability</h1>
      <p class="wizard-lede">Tap the times you're usually free. Customers match to you when they
        want a clean at a time you're available.</p>
      <div class="cal" id="cal">${calendarHTML(profile.availability)}</div>
      <div class="save-row">
        <button class="btn solid" id="saveAvail" type="button">Save availability</button>
        <span class="save-msg" id="availMsg"></span>
      </div>`;
  },

  enquiries() {
    return `
      <h1>Enquiries</h1>
      <p class="wizard-lede">Each enquiry is exclusive to you, no bidding against anyone else.</p>
      <div id="enqList">${enquiries.map(enquiryCard).join('')}</div>`;
  },

  profile() {
    const areaChips = DEMO.suburbs
      .map((s) => chip(s, profile.areas.includes(s), 'area'))
      .join('');
    const svcChips = DEMO.services
      .map((s) => chip(s.name, profile.services.includes(s.slug), 'svc'))
      .join('');
    return `
      <h1>Your profile</h1>
      <form class="profile-form" id="profileForm">
        <label class="field"><span>Business name</span><input name="business" value="${profile.businessName}" /></label>
        <label class="field"><span>Bio</span><textarea name="bio" rows="3">${profile.bio}</textarea></label>
        <div class="field-row">
          <label class="field"><span>Hourly rate ($)</span><input name="rate" type="number" value="${profile.rate}" /></label>
          <label class="field"><span>Years experience</span><input name="years" type="number" value="${profile.yearsExperience}" /></label>
        </div>
        <div class="field"><span>Suburbs you cover</span><div class="chip-select">${areaChips}</div></div>
        <div class="field"><span>Services you offer</span><div class="chip-select">${svcChips}</div></div>
        <div class="field"><span>Verification</span>
          <p class="verif">
            ${badge('ID', profile.badges.id)} ${badge('Police', profile.badges.police)} ${badge('Insured', profile.badges.insurance)}
          </p>
        </div>
        <div class="save-row">
          <button class="btn solid" type="submit">Save profile</button>
          <span class="save-msg" id="profMsg"></span>
        </div>
      </form>`;
  },

  subscription() {
    const remaining = Math.max(0, profile.matchesTarget - profile.matchesUsed);
    return `
      <h1>Subscription</h1>
      <div class="trial-banner">
        <strong>You're on the free trial</strong>
        <p class="muted">Listed free until your 5th successful match. ${remaining} match${remaining === 1 ? '' : 'es'} to go.</p>
      </div>
      <div class="plan-cards">
        <div class="plan">
          <p class="tag">Standard</p>
          <p class="price">$40<span>/month</span></p>
          <ul class="checks">
            <li>Stay listed in your suburbs</li>
            <li>Unlimited exclusive enquiries</li>
            <li>No commission on any job</li>
          </ul>
          <button class="btn outline full" type="button" data-plan="standard">Choose Standard</button>
        </div>
        <div class="plan featured">
          <p class="tag">Promoted</p>
          <p class="price">$60<span>/month</span></p>
          <ul class="checks">
            <li>Everything in Standard</li>
            <li><strong>Top of the list</strong> in your suburbs</li>
            <li>Promoted badge on your profile</li>
          </ul>
          <button class="btn solid full" type="button" data-plan="promoted">Choose Promoted</button>
        </div>
      </div>
      <p class="save-msg" id="planMsg"></p>`;
  },
};

// ---------- Wiring ----------
const WIRE = {
  overview() {
    panel.querySelector('[data-goto]')?.addEventListener('click', () => {
      current = 'enquiries';
      tabs.querySelectorAll('.portal-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'enquiries'));
      render();
    });
  },
  availability() {
    wireCalendar(panel.querySelector('#cal'), profile.availability, () => {
      setMsg('availMsg', 'Unsaved changes', 'pending');
    });
    panel.querySelector('#saveAvail').addEventListener('click', () => {
      setMsg('availMsg', `Saved (demo). ${profile.availability.length} slots set.`, 'ok');
    });
  },
  enquiries() {
    panel.querySelectorAll('[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        const enq = enquiries.find((e) => e.id === b.dataset.id);
        if (!enq) return;
        if (b.dataset.act === 'accept') enq.status = 'accepted';
        if (b.dataset.act === 'decline') enq.status = 'declined';
        render();
      })
    );
  },
  profile() {
    panel.querySelectorAll('.chip-select .chip').forEach((c) =>
      c.addEventListener('click', () => c.classList.toggle('on'))
    );
    panel.querySelector('#profileForm').addEventListener('submit', (e) => {
      e.preventDefault();
      setMsg('profMsg', 'Saved (demo). Your profile is up to date.', 'ok');
    });
  },
  subscription() {
    panel.querySelectorAll('[data-plan]').forEach((b) =>
      b.addEventListener('click', () => {
        const label = b.dataset.plan === 'promoted' ? 'Promoted ($60/mo)' : 'Standard ($40/mo)';
        setMsg('planMsg', `Selected ${label} (demo). You'd be taken to secure checkout here.`, 'ok');
      })
    );
  },
};

// ---------- Helpers ----------
function enquiryRow(e) {
  return `<div class="enquiry-row">
    <div><strong>${e.customer}</strong> · ${e.service}<br /><span class="muted">${e.suburb} · ${e.preferred}</span></div>
    <span class="status status-${e.status}">${e.status}</span>
  </div>`;
}

function enquiryCard(e) {
  const actions =
    e.status === 'new'
      ? `<button class="btn solid sm" data-act="accept" data-id="${e.id}" type="button">Accept</button>
         <button class="btn outline sm" data-act="decline" data-id="${e.id}" type="button">Decline</button>`
      : `<span class="status status-${e.status}">${e.status}</span>`;
  return `<article class="enquiry">
    <div class="enquiry-head">
      <div><h3>${e.customer}</h3><p class="muted">${e.service} · ${e.suburb} · ${e.preferred} · ${e.frequency}</p></div>
      <span class="status status-${e.status}">${e.status}</span>
    </div>
    <p class="enquiry-msg">“${e.message}”</p>
    <div class="enquiry-actions">${actions}</div>
  </article>`;
}

function chip(label, on, kind) {
  return `<button type="button" class="chip select ${on ? 'on' : ''}" data-kind="${kind}">${label}</button>`;
}
function badge(label, on) {
  return `<span class="chip ${on ? 'on' : 'off'}">${on ? '✓ ' : '✗ '}${label}</span>`;
}
function setMsg(id, text, cls) {
  const el = panel.querySelector('#' + id);
  if (el) {
    el.textContent = text;
    el.className = 'save-msg ' + (cls || '');
  }
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
function wireCalendar(container, selected, onChange) {
  container.querySelectorAll('.cal-cell').forEach((cell) =>
    cell.addEventListener('click', () => {
      const day = Number(cell.dataset.day);
      const slot = cell.dataset.slot;
      const i = selected.findIndex((s) => s.day === day && s.slot === slot);
      const on = i < 0;
      if (on) selected.push({ day, slot });
      else selected.splice(i, 1);
      cell.classList.toggle('on', on);
      onChange?.();
    })
  );
}
