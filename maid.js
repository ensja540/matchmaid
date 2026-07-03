// Maid portal. Runs on demo data so it works standalone; if a real session
// exists we greet that user, otherwise we fall back to the demo maid.
const { DAYS, SLOTS } = DEMO;
const profile = DEMO.maidProfile;
let enquiries = []; // real enquiries load from the API when logged in

// A logged-in maid always starts CLEAN and loads their own data from the API —
// the demo profile is only a fallback for the standalone (not-logged-in) view.
const sessionUser = Session.get();
const loggedIn = !!sessionUser?.id;

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
let verif = loggedIn ? { id: 'none', police: 'none', insurance: 'none' } : loadVerif();
let verifRead = {}; // OCR-extracted text per verification type (review aid)
const saveVerif = () => localStorage.setItem(VERIF_KEY, JSON.stringify(verif));

const displayName = sessionUser?.fullName || profile.fullName;
// Capitalise the first name for greetings (people often type it lower-case).
const firstName = (displayName.split(' ')[0] || '').replace(/^./, (c) => c.toUpperCase());
document.getElementById('who').textContent = `Hi, ${firstName}`;
// Show the admin link only for the operator account.
if (String(sessionUser?.email || '').toLowerCase() === 'ensor.jack@gmail.com') {
  const adminLink = document.getElementById('adminLink');
  if (adminLink) adminLink.hidden = false;
}
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
let avail = loggedIn ? [] : profile.availability.map((s) => ({ ...s }));
const areas = new Set(loggedIn ? [] : profile.areas); // specific suburbs (when narrowing)
let mpCity = 'Christchurch'; // default city
let mpSpecific = false; // false = whole-city ("Christchurch-wide")
const svcSet = new Set(loggedIn ? [] : profile.services); // service slugs offered
let mp = loggedIn
  ? { businessName: '', bio: '', rate: '', years: '', listingStatus: 'draft', avgRating: 0, reviews: 0 }
  : {
      businessName: profile.businessName,
      bio: profile.bio,
      rate: profile.rate,
      years: profile.yearsExperience,
      listingStatus: profile.listingStatus,
      avgRating: profile.rating,
      reviews: profile.reviews,
    };
