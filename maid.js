// Maid portal. Runs on demo data so it works standalone; if a real session
// exists we greet that user, otherwise we fall back to the demo maid.
const { DAYS, SLOTS } = DEMO;
const profile = DEMO.maidProfile;
const enquiries = DEMO.enquiriesForMaid.map((e) => ({ ...e }));

// Verification process state (demo: persisted in localStorage).
const VERIF_KEY = 'mm_maid_verif';
const VERIF_ITEMS = [
  { key: 'id', label: 'ID verified', desc: 'Upload a photo of your driver licence or passport.' },
  { key: 'police', label: 'Police check', desc: 'Upload your NZ Police vetting result.' },
  { key: 'insurance', label: 'Insured', desc: 'Upload your public-liability insurance certificate.' },
];
function loadVerif() {
  try {
    const s = JSON.parse(localStorage.getItem(VERIF_KEY));
    if (s) return s;
  } catch {}
  return {
    id: DEMO.maidProfile.badges.id ? 'verified' : 'none',
    police: DEMO.maidProfile.badges.police ? 'verified' : 'none',
    insurance: DEMO.maidProfile.badges.insurance ? 'verified' : 'none',
  };
}
let verif = loadVerif();
const saveVerif = () => localStorage.setItem(VERIF_KEY, JSON.stringify(verif));

const sessionUser = Session.get();
const displayName = sessionUser?.fullName || profile.fullName;
document.getElementById('who').textContent = `Hi, ${displayName.split(' ')[0]} (maid)`;
document.getElementById('logout').addEventListener('click', () => {
  Session.clear();
  location.href = '/';
});
// Same account, other side: flip the session role and head to the hirer portal.
document.getElementById('switchSide')?.addEventListener('click', () => {
  const u = Session.get();
  if (u) { u.role = 'client'; Session.set(u); }
});

const panel = document.getElementById('panel');
const tabs = document.getElementById('tabs');
let current = 'overview';

