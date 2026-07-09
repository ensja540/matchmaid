// Customer portal — fully backed by the real API (no demo data).
// Reference constants (calendar labels, service catalogue) still come from DEMO.
const { DAYS, SLOTS } = DEMO;

const sessionUser = Session.get();
const uid = sessionUser?.id && sessionUser.id !== 'demo' ? sessionUser.id : null;
const displayName = sessionUser?.fullName || 'there';
const firstName = (displayName.split(' ')[0] || '').replace(/^./, (c) => c.toUpperCase());
document.getElementById('who').textContent = `Hi, ${firstName}`;
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
// products: null = follow the saved profile preference; true/false = the
// customer overrode it on the find form this session.
const find = { loc: 'town:Christchurch', locLabel: 'Christchurch (all)', service: 'regular', extras: [], desiredRate: 35, slots: [], products: null, ran: false, results: [], sort: 'relevance' };
const needsProducts = () => (find.products == null ? !!cprof.needsProducts : find.products);
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
let suburbList = DEMO.suburbs.slice();
let directory = []; // active cleaners (for the messages picker)
let convos = []; // this user's conversations
let msgCache = {}; // conversationId -> messages[]
let reviewCache = {}; // conversationId -> review | null (undefined = not loaded)
let activeConvo = null;
let starredIds = new Set(); // cleaner ids this customer has starred
let starredList = []; // starred cleaners with details (for the My cleaners tab)

// "How Match Maid works" — customer steps as a scroll-driven zigzag timeline
// (same component as the maid side, customer copy).
const HOWFLOW_STEPS = [
  { n: '01', h: 'Search your area', b: `Choose your suburb and the type of clean to see local maids, <span class="hi">best match first</span>.` },
  { n: '02', h: 'Compare openly', b: `Check each maid's rate, rating, reviews and verified badges. <span class="hi">Nothing hidden</span>.` },
  { n: '03', h: 'Contact your pick', b: `Message the single cleaner you like — <span class="hi">no bidding wars</span>, no shared leads.` },
  { n: '04', h: 'Arrange it directly', b: `Agree the day, time and price <span class="hi">between you</span>. Payment stays between you and your cleaner.` },
  { n: '05', h: 'Review after the clean', b: `Rate cleanliness, value and punctuality to help <span class="hi">the next household</span> choose well.` },
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

// Scroll-driven reveal + centre-line growth. Default markup is fully visible;
// JS opts in to the hidden start state via `.js-anim`, so no-JS users see all.
let howObserver = null;
let howScrollBound = false;
const howflowSeen = new Set(); // step indices already revealed (survives re-renders)
function initHowflow(panel) {
  const section = panel.querySelector('#howflow');
  if (!section) return;
  const steps = [...section.querySelectorAll('.howstep')];
  const fill = section.querySelector('.howflow-line-fill');
  const prefersReduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduce || typeof IntersectionObserver === 'undefined') {
    steps.forEach((s) => s.classList.add('in-view'));
    if (fill && fill.style) fill.style.transform = 'scaleY(1)';
    return;
  }
  section.classList.add('js-anim');
  // The overview re-renders as data loads; steps already revealed must NOT
  // re-hide (that flicker is the "buggy on load"). Show seen ones instantly,
  // only observe the rest.
  steps.forEach((s, i) => { if (howflowSeen.has(i)) s.classList.add('in-view'); });
  if (howObserver) howObserver.disconnect();
  howObserver = new IntersectionObserver(
    (entries) => entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('in-view');
        howflowSeen.add(steps.indexOf(en.target));
        howObserver.unobserve(en.target);
      }
    }),
    { threshold: 0.18 } // fire once each step is ~18% into view
  );
  steps.forEach((s, i) => { if (!howflowSeen.has(i)) howObserver.observe(s); });

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