// Load the real saved profile for the logged-in maid.
if (sessionUser?.id) {
  fetch(`/api/profile?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return;
      mp = {
        businessName: data.businessName ?? '',
        bio: data.bio ?? '',
        rate: data.rateMin ?? data.rateMax ?? '',
        years: data.years ?? '',
        listingStatus: data.listingStatus ?? 'draft',
        avgRating: data.avgRating ?? 0,
        reviews: data.reviews ?? 0,
      };
      areas.clear();
      (data.areas || []).forEach((a) => areas.add(a));
      // Infer the city and whether they've narrowed to specific suburbs.
      let best = 'Christchurch', bestN = -1;
      for (const c of Object.keys(DEMO.towns)) {
        const n = DEMO.towns[c].filter((s) => areas.has(s)).length;
        if (n > bestN) { bestN = n; best = c; }
      }
      mpCity = best;
      mpSpecific = areas.size > 0 && !DEMO.towns[mpCity].every((s) => areas.has(s));
      svcSet.clear();
      (data.services || []).forEach((s) => svcSet.add(s));
      render();
    })
    .catch(() => {});

  // Real verification statuses (document submissions + approvals).
  fetch(`/api/verifications?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => {
      if (!s) return;
      verifRead = s.read || {};
      ['id', 'police', 'insurance'].forEach((k) => { if (s[k]) verif[k] = s[k]; });
      render();
    })
    .catch(() => {});

  fetch(`/api/availability?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => { if (data?.slots) { avail = data.slots; render(); } })
    .catch(() => {});

  // Real enquiries addressed to this maid.
  fetch(`/api/enquiries?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((list) => { if (list) { enquiries = list.filter((e) => e.role === 'cleaner'); render(); } })
    .catch(() => {});
}

// ---- Messaging (real-time; same endpoints as the customer side) ----
let convos = [];
let msgCache = {};
let activeConvo = null;
const mHasFetch = typeof fetch !== 'undefined';
const mGet = (u) => (mHasFetch ? fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(r))) : Promise.reject());
function refreshConvos() {
  if (!sessionUser?.id) return Promise.resolve();
  return mGet(`/api/conversations?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((list) => { convos = list; })
    .catch(() => {});
}
function loadMsgs(id) {
  return mGet(`/api/messages?conversationId=${encodeURIComponent(id)}&userId=${encodeURIComponent(sessionUser.id)}`)
    .then((data) => { msgCache[id] = data.messages || []; })
    .catch(() => { msgCache[id] = []; });
}
async function openConvo(id) {
  activeConvo = id;
  if (msgCache[id] === undefined) await loadMsgs(id);
  render();
}
// Jump from an enquiry straight into its chat thread.
async function openEnquiryConvo(convId) {
  current = 'messages';
  tabs.querySelectorAll('.portal-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'messages'));
  if (convId) {
    activeConvo = convId;
    if (msgCache[convId] === undefined) await loadMsgs(convId);
  }
  render();
}
async function initMessages() {
  await refreshConvos();
  if (!activeConvo && convos[0]) activeConvo = convos[0].id;
  if (activeConvo) await loadMsgs(activeConvo);
  if (current === 'messages') render();
}
if (sessionUser?.id) initMessages();

let pollTimer = null;
const msgSig = (m) => (m ? m.length + '|' + (m[m.length - 1]?.body || '') : '0');
const convoSig = () => convos.map((c) => c.id + ':' + (c.lastBody || '')).join('~');
function startPolling() {
  if (pollTimer || !sessionUser?.id || !mHasFetch) return;
  pollTimer = setInterval(pollTick, 4000);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
async function pollTick() {
  if (current !== 'messages' || !sessionUser?.id) return;
  if (activeConvo) {
    const before = msgSig(msgCache[activeConvo]);
    await loadMsgs(activeConvo);
    if (current === 'messages' && msgSig(msgCache[activeConvo]) !== before) renderBubbles();
  }
  const bl = convoSig();
  await refreshConvos();
  if (current === 'messages' && convoSig() !== bl) renderConvoList();
}
function renderBubbles() {
  const el = panel.querySelector('#bubbles');
  if (!el) return;
  const nb = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  el.innerHTML = bubblesHTML(msgCache[activeConvo] ?? null);
  if (nb) el.scrollTop = el.scrollHeight;
}
function renderConvoList() {
  const el = panel.querySelector('.convo-list');
  if (!el) return;
  el.innerHTML = convoListHTML();
  bindConvoButtons();
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
  if (current === 'messages') {
    startPolling();
    const b = panel.querySelector('#bubbles');
    if (b) b.scrollTop = b.scrollHeight;
  } else {
    stopPolling();
  }
}

// ---------- Overview ----------
const PANELS = {
  overview() {
    const newCount = enquiries.filter((e) => e.status === 'new').length;
    return `
      <h1>Welcome ${firstName}!</h1>
      ${gettingStartedHTML()}
      <div class="trial-banner">
        <div class="trial-top">
          <strong>Free trial</strong>
          <span>Free for your first 3 months</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:33%"></div></div>
        <p class="muted">Full access with no fees for your first 3 months. After that it's a flat
          $40/month (or $60/month to be promoted to the top of results).</p>
      </div>

      <div class="dash-grid">
        <div class="stat-card"><span class="stat-num">${Number(mp.avgRating || 0).toFixed(1)}★</span><span class="stat-label">Rating (${mp.reviews || 0})</span></div>
        <div class="stat-card"><span class="stat-num">${newCount}</span><span class="stat-label">New enquiries</span></div>
        <div class="stat-card"><span class="stat-num">${avail.length}</span><span class="stat-label">Weekly slots open</span></div>
        <div class="stat-card"><span class="stat-num cap">${mp.listingStatus}</span><span class="stat-label">Listing status</span></div>
      </div>

      ${howflowHTML()}`;
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
      <div id="enqList">${enquiries.length
        ? enquiries.map(enquiryCard).join('')
        : '<p class="muted">No enquiries yet. When a client messages you from search, it lands here — exclusively yours.</p>'}</div>`;
  },

  messages() {
    const convo = convos.find((c) => c.id === activeConvo) || convos[0] || null;
    if (convo) activeConvo = convo.id;
    return `
      <h1>Messages</h1>
      <p class="wizard-lede">Chat directly with the clients who've reached out. Every conversation is exclusive to you.</p>
      <div class="msg-layout">
        <div class="convo-col">
          <div class="convo-list">${convoListHTML()}</div>
        </div>
        <div class="thread">
          ${
            convo
              ? threadHTML(convo, msgCache[convo.id] ?? null)
              : '<div class="bubbles"><p class="muted" style="margin:auto">When a client messages you, the conversation appears here.</p></div>'
          }
        </div>
      </div>`;
  },

  profile() {
    const svcChips = DEMO.services
      .map((s) => `<button type="button" class="chip select ${svcSet.has(s.slug) ? 'on' : ''}" data-svc="${s.slug}">${s.name}</button>`)
      .join('');
    return `
      <h1>Your profile</h1>
      <form class="profile-form" id="profileForm">
        <label class="field"><span>Business name</span><input name="business" value="${mp.businessName ?? ''}" /></label>
        <label class="field"><span>Bio</span><textarea name="bio" rows="3">${mp.bio ?? ''}</textarea></label>
        <label class="field"><span>Your desired hourly rate ($/hr)</span><input name="rate" type="number" value="${mp.rate ?? ''}" /></label>
        <label class="field"><span>Years experience</span><input name="years" type="number" value="${mp.years ?? ''}" /></label>
        ${locSectionHTML()}
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
    return `
      <h1>Subscription</h1>
      <div class="trial-banner">
        <strong>You're on the free trial</strong>
        <p class="muted">Listed free for your first 3 months — full access, no fees yet.</p>
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
          <button class="btn outline full" type="button" disabled>Coming soon</button>
        </div>
        <div class="plan featured">
          <p class="tag">Promoted</p>
          <p class="price">$60<span>/month</span></p>
          <ul class="checks">
            <li>Everything in Standard</li>
            <li><strong>Top of the list</strong> in your suburbs</li>
            <li>Promoted badge on your profile</li>
          </ul>
          <button class="btn solid full" type="button" disabled>Coming soon</button>
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
    panel.querySelectorAll('[data-start]').forEach((b) =>
      b.addEventListener('click', () => {
        current = b.dataset.start;
        tabs.querySelectorAll('.portal-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === current));
        render();
      })
    );
    panel.querySelectorAll('[data-open-convo]').forEach((b) =>
      b.addEventListener('click', () => openEnquiryConvo(b.dataset.openConvo))
    );
    initHowflow(panel);
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
      b.addEventListener('click', async () => {
        const enq = enquiries.find((e) => e.id === b.dataset.id);
        if (!enq) return;
        const status = b.dataset.act === 'accept' ? 'accepted' : 'declined';
        if (sessionUser?.id) {
          try {
            await fetch('/api/enquiry-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enquiryId: enq.id, userId: sessionUser.id, status }),
            });
          } catch {}
        }
        enq.status = status;
        render();
      })
    );
    panel.querySelectorAll('[data-client]').forEach((b) =>
      b.addEventListener('click', () => openClientModal(b.dataset.client))
    );
    panel.querySelectorAll('[data-open-convo]').forEach((b) =>
      b.addEventListener('click', () => openEnquiryConvo(b.dataset.openConvo))
    );
  },
  messages() {
    bindConvoButtons();
    const composer = panel.querySelector('#composer');
    composer?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = composer.body.value.trim();
      if (!t || !activeConvo || !sessionUser?.id) return;
      composer.body.value = '';
      try {
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: activeConvo, senderUserId: sessionUser.id, body: t }),
        });
        await loadMsgs(activeConvo);
        await refreshConvos();
      } catch {}
      render();
      const b = panel.querySelector('#bubbles');
      if (b) b.scrollTop = b.scrollHeight;
    });
  },
  profile() {
    panel.querySelectorAll('[data-svc]').forEach((c) =>
      c.addEventListener('click', () => {
        const slug = c.dataset.svc;
        if (svcSet.has(slug)) svcSet.delete(slug);
        else svcSet.add(slug);
        c.classList.toggle('on', svcSet.has(slug));
      })
    );
    wireLocSection();
    panel.querySelectorAll('[data-doc]').forEach((inp) =>
      inp.addEventListener('change', () => {
        const file = inp.files[0];
        if (!file || !sessionUser?.id) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const doc = inp.dataset.doc;
          verif[doc] = 'pending';
          render();
          // Read the document in the browser (never on the server — a corrupt
          // image can crash the OCR worker) so we can show what was scanned.
          const scanned = await ocrDocument(reader.result, file.type);
          if (scanned) { verifRead[doc] = scanned.slice(0, 160); render(); }
          try {
            const res = await fetch('/api/verification', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: sessionUser.id, type: doc, documentDataUrl: reader.result, extractedText: scanned || '' }),
            });
            const data = await res.json();
            if (data && data.read) { verifRead[doc] = data.read; render(); }
          } catch {}
        };
        reader.readAsDataURL(file);
      })
    );
    panel.querySelector('#profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      mp.businessName = f.business.value;
      mp.bio = f.bio.value;
      mp.rate = f.rate.value;
      mp.years = f.years.value;
      if (!sessionUser?.id) {
        setMsg('profMsg', 'Saved (demo — log in as a maid to save for real).', 'ok');
        return;
      }
      setMsg('profMsg', 'Saving…', 'pending');
      try {
        const res = await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: sessionUser.id,
            businessName: mp.businessName,
            bio: mp.bio,
            years: mp.years,
            rate: mp.rate,
            services: [...svcSet],
            areas: mpSpecific ? (DEMO.towns[mpCity] || []).filter((s) => areas.has(s)) : (DEMO.towns[mpCity] || []).slice(),
            listingStatus: 'active',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'save failed');
        setMsg('profMsg', "Saved to your profile — you're now live in search.", 'ok');
      } catch {
        setMsg('profMsg', 'Could not save — please try again.', 'err');
      }
    });
  },
  subscription() {
    // Plans aren't purchasable yet — buttons show "Coming soon" (disabled).
  },
};