// Availability is real: load the logged-in maid's saved slots from the API,
// and save changes back to the database. Falls back to demo when not logged in.
let avail = profile.availability.map((s) => ({ ...s }));
const areas = new Set(profile.areas); // suburbs the maid works in
if (sessionUser?.id) {
  fetch(`/api/availability?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => { if (data?.slots) { avail = data.slots; render(); } })
    .catch(() => {});
}

tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.portal-tab');
  if (!btn) return;
  current = btn.dataset.tab;
  tabs.querySelectorAll('.portal-tab').forEach((t) => t.classList.toggle('active', t === btn));
  render();
});

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
        <p class="muted">You're free until your 3rd match. ${remaining} to go, then it's a flat
          $40/month (or $60/month to be promoted to the top of results).</p>
      </div>

      <div class="dash-grid">
        <div class="stat-card"><span class="stat-num">${profile.rating.toFixed(1)}★</span><span class="stat-label">Rating (${profile.reviews})</span></div>
        <div class="stat-card"><span class="stat-num">${newCount}</span><span class="stat-label">New enquiries</span></div>
        <div class="stat-card"><span class="stat-num">${avail.length}</span><span class="stat-label">Weekly slots open</span></div>
        <div class="stat-card"><span class="stat-num cap">${profile.listingStatus}</span><span class="stat-label">Listing status</span></div>
      </div>

      <div class="panel-card">
        <h2>How Match Maid works</h2>
        <div class="howto"><ol class="steps">
          <li><span class="num">01</span><div><h3>Complete your profile</h3><p>Add your name, photo and a short bio so clients know who they're inviting in.</p></div></li>
          <li><span class="num">02</span><div><h3>Set your availability <em>(most important)</em></h3><p>Update your weekly calendar with the mornings, middays and afternoons you can work — this is what matches you to clients.</p></div></li>
          <li><span class="num">03</span><div><h3>Set your price</h3><p>Add your hourly rate. You set it, and it's shown openly — no race to the bottom.</p></div></li>
          <li><span class="num">04</span><div><h3>Add your locations</h3><p>Choose the suburbs you cover, or wider areas like Christchurch.</p></div></li>
          <li><span class="num">05</span><div><h3>Get exclusive enquiries</h3><p>Clients who want your services at your times reach out to you alone. Reply and arrange directly — you keep 100%.</p></div></li>
          <li><span class="num">06</span><div><h3>Free until your 3rd match</h3><p>Your first three successful matches are free; after that it's a flat $40/month (or $60 to be promoted).</p></div></li>
        </ol></div>
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
      <div class="cal" id="cal">${calendarHTML(avail)}</div>
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
        <div class="field"><span>Where you work</span>
          <input type="text" id="townSearch" class="loc-search" placeholder="Search a town or suburb (e.g. Christchurch, Rolleston)…" autocomplete="off" />
          <div class="loc-groups" id="locGroups">${locGroupsHTML('')}</div>
        </div>
        <div class="field"><span>Services you offer</span><div class="chip-select">${svcChips}</div></div>
        <div class="field"><span>Verification</span>
          <p class="muted" style="margin:0.2rem 0 0.8rem">Verified badges show on your listing and let clients filter for you. Add each one below — we review and approve it.</p>
          <div class="verif-list">${VERIF_ITEMS.map(verifRow).join('')}</div>
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
        <p class="muted">Listed free until your 3rd successful match. ${remaining} match${remaining === 1 ? '' : 'es'} to go.</p>
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
    wireCalendar(panel.querySelector('#cal'), avail, () => {
      setMsg('availMsg', 'Unsaved changes', 'pending');
    });
    panel.querySelector('#saveAvail').addEventListener('click', async () => {
      if (!sessionUser?.id) {
        setMsg('availMsg', `Saved (demo — log in as a maid to save for real). ${avail.length} slots set.`, 'ok');
        return;
      }
      setMsg('availMsg', 'Saving…', 'pending');
      try {
        const res = await fetch('/api/availability', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: sessionUser.id, slots: avail }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        setMsg('availMsg', `Saved — ${data.saved} slot${data.saved === 1 ? '' : 's'} on your profile. Customers can now match these times.`, 'ok');
      } catch {
        setMsg('availMsg', 'Could not save — please try again.', 'err');
      }
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
    const search = panel.querySelector('#townSearch');
    if (search) {
      search.addEventListener('input', () => {
        panel.querySelector('#locGroups').innerHTML = locGroupsHTML(search.value);
        wireLoc();
      });
    }
    wireLoc();
    panel.querySelectorAll('[data-verify]').forEach((b) =>
      b.addEventListener('click', () => { verif[b.dataset.verify] = 'pending'; saveVerif(); render(); })
    );
    panel.querySelectorAll('[data-approve]').forEach((b) =>
      b.addEventListener('click', () => { verif[b.dataset.approve] = 'verified'; saveVerif(); render(); })
    );
    panel.querySelectorAll('[data-remove]').forEach((b) =>
      b.addEventListener('click', () => { verif[b.dataset.remove] = 'none'; saveVerif(); render(); })
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
function verifRow(item) {
  const st = verif[item.key];
  const pill =
    st === 'verified' ? '<span class="status status-accepted">Verified ✓</span>'
    : st === 'pending' ? '<span class="status status-responded">Under review</span>'
    : '<span class="status status-new">Not added</span>';
  const action =
    st === 'none' ? `<button class="btn outline sm" data-verify="${item.key}" type="button">Add</button>`
    : st === 'pending' ? `<button class="btn solid sm" data-approve="${item.key}" type="button">Simulate approval</button>`
    : `<button class="btn outline sm" data-remove="${item.key}" type="button">Remove</button>`;
  return `<div class="verif-item">
    <div><strong>${item.label}</strong><br /><span class="muted">${item.desc}</span></div>
    <div class="verif-item-right">${pill}${action}</div>
  </div>`;
}
// Location picker: towns with their suburbs, filtered by a search box.
function locGroupsHTML(q) {
  q = (q || '').trim().toLowerCase();
  const groups = Object.entries(DEMO.towns)
    .map(([town, subs]) => {
      const townMatch = town.toLowerCase().includes(q);
      const shown = !q ? subs : townMatch ? subs : subs.filter((s) => s.toLowerCase().includes(q));
      if (!shown.length) return '';
      const chips = shown
        .map((s) => `<button type="button" class="chip select ${areas.has(s) ? 'on' : ''}" data-area="${s}">${s}</button>`)
        .join('');
      const allOn = subs.every((s) => areas.has(s));
      return `<div class="loc-group">
        <div class="loc-town"><strong>${town}</strong><button type="button" class="loc-all" data-town="${town}">${allOn ? 'Clear all' : 'Select all'}</button></div>
        <div class="loc-chips">${chips}</div>
      </div>`;
    })
    .filter(Boolean)
    .join('');
  return groups || '<p class="muted">No towns or suburbs match that search.</p>';
}
function wireLoc() {
  const groups = panel.querySelector('#locGroups');
  if (!groups) return;
  const refresh = () => {
    const q = panel.querySelector('#townSearch')?.value || '';
    groups.innerHTML = locGroupsHTML(q);
    wireLoc();
  };
  groups.querySelectorAll('[data-area]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = b.dataset.area;
      if (areas.has(s)) areas.delete(s);
      else areas.add(s);
      refresh();
    })
  );
  groups.querySelectorAll('[data-town]').forEach((b) =>
    b.addEventListener('click', () => {
      const subs = DEMO.towns[b.dataset.town] || [];
      const allOn = subs.every((s) => areas.has(s));
      subs.forEach((s) => (allOn ? areas.delete(s) : areas.add(s)));
      refresh();
    })
  );
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

// Everything above is defined — safe to do the first render now.
render();