// New accounts start clean — only the name/email (the user's own account data)
// are pre-filled; everything about their home is blank until they set it.
const PROFILE_DEFAULTS = {
  photo: '', fullName: sessionUser?.fullName || '', email: sessionUser?.email || '', phone: '',
  suburb: '', address: '', bedrooms: '', bathrooms: '', stairs: false, pets: false, needsProducts: false, storeys: '', homeType: '', notes: '',
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
    .then((data) => { cprof = { ...PROFILE_DEFAULTS, ...data }; reRenderIf('profile', 'find'); })
    .catch(() => {});
}
function loadFavourites() {
  getJSON(`/api/favourites?userId=${encodeURIComponent(uid)}`)
    .then((list) => {
      starredList = Array.isArray(list) ? list : [];
      starredIds = new Set(starredList.map((c) => c.id));
      reRenderIf('mycleaners', 'find');
    })
    .catch(() => {});
}
// Star / unstar a cleaner, then keep My cleaners + any star buttons in sync.
function toggleStar(cleanerId, name) {
  if (!uid || !cleanerId) return;
  const wasStarred = starredIds.has(cleanerId);
  if (wasStarred) {
    starredIds.delete(cleanerId);
    starredList = starredList.filter((c) => c.id !== cleanerId);
  } else {
    starredIds.add(cleanerId);
    if (name && !starredList.some((c) => c.id === cleanerId)) starredList.unshift({ id: cleanerId, name });
  }
  render();
  postJSON('/api/favourites', { userId: uid, cleanerId, starred: !wasStarred })
    .then(() => loadFavourites())
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
const apiContact = (cleanerId, message, serviceSlug, suburb) =>
  postJSON('/api/contact', {
    clientUserId: uid,
    cleanerId,
    message,
    serviceSlug: serviceSlug || find.service,
    suburb: suburb || cprof.suburb || find.suburb,
  }).then((d) => d.conversationId);

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
  let pendingContact = null;
  if (pending) {
    localStorage.removeItem('mm_pending_contact');
    try { pendingContact = JSON.parse(pending); } catch {}
  }
  if (!activeConvo && convos[0]) activeConvo = convos[0].id;
  if (activeConvo) await loadMsgs(activeConvo);
  render();
  // Came from browse via "Contact" — open the official enquiry form for them.
  if (pendingContact && pendingContact.id) openEnquiryModal(pendingContact.id, pendingContact.name);
}