// ---------- Helpers ----------
// Best-effort in-browser OCR (tesseract.js loaded from CDN). Runs client-side
// on purpose: a corrupt image can crash the OCR worker, and we'd rather that
// happen in one tab than take down the server. Returns null on anything but a
// readable image, and never throws.
async function ocrDocument(dataUrl, fileType) {
  try {
    if (typeof Tesseract === 'undefined') return null; // library not loaded
    if (fileType && !/^image\//.test(fileType)) return null; // PDFs etc: skip
    const { data } = await Tesseract.recognize(dataUrl, 'eng');
    const text = (data && data.text ? data.text : '').replace(/[ \t]+\n/g, '\n').trim();
    return text || null;
  } catch {
    return null;
  }
}

// "How Match Maid works" — six steps rendered as a scroll-driven zigzag
// timeline. Copy is fixed; emphasis (.hi) on exclusivity and the prices.
const HOWFLOW_STEPS = [
  { n: '01', h: 'Complete your profile', b: `Add your name, photo and a short bio so clients know who they're inviting in.` },
  { n: '02', h: 'Set your availability', b: `Update your weekly calendar with the mornings, middays and afternoons you can work; this is what matches you to clients.` },
  { n: '03', h: 'Set your price', b: `Add your hourly rate. You set it, and it's shown openly; no race to the bottom.` },
  { n: '04', h: 'Add your locations', b: `Search a town and toggle the suburbs you cover, or wider areas near you.` },
  { n: '05', h: `Get <span class="hi">exclusive</span> enquiries`, b: `Clients who want your services at your times reach out to <span class="hi">you alone</span>. Reply and arrange directly; <span class="hi">you keep 100%</span>.` },
  { n: '06', h: 'Free for your first 3 months', b: `Your first three months are free; after that it's a flat <span class="hi">$40/month</span> (or <span class="hi">$60 to be promoted</span>).` },
];

function howflowHTML() {
  return `<section class="howflow" id="howflow" aria-label="How Match Maid works">
    <h2 class="howflow-title">How Match Maid works</h2>
    <div class="howflow-body">
      <div class="howflow-track" aria-hidden="true"><span class="howflow-line-fill"></span></div>
      <ol class="howflow-steps">
        ${HOWFLOW_STEPS.map((s, i) => `<li class="howstep" data-side="${i % 2 === 0 ? 'left' : 'right'}">
          <div class="howstep-node"><span class="howbadge">${s.n}<i class="howspark" aria-hidden="true"></i></span></div>
          <div class="howstep-card">
            <h3>${s.h}</h3>
            <p>${s.b}</p>
          </div>
        </li>`).join('')}
      </ol>
    </div>
  </section>`;
}

// Scroll-driven motion for the flow: reveal each step on entry, grow the
// centre line with scroll. Guarded so the plain-DOM test harness (no
// IntersectionObserver / rAF / matchMedia) and reduced-motion both no-op safely.
let howObserver = null;
let howScrollBound = false;
const howflowSeen = new Set(); // step indices already revealed (survives re-renders)
function initHowflow(panel) {
  const section = panel.querySelector('#howflow');
  if (!section) return;
  const steps = section.querySelectorAll('.howstep');
  const fill = section.querySelector('.howflow-line-fill');
  const prefersReduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduce || typeof IntersectionObserver === 'undefined') {
    // Reduced motion or no observer support: leave everything visible (the
    // default), just fill the line. Never add `js-anim`, so nothing hides.
    if (fill && fill.style) fill.style.transform = 'scaleY(1)';
    return;
  }
  const stepArr = [...steps];
  // Opt in to the hidden start state only now that JS is driving the reveal.
  section.classList.add('js-anim');
  // Steps already revealed must not re-hide when the overview re-renders on
  // data loads — show those instantly, only observe the rest.
  stepArr.forEach((s, i) => { if (howflowSeen.has(i)) s.classList.add('in-view'); });
  if (howObserver) howObserver.disconnect();
  howObserver = new IntersectionObserver(
    (entries) => entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('in-view');
        howflowSeen.add(stepArr.indexOf(en.target));
        howObserver.unobserve(en.target);
      }
    }),
    { threshold: 0.18 } // fire once each step is ~18% into view
  );
  stepArr.forEach((s, i) => { if (!howflowSeen.has(i)) howObserver.observe(s); });

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const updateLine = () => {
    const sec = document.getElementById('howflow');
    const f = sec && sec.querySelector('.howflow-line-fill');
    if (!f) return;
    const rect = sec.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    f.style.transform = `scaleY(${clamp((vh * 0.55 - rect.top) / rect.height, 0, 1)})`;
  };
  if (!howScrollBound && typeof window !== 'undefined' && window.addEventListener && typeof requestAnimationFrame !== 'undefined') {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { updateLine(); ticking = false; });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    howScrollBound = true;
  }
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(updateLine);
}

// Guided onboarding: do-this-first checklist, ticks off from real data.
function gettingStartedHTML() {
  const profileSet = !!(mp.businessName && mp.businessName.trim() && mp.rate != null && String(mp.rate) !== '');
  const availSet = avail.length > 0;
  const steps = [
    { n: 1, label: 'Set your profile', desc: 'Add your business name, a short bio and your hourly rate.', tab: 'profile', done: profileSet },
    { n: 2, label: 'Set your availability', desc: 'Mark the mornings, afternoons and evenings you can work — this is what matches you to clients.', tab: 'availability', done: availSet },
    { n: 3, label: 'Choose where you work', desc: 'Christchurch-wide by default, or tick specific suburbs.', tab: 'profile', done: profileSet },
    { n: 4, label: 'Get verified', desc: 'Upload ID, a police check and insurance to earn trust badges.', tab: 'profile', done: ['id', 'police', 'insurance'].some((k) => verif[k] && verif[k] !== 'none') },
  ];
  // Once the profile itself is fully set up (details, availability and areas),
  // retire the whole get-started card — verification is a separate optional nudge.
  if (profileSet && availSet) return '';
  const doneCount = steps.filter((s) => s.done).length;
  return `<div class="panel-card getting-started">
    <div class="gs-head"><h2>Get started</h2><span class="gs-count">${doneCount} of ${steps.length} done</span></div>
    <div class="gs-steps">
      ${steps
        .map(
          (s) => `<div class="gs-step ${s.done ? 'done' : ''}">
            <span class="gs-num">${s.done ? '✓' : s.n}</span>
            <div class="gs-body"><strong>${s.label}</strong><span class="muted">${s.desc}</span></div>
            ${s.done ? '<span class="status status-accepted">Done</span>' : `<button class="btn solid sm" data-start="${s.tab}" type="button">Complete</button>`}
          </div>`
        )
        .join('')}
    </div>
  </div>`;
}