// Kick off all loads for the logged-in customer.
if (uid) {
  loadSuburbs();
  loadDirectory();
  loadProfile();
  loadFavourites();
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
      <h1>Welcome, ${escapeHtml(firstName)}.</h1>
      <div class="cta-card">
        <div>
          <h2>Need a clean?</h2>
          <p class="muted">Search local maids, compare rates openly, and contact just the one you choose.</p>
        </div>
        <button class="btn solid" data-goto="find" type="button">Find a cleaner</button>
      </div>

      ${howflowHTML()}`;
  },

  // Only the cleaners this customer has starred. Empty until they star someone —
  // people they've merely messaged live in the Messages tab, not here.
  mycleaners() {
    return `
      <h1>My cleaners</h1>
      <p class="wizard-lede">The cleaners you've saved. Tap the ☆ on any cleaner to add them here.</p>

      <div class="panel-card">
        ${starredList.length
          ? `<div class="starred-grid">${starredList.map(starredCard).join('')}</div>`
          : `<p class="muted">No cleaners yet. Tap the ☆ on any cleaner — in search results or on
               their profile — and they'll be saved here so you can find them again.</p>
             <button class="btn solid" data-goto="find" type="button" style="margin-top:1rem">Find a cleaner</button>`}
      </div>`;
  },

  find() {
    return `
      <h1>Find a cleaner</h1>
      <p class="wizard-lede">Set what you're after. We rank local maids by how well they match,
        closest first. You set your price, they set theirs.</p>
      <form class="find-form" id="findForm">
        <div class="field-row">
          <label class="field"><span>Location</span>
            <select name="loc">${locationOptions(find.loc)}</select>
          </label>
          <label class="field"><span>Type of clean</span>
            <select name="service">${DEMO.services.filter((s) => DEMO.baseServiceSlugs.includes(s.slug)).map((s) => opt(s.slug, s.name, find.service)).join('')}</select>
          </label>
        </div>
        <div class="field"><span>Add-on extras (optional)</span>
          <div class="chip-select" id="findExtras">${DEMO.extraServices
            .map((x) => `<button type="button" class="chip select ${find.extras.includes(x.slug) ? 'on' : ''}" data-extra="${x.slug}">${escapeHtml(x.name)}</button>`)
            .join('')}</div>
        </div>
        <label class="field"><span>Ideal hourly rate: <strong id="rateOut">$${find.desiredRate}/hr</strong></span>
          <input type="range" id="rate" min="20" max="80" value="${find.desiredRate}" />
          <span class="muted" style="font-size:0.82rem">We'll show you cleaners within a similar price range.</span>
        </label>
        <div class="field"><span>Cleaning products</span>
          <label class="check-inline"><input type="checkbox" id="needProducts" ${needsProducts() ? 'checked' : ''} /> The cleaner must bring cleaning products</label>
        </div>
        <div class="field"><span>When suits you? (optional)</span>
          <div class="cal" id="cal">${calendarHTML(find.slots)}</div>
        </div>
        <button class="btn solid" type="submit">Show my matches</button>
      </form>
      <div class="results-tools" ${find.ran ? '' : 'hidden'}>
        <label class="sort-label">Sort
          <select id="sortBy">
            <option value="relevance" ${find.sort === 'relevance' ? 'selected' : ''}>Best match</option>
            <option value="price-asc" ${find.sort === 'price-asc' ? 'selected' : ''}>Price: low to high</option>
            <option value="price-desc" ${find.sort === 'price-desc' ? 'selected' : ''}>Price: high to low</option>
          </select>
        </label>
      </div>
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
            <button class="btn outline sm" type="submit" ${pickable.length ? '' : 'disabled'}>Enquire</button>
          </form>
          <div class="convo-list">${convoListHTML()}</div>
        </div>
        <div class="thread">
          ${
            convo
              ? threadHTML(convo, msgCache[convo.id] ?? null)
              : '<div class="bubbles"><p class="muted" style="margin:auto">Start a chat with any cleaner</p></div>'
          }
        </div>
      </div>`;
  },

  profile() {
    const ph = (sel) => opt('', 'Select…', sel);
    const bedOpts = ph(cprof.bedrooms) + ['1', '2', '3', '4', '5', '6+'].map((v) => opt(v, v, cprof.bedrooms)).join('');
    const bathOpts = ph(cprof.bathrooms) + ['1', '2', '3', '4+'].map((v) => opt(v, v, cprof.bathrooms)).join('');
    const typeOpts = ph(cprof.homeType) + ['House', 'Apartment', 'Townhouse', 'Unit'].map((v) => opt(v, v, cprof.homeType)).join('');
    const storeyOpts = ph(cprof.storeys) + ['Single storey', 'Multi storey'].map((v) => opt(v, v, cprof.storeys)).join('');
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
          <label class="field"><span>Suburb</span><select name="suburb">${ph(cprof.suburb)}${suburbList.map((s) => opt(s, s, cprof.suburb)).join('')}</select></label>
        </div>
        <span class="bf-label" style="margin-top:1.4rem">Your home</span>
        <div class="field-row">
          <label class="field"><span>Bedrooms</span><select name="bedrooms">${bedOpts}</select></label>
          <label class="field"><span>Bathrooms</span><select name="bathrooms">${bathOpts}</select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Home type</span><select name="homeType">${typeOpts}</select></label>
          <label class="field"><span>Storeys</span><select name="storeys">${storeyOpts}</select></label>
        </div>
        <div class="field-row">
          <label class="check-inline" style="align-self:center"><input type="checkbox" name="pets" ${cprof.pets ? 'checked' : ''} /> Pets at home</label>
          <label class="check-inline" style="align-self:center"><input type="checkbox" name="needsProducts" ${cprof.needsProducts ? 'checked' : ''} /> I need the cleaner to bring cleaning products</label>
        </div>
        <label class="field"><span>Layout notes &amp; access</span><textarea name="notes" rows="3" placeholder="e.g. 3 bed 1 bath, stairs to the upper floor, park in the driveway, friendly dog.">${text(cprof.notes)}</textarea></label>

        <div class="save-row">
          <button class="btn solid" type="submit">Save profile</button>
          <span class="save-msg" id="profMsg"></span>
        </div>
      </form>
      ${uid ? RemoveProfile.html() : ''}`;
  },
};