function enquiryRow(e) {
  return `<div class="enquiry-row clickable" data-open-convo="${e.conversationId || ''}" role="button" tabindex="0">
    <div><strong>${e.customer}</strong> · ${e.service}<br /><span class="muted">${e.suburb} · ${e.when}</span></div>
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
      <div><h3>${e.customer}</h3><p class="muted">${e.service} · ${e.suburb} · ${e.when}</p></div>
      <span class="status status-${e.status}">${e.status}</span>
    </div>
    <p class="enquiry-msg">“${e.message}”</p>
    <div class="enquiry-actions">
      <button class="btn solid sm" type="button" data-open-convo="${e.conversationId || ''}">Message</button>
      <button class="btn outline sm" type="button" data-client="${e.id}">View profile</button>
      ${actions}
    </div>
  </article>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function bubblesHTML(msgs) {
  return msgs == null
    ? '<p class="muted" style="margin:auto">Loading…</p>'
    : msgs.length
    ? msgs.map((m) => `<div class="bubble ${m.from}"><p>${escapeHtml(m.body)}</p><span>${m.at}</span></div>`).join('')
    : '<p class="muted" style="margin:auto">Say hello 👋</p>';
}
// Person's name, with their business (if any) on a second line underneath.
function withLabel(c) {
  return `${escapeHtml(c.with)}${c.withBusiness ? `<span class="with-biz">${escapeHtml(c.withBusiness)}</span>` : ''}`;
}
function threadHTML(c, msgs) {
  return `<div class="thread-head"><strong>${withLabel(c)}</strong></div>
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
            <strong>${withLabel(c)}</strong>
            <span class="muted">${escapeHtml((c.lastBody || '').slice(0, 36))}</span>
          </button>`
        )
        .join('')
    : '<p class="muted" style="padding:1rem">No conversations yet.</p>';
}
function bindConvoButtons() {
  panel.querySelectorAll('[data-convo]').forEach((b) =>
    b.addEventListener('click', () => openConvo(b.dataset.convo))
  );
}

// ---- Client vetting modal (from an enquiry) ----
const clientModal = document.getElementById('clientModal');
const clientModalBody = document.getElementById('clientModalBody');
document.getElementById('clientModalClose')?.addEventListener('click', () => { clientModal.hidden = true; });
clientModal?.addEventListener('click', (e) => { if (e.target === clientModal) clientModal.hidden = true; });

async function openClientModal(enquiryId) {
  if (!sessionUser?.id || !clientModal) return;
  clientModalBody.innerHTML = '<p class="muted">Loading…</p>';
  clientModal.hidden = false;
  try {
    const c = await mGet(
      `/api/client-view?enquiryId=${encodeURIComponent(enquiryId)}&userId=${encodeURIComponent(sessionUser.id)}`
    );
    clientModalBody.innerHTML = clientCardHTML(c);
  } catch {
    clientModalBody.innerHTML = '<p class="muted">Could not load this client’s profile.</p>';
  }
}
function clientCardHTML(c) {
  const home = [
    c.bedrooms && `${c.bedrooms} bed`,
    c.bathrooms && `${c.bathrooms} bath`,
    c.homeType,
    c.storeys,
    c.stairs ? 'stairs' : '',
    c.pets ? 'pets' : '',
  ].filter(Boolean).join(' · ');
  const fact = (label, val) => (val ? `<div class="cv-fact"><dt>${label}</dt><dd>${escapeHtml(val)}</dd></div>` : '');
  const initial = escapeHtml((c.fullName || '?').slice(0, 1).toUpperCase());
  return `
    <div class="cv-head">
      <div class="avatar lg">${c.photo ? `<img src="${escapeHtml(c.photo)}" alt="" />` : `<span>${initial}</span>`}</div>
      <div>
        <h2>${escapeHtml(c.fullName || 'Client')}</h2>
        <p class="muted" style="margin:0">${escapeHtml(c.suburb || 'Suburb not set')}</p>
      </div>
    </div>
    <dl class="cv-facts">
      ${fact('Home', home)}
      ${fact('Address', c.address)}
      ${fact('Phone', c.phone)}
      ${fact('Email', c.email)}
      ${fact('Notes &amp; access', c.notes)}
    </dl>`;
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
    : st === 'failed' ? '<span class="status status-new">Not accepted — re-upload</span>'
    : '<span class="status status-new">Not added</span>';
  // Verified badges are awarded on review; the maid can (re)submit a document
  // unless already verified.
  const label = st === 'pending' ? 'Replace document' : st === 'verified' ? '' : 'Upload document';
  const action = st === 'verified'
    ? ''
    : `<label class="btn outline sm doc-upload">${label}<input type="file" accept="image/*,application/pdf" data-doc="${item.key}" hidden /></label>`;
  const readTxt = verifRead[item.key];
  const readNote = readTxt && st === 'pending'
    ? `<p class="verif-read muted">Scanned from your document: “${escapeHtml(readTxt)}”. If that looks wrong, upload a clearer photo.</p>`
    : '';
  return `<div class="verif-item">
    <div><strong>${item.label}</strong><br /><span class="muted">${item.desc}</span>${readNote}</div>
    <div class="verif-item-right">${pill}${action}</div>
  </div>`;
}
// Location: pick a city (default Christchurch, whole-city) and optionally tick
// "specific suburbs" to narrow to chosen suburbs within that city.
function locSectionHTML() {
  const cityOpts = Object.keys(DEMO.towns)
    .map((c) => `<option value="${c}" ${c === mpCity ? 'selected' : ''}>${c}</option>`)
    .join('');
  return `<div class="field" id="locField">
    <span>Where you work</span>
    <select id="citySel" class="loc-city">${cityOpts}</select>
    <label class="check-inline" style="margin-top:0.7rem"><input type="checkbox" id="specificToggle" ${mpSpecific ? 'checked' : ''} /> I only want to work specific suburbs</label>
    <p class="loc-note muted" ${mpSpecific ? 'hidden' : ''}>Working <strong>${mpCity}-wide</strong> — clients anywhere in ${mpCity} can find you.</p>
    <div class="loc-picker" id="locPicker" ${mpSpecific ? '' : 'hidden'}>
      <div class="combo">
        <input type="text" id="subSearch" class="combo-input" placeholder="Search suburbs in ${mpCity}…" autocomplete="off" />
        <div class="combo-list" id="subResults" hidden></div>
      </div>
      <div class="area-chips" id="selectedAreas"></div>
    </div>
  </div>`;
}
function areaChipsHTML() {
  const chosen = (DEMO.towns[mpCity] || []).filter((s) => areas.has(s));
  if (!chosen.length) return '<span class="muted" style="font-size:0.85rem">No suburbs added yet — search above and add the ones you cover.</span>';
  return chosen
    .map((s) => `<span class="area-chip">${s}<button type="button" class="area-x" data-remove="${s}" aria-label="Remove ${s}">×</button></span>`)
    .join('');
}
function renderAreaChips() {
  const box = panel.querySelector('#selectedAreas');
  if (!box) return;
  box.innerHTML = areaChipsHTML();
  box.querySelectorAll('[data-remove]').forEach((b) =>
    b.addEventListener('click', () => { areas.delete(b.dataset.remove); renderAreaChips(); })
  );
}
function renderSubResults(q) {
  const box = panel.querySelector('#subResults');
  if (!box) return;
  const query = (q || '').trim().toLowerCase();
  const matches = (DEMO.towns[mpCity] || [])
    .filter((s) => !areas.has(s) && (!query || s.toLowerCase().includes(query)))
    .slice(0, 8);
  if (!matches.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = matches.map((s) => `<button type="button" class="combo-opt" data-add="${s}">${s}</button>`).join('');
  box.hidden = false;
  box.querySelectorAll('[data-add]').forEach((b) =>
    b.addEventListener('click', () => {
      areas.add(b.dataset.add);
      const inp = panel.querySelector('#subSearch');
      if (inp) { inp.value = ''; inp.focus(); }
      box.hidden = true;
      renderAreaChips();
    })
  );
}
function wireLocSection() {
  panel.querySelector('#citySel')?.addEventListener('change', (e) => { mpCity = e.target.value; rerenderLoc(); });
  panel.querySelector('#specificToggle')?.addEventListener('change', (e) => { mpSpecific = e.target.checked; rerenderLoc(); });
  const inp = panel.querySelector('#subSearch');
  if (inp) {
    inp.addEventListener('input', () => renderSubResults(inp.value));
    inp.addEventListener('focus', () => renderSubResults(inp.value));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const first = panel.querySelector('#subResults [data-add]'); if (first) first.click(); }
    });
    // Hide the dropdown shortly after leaving the field (delay lets a click land).
    inp.addEventListener('blur', () => setTimeout(() => { const box = panel.querySelector('#subResults'); if (box) box.hidden = true; }, 150));
  }
  renderAreaChips();
}
function rerenderLoc() {
  const f = panel.querySelector('#locField');
  if (!f) return;
  f.outerHTML = locSectionHTML();
  wireLocSection();
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