const WIRE = {
  overview() {
    panel.querySelector('[data-goto]')?.addEventListener('click', () => goTo('find'));
    initHowflow(panel);
  },
  mycleaners() {
    panel.querySelector('[data-goto]')?.addEventListener('click', () => goTo('find'));
    wireStars(panel);
    wireContact(panel);
    bindCleanerLinks(panel);
  },
  find() {
    const form = panel.querySelector('#findForm');
    const rate = panel.querySelector('#rate');
    const rateOut = panel.querySelector('#rateOut');
    rate.addEventListener('input', () => {
      find.desiredRate = Number(rate.value);
      rateOut.textContent = `$${find.desiredRate}/hr`;
    });
    panel.querySelector('#needProducts')?.addEventListener('change', (e) => {
      find.products = e.target.checked;
    });
    wireCalendar(panel.querySelector('#cal'), find.slots);
    panel.querySelectorAll('[data-extra]').forEach((c) =>
      c.addEventListener('click', () => {
        const slug = c.dataset.extra;
        if (find.extras.includes(slug)) find.extras = find.extras.filter((s) => s !== slug);
        else find.extras.push(slug);
        c.classList.toggle('on', find.extras.includes(slug));
      })
    );
    if (find.ran) wireResults(panel.querySelector('#findResults'));
    panel.querySelector('#sortBy')?.addEventListener('change', (e) => {
      find.sort = e.target.value;
      const box = panel.querySelector('#findResults');
      box.innerHTML = renderResults(find.results);
      wireResults(box);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      find.loc = form.loc.value;
      find.service = form.service.value;
      find.ran = true;
      const parsed = parseLoc(find.loc);
      find.locLabel = parsed.label;
      const box = panel.querySelector('#findResults');
      box.innerHTML = '<p class="muted">Searching…</p>';
      try {
        const data = await postJSON('/api/match', {
          suburbs: parsed.suburbs,
          services: [find.service, ...find.extras],
          budgetMin: Math.max(0, find.desiredRate - 10),
          budgetMax: find.desiredRate + 10,
          verif: [],
          products: needsProducts(),
          durationHours: 2,
          slots: find.slots,
        });
        find.results = data.results || [];
      } catch {
        box.innerHTML = '<p class="muted">Search is unavailable right now — please try again.</p>';
        return;
      }
      panel.querySelector('.results-tools')?.removeAttribute('hidden');
      box.innerHTML = renderResults(find.results);
      wireResults(box);
    });
  },
  messages() {
    bindConvoButtons();
    const nc = panel.querySelector('#newChat');
    nc?.addEventListener('submit', (e) => {
      e.preventDefault();
      const sel = panel.querySelector('#newCleaner');
      const cleanerId = sel.value;
      if (!cleanerId || !uid) return;
      // Every new contact goes through the enquiry form so it carries details.
      openEnquiryModal(cleanerId, sel.options[sel.selectedIndex]?.text || '');
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
    panel.querySelectorAll('[data-review]').forEach((b) =>
      b.addEventListener('click', () => openReviewModal(activeConvo))
    );
  },
  profile() {
    if (uid) RemoveProfile.bind(uid);
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
        suburb: f.suburb.value,
        bedrooms: f.bedrooms.value, bathrooms: f.bathrooms.value,
        homeType: f.homeType.value,
        pets: f.pets.checked, needsProducts: f.needsProducts.checked, storeys: f.storeys.value, notes: f.notes.value,
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
  // Only fetch the review once the thread actually contains a prompt.
  if (reviewCache[id] === undefined && (msgCache[id] || []).some((m) => m.kind === 'review_request')) {
    await loadReview(id);
  }
  if (jump) goTo('messages');
  else render();
}

function loadReview(id) {
  return getJSON(`/api/review?conversationId=${encodeURIComponent(id)}&userId=${encodeURIComponent(uid)}`)
    .then((d) => { reviewCache[id] = d.review; })
    .catch(() => { reviewCache[id] = null; });
}

// ---------- Results (from the real /api/match) ----------
const rateKey = (r) => r.fair ?? r.rateMin ?? r.rateMax ?? 9999;
function renderResults(scored) {
  scored = (scored || []).slice();
  if (!scored.length)
    return `<p class="muted">No cleaners cover ${find.locLabel} for that service yet. More are coming soon.</p>`;

  if (find.sort === 'price-asc') scored.sort((a, b) => rateKey(a) - rateKey(b));
  else if (find.sort === 'price-desc') scored.sort((a, b) => rateKey(b) - rateKey(a));
  // 'relevance' keeps the server's best-match-first order (price already factors in).

  const lead =
    find.sort === 'price-asc' ? 'lowest price first' : find.sort === 'price-desc' ? 'highest price first' : 'best match first';
  return (
    `<p class="results-summary">Showing ${scored.length} relevant cleaner${scored.length > 1 ? 's' : ''} in ${find.locLabel}, ${lead}.</p>` +
    scored.map(resultCard).join('')
  );
}
function wireResults(box) {
  if (!box) return;
  wireContact(box);
  bindCleanerLinks(box);
  wireStars(box);
}

// A plain-language price breakdown: the base clean rate plus any extras the
// customer selected that this cleaner actually offers (e.g. "Regular $30/hr · Oven +$5").
function priceBreakdown(r) {
  const base = r.fair ?? r.rateMin ?? r.rateMax;
  const addonMap = new Map((r.addons || []).map((a) => [a.slug, a.price]));
  const lines = [];
  if (base != null) lines.push(`${DEMO.serviceName(find.service)} $${base}/hr`);
  (find.extras || []).forEach((slug) => {
    if (addonMap.has(slug)) lines.push(`${DEMO.serviceName(slug)} +$${addonMap.get(slug)}`);
  });
  return lines;
}
function breakdownHTML(r) {
  const lines = priceBreakdown(r);
  if (!lines.length) return '';
  return `<p class="price-breakdown">${lines.map((l) => `<span>${escapeHtml(l)}</span>`).join('')}</p>`;
}

function resultCard(r) {
  const tierLabel = r.tier === 'great' ? 'Strong match' : r.tier === 'good' ? 'Good match' : 'Also available';
  const badges = [r.badges.id && 'ID', r.badges.police && 'Police', r.badges.insurance && 'Insured', r.bringsProducts && 'Brings products'].filter(Boolean);
  const slotChips = (r.matched || [])
    .map((m) => `<span class="chip on">${DAYS[m.day]} ${(SLOTS.find((s) => s.key === m.slot) || {}).label || m.slot}</span>`)
    .join('');
  const rateStr = rateLabel(r.rateMin, r.rateMax);
  const fairStr = '';
  const reqSlots = find.slots.length;
  const first = escapeHtml(r.name.split(/['\s]/)[0]);
  return `<article class="result ${r.featured ? 'featured' : ''}">
    <div class="result-head">
      <div><h3><button class="linklike" type="button" data-cleaner="${attr(r.id)}">${escapeHtml(r.name)}</button>${Rating.badge(r.rating, r.reviews)} ${r.featured ? '<span class="pin">Promoted</span>' : ''}</h3>
        <p class="result-meta">${rateStr}${fairStr}</p></div>
      <div class="result-head-right">
        ${starBtn(r.id, r.name)}
        <span class="tier tier-${r.tier}">${tierLabel}</span>
      </div>
    </div>
    ${breakdownHTML(r)}
    ${badges.length ? `<p class="verif">${badges.map((b) => `<span class="chip">${b}</span>`).join('')}</p>` : ''}
    ${reqSlots && (r.matched || []).length ? `<div class="chips">${slotChips}</div>` : ''}
    ${reqSlots && !(r.matched || []).length ? `<p class="no-overlap">Not free at your chosen times — ask about other slots.</p>` : ''}
    <div class="result-actions"><button class="btn solid sm" type="button" data-contact="${attr(r.name)}" data-cid="${attr(r.id)}">Contact ${first}</button></div>
  </article>`;
}

// A star toggle for saving a cleaner (☆ / ★).
function starBtn(id, name) {
  const on = starredIds.has(id);
  const label = on ? 'Click to remove from My Cleaners' : 'Click to add to My Cleaners';
  return `<button class="star-btn ${on ? 'on' : ''}" type="button" data-star="${attr(id)}" data-starname="${attr(name)}" aria-pressed="${on}" title="${label}" aria-label="${label}">${on ? '★' : '☆'}</button>`;
}
function wireStars(box) {
  if (!box) return;
  box.querySelectorAll('[data-star]').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); toggleStar(b.dataset.star, b.dataset.starname); })
  );
}
// Compact card for a starred cleaner in the My cleaners tab.
function starredCard(c) {
  const rate = rateLabel(c.rateMin, c.rateMax);
  const first = escapeHtml((c.name || 'them').split(/['\s]/)[0]);
  return `<div class="starred-card">
    <div class="starred-top">
      <button class="linklike" type="button" data-cleaner="${attr(c.id)}">${escapeHtml(c.name)}</button>${Rating.badge(c.rating, c.reviews)}
      ${starBtn(c.id, c.name)}
    </div>
    <p class="result-meta">${rate}</p>
    <div class="starred-actions">
      <button class="btn outline sm" type="button" data-cleaner="${attr(c.id)}">View</button>
      <button class="btn solid sm" type="button" data-contact="${attr(c.name)}" data-cid="${attr(c.id)}">Message ${first}</button>
    </div>
  </div>`;
}

// Contact from a result: start (or reuse) a real conversation, then open it.
function wireContact(box) {
  box.querySelectorAll('[data-contact]').forEach((b) =>
    b.addEventListener('click', () => openEnquiryModal(b.dataset.cid, b.dataset.contact))
  );
}

// ---- Cleaner profile modal (click a cleaner's name) ----
const cleanerModal = document.getElementById('cleanerModal');
const cleanerModalBody = document.getElementById('cleanerModalBody');
document.getElementById('cleanerModalClose')?.addEventListener('click', () => { cleanerModal.hidden = true; });
cleanerModal?.addEventListener('click', (e) => { if (e.target === cleanerModal) cleanerModal.hidden = true; });

function bindCleanerLinks(box) {
  box.querySelectorAll('[data-cleaner]').forEach((b) =>
    b.addEventListener('click', () => openCleanerModal(b.dataset.cleaner))
  );
}
async function openCleanerModal(id) {
  if (!cleanerModal) return;
  cleanerModalBody.innerHTML = '<p class="muted">Loading…</p>';
  cleanerModal.hidden = false;
  try {
    const c = await getJSON(`/api/cleaner-profile?id=${encodeURIComponent(id)}`);
    cleanerModalBody.innerHTML = cleanerCardHTML(c);
    wireStars(cleanerModalBody);
    const btn = cleanerModalBody.querySelector('[data-cpcontact]');
    btn?.addEventListener('click', () => {
      cleanerModal.hidden = true;
      openEnquiryModal(btn.dataset.cpcontact, c.name);
    });
  } catch {
    cleanerModalBody.innerHTML = '<p class="muted">Could not load this profile.</p>';
  }
}
// ---- Official enquiry modal (structured first contact -> message thread) ----
const enquiryModal = document.getElementById('enquiryModal');
const enquiryModalBody = document.getElementById('enquiryModalBody');
document.getElementById('enquiryModalClose')?.addEventListener('click', () => { if (enquiryModal) enquiryModal.hidden = true; });
enquiryModal?.addEventListener('click', (e) => { if (e.target === enquiryModal) enquiryModal.hidden = true; });

function openEnquiryModal(cleanerId, cleanerName) {
  if (!uid) { location.href = '/login?role=customer'; return; }
  if (!enquiryModal) return;
  const first = escapeHtml((cleanerName || 'them').split(/['\s]/)[0]);
  const svcOpts = DEMO.services.map((s) => `<option value="${s.slug}" ${s.slug === find.service ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
  const home = [cprof.bedrooms && `${cprof.bedrooms} bed`, cprof.bathrooms && `${cprof.bathrooms} bath`, cprof.homeType, cprof.storeys, cprof.stairs && 'stairs', cprof.pets && 'pets'].filter(Boolean).join(' · ');
  enquiryModalBody.innerHTML = `
    <h2 style="margin-top:0">Enquire with ${escapeHtml(cleanerName || 'this cleaner')}</h2>
    <p class="muted">Send an official enquiry — it opens a private message thread with just the two of you.</p>
    <form id="enquiryForm">
      <label class="field"><span>Service</span><select name="service">${svcOpts}</select></label>
      <div class="field-row">
        <label class="field"><span>Suburb</span><input name="suburb" value="${attr(cprof.suburb || '')}" /></label>
        <label class="field"><span>Preferred times</span><input name="when" placeholder="e.g. weekday mornings" /></label>
      </div>
      <label class="field"><span>Message</span><textarea name="message" rows="4">Hi ${first}, I'd like to enquire about a clean${home ? ` for my home (${escapeHtml(home)})` : ''}. Are you available?</textarea></label>
      <div class="cp-actions"><button class="btn solid full" type="submit">Send enquiry</button></div>
    </form>`;
  enquiryModal.hidden = false;
  const form = enquiryModalBody.querySelector('#enquiryForm');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    let msg = f.message.value.trim();
    const when = f.when.value.trim();
    if (when) msg += `\n\nPreferred times: ${when}`;
    const btn = f.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      activeConvo = await apiContact(cleanerId, msg, f.service.value, f.suburb.value.trim());
      enquiryModal.hidden = true;
      await refreshConvos();
      await loadMsgs(activeConvo);
      goTo('messages');
    } catch {
      if (btn) { btn.disabled = false; btn.textContent = 'Send enquiry'; }
    }
  });
}

// ---- Review modal (opened from the review prompt in a chat thread) ---------
const reviewModal = document.getElementById('reviewModal');
const reviewModalBody = document.getElementById('reviewModalBody');
document.getElementById('reviewModalClose')?.addEventListener('click', () => { if (reviewModal) reviewModal.hidden = true; });
reviewModal?.addEventListener('click', (e) => { if (e.target === reviewModal) reviewModal.hidden = true; });

function openReviewModal(conversationId) {
  if (!reviewModal || !conversationId || !uid) return;
  const convo = convos.find((c) => c.id === conversationId);
  const who = convo ? convo.withBusiness || convo.with : 'your cleaner';
  const existing = reviewCache[conversationId] || null;

  reviewModalBody.innerHTML = `
    <h2 style="margin-top:0">Review ${escapeHtml(who)}</h2>
    <p class="muted">Drag across the stars — you can land on any decimal. Your overall
      rating is the average of these five.</p>
    <form id="reviewForm">
      ${Review.formHTML(existing)}
      <div class="cp-actions"><button class="btn solid full" type="submit">${existing ? 'Update review' : 'Submit review'}</button></div>
      <p class="save-msg" id="reviewMsg"></p>
    </form>`;
  reviewModal.hidden = false;

  const form = reviewModalBody.querySelector('#reviewForm');
  const read = Review.wire(form);
  const msg = reviewModalBody.querySelector('#reviewMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = read();
    if (typeof data.wouldUseAgain !== 'boolean') {
      msg.textContent = 'Please say whether you would use them again.';
      msg.className = 'save-msg err';
      return;
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    msg.textContent = 'Saving…';
    msg.className = 'save-msg pending';
    try {
      const res = await postJSON('/api/review', { conversationId, userId: uid, ...data });
      reviewCache[conversationId] = { ...data, overall: res.overall };
      reviewModal.hidden = true;
      render();
    } catch {
      btn.disabled = false;
      msg.textContent = 'Could not save your review. Please try again.';
      msg.className = 'save-msg err';
    }
  });
}

function rateLabel(min, max) {
  // Single price only — never a range.
  const r = min ?? max;
  return r == null ? 'rate on enquiry' : `$${r}/hr`;
}
function cleanerCardHTML(c) {
  const badges = [c.badges.id && 'ID verified', c.badges.police && 'Police checked', c.badges.insurance && 'Insured', c.bringsProducts && 'Brings products'].filter(Boolean);
  const initial = escapeHtml((c.name || '?').slice(0, 1).toUpperCase());
  const first = escapeHtml((c.name || 'them').split(/['\s]/)[0]);
  const svc = c.services.length ? c.services.map((s) => `<span class="chip on">${escapeHtml(s)}</span>`).join('') : '<span class="muted">—</span>';
  const SLOTLBL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
  const avail = c.availability.length
    ? c.availability.slice().sort((a, b) => a.day - b.day).map((a) => `<span class="chip on">${DAYS[a.day]} ${SLOTLBL[a.slot] || a.slot}</span>`).join('')
    : '<span class="muted">Ask about times</span>';
  return `
    <div class="cv-head">
      <div class="avatar lg">${c.photo ? `<img src="${escapeHtml(c.photo)}" alt="" />` : `<span>${initial}</span>`}</div>
      <div class="cv-head-main">
        <h2>${escapeHtml(c.name)}${Rating.badge(c.rating, c.reviews)}</h2>
        <p class="muted" style="margin:0">${rateLabel(c.rateMin, c.rateMax)}${c.years ? ` · ${c.years} yrs exp` : ''}</p>
      </div>
      ${starBtn(c.id, c.name)}
    </div>
    ${badges.length ? `<p class="verif">${badges.map((b) => `<span class="chip">${b}</span>`).join('')}</p>` : ''}
    ${c.bio ? `<p>${escapeHtml(c.bio)}</p>` : ''}
    <div class="cv-section"><h4>Services</h4><div class="chips">${svc}</div></div>
    ${c.addons && c.addons.length
      ? `<div class="cv-section"><h4>Extras &amp; add-ons</h4><ul class="addon-menu">${c.addons
          .map((a) => `<li><span>${escapeHtml(DEMO.serviceName(a.slug))}</span><span class="addon-cost">+$${Math.max(0, Math.round(Number(a.price) || 0))}</span></li>`)
          .join('')}</ul></div>`
      : ''}
    <div class="cv-section"><h4>Areas covered</h4><p>${c.areas.length ? escapeHtml(c.areas.join(', ')) : '—'}</p></div>
    <div class="cv-section"><h4>Availability</h4><div class="chips">${avail}</div></div>
    ${Review.barsHTML(c.breakdown)}
    <div class="cp-actions"><button class="btn solid full" type="button" data-cpcontact="${attr(c.id)}">Message ${first}</button></div>`;
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
// A 'review_request' message is the tappable prompt the cleaner posts when they
// mark the clean complete. Once reviewed, it settles into a plain confirmation.
function bubblesHTML(msgs, review) {
  if (msgs == null) return '<p class="muted" style="margin:auto">Loading…</p>';
  if (!msgs.length) return '<p class="muted" style="margin:auto">Say hi 👋</p>';
  return msgs
    .map((m) => {
      if (m.kind === 'review_request') {
        return review
          ? `<div class="bubble them review-done"><p>Thanks — you rated this clean ${Number(review.overall).toFixed(1)}/5.</p>
               <span class="rp-cta" data-review="1">Edit your review</span><span>${m.at}</span></div>`
          : `<button type="button" class="bubble them review-prompt" data-review="1">
               <p>${escapeHtml(m.body)}</p><span class="rp-cta">Leave a review →</span><span>${m.at}</span></button>`;
      }
      return `<div class="bubble ${m.from}"><p>${escapeHtml(m.body)}</p><span>${m.at}</span></div>`;
    })
    .join('');
}
function threadHTML(c, msgs) {
  return `<div class="thread-head"><strong>${withLabel(c)}</strong></div>
    <div class="bubbles" id="bubbles">${bubblesHTML(msgs, reviewCache[c.id])}</div>
    <form class="composer" id="composer">
      <input name="body" placeholder="Write a message…" autocomplete="off" />
      <button class="btn solid" type="submit">Send</button>
    </form>`;
}
// Person's name, with their business (if any) on a second line underneath.
function withLabel(c) {
  return `${escapeHtml(c.with)}${c.withBusiness ? `<span class="with-biz">${escapeHtml(c.withBusiness)}</span>` : ''}`;
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
