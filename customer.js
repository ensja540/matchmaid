// Customer portal - fully backed by the real API (no demo data).
// Reference constants (calendar labels, service catalogue) still come from DEMO.
// Which marketplace this page belongs to. A signed-in user's own country wins:
// their data lives in one country and must not be looked up in the other.
const MM_COUNTRY = (() => {
  try {
    const u = JSON.parse(localStorage.getItem('matchmaid_user') || 'null');
    if (u && (u.country === 'AU' || u.country === 'NZ')) return u.country;
  } catch {}
  return (typeof window !== 'undefined' && window.MM_COUNTRY === 'AU') ? 'AU' : 'NZ';
})();
const withCountry = (url) =>
  url + (url.includes('?') ? '&' : '?') + 'country=' + MM_COUNTRY;

const { DAYS, SLOTS } = DEMO;

const sessionUser = Session.get();
// The mirror of the guard in maid.js: a cleaner session here would render the
// customer portal against a cleaner's id and every client endpoint would miss.
// Unknown roles are left alone so this can never bounce in a loop.
const ROLE_HOME = { cleaner: '/maid', client: '/customer' };
if (sessionUser && sessionUser.role !== 'client' && ROLE_HOME[sessionUser.role]) {
  location.replace(ROLE_HOME[sessionUser.role]);
}
const uid = sessionUser?.id && sessionUser.id !== 'demo' ? sessionUser.id : null;
const displayName = sessionUser?.fullName || 'there';
const firstName = (displayName.split(' ')[0] || '').replace(/^./, (c) => c.toUpperCase());
document.getElementById('who').textContent = `Hi, ${firstName}`;
document.getElementById('logout').addEventListener('click', (e) => {
  e.preventDefault();
  Session.clear();
  location.href = '/';
});

const panel = document.getElementById('panel');
const tabs = document.getElementById('tabs');
// Deep link: /customer#find lands straight on a tab (browse sends signup
// traffic to #find). Anything unrecognised falls back to the overview.
const TABS = ['overview', 'mycleaners', 'find', 'messages', 'profile'];
// #enquiries was its own tab until the enquiry list folded into Messages. Old
// links and bookmarks land there rather than dropping to the overview, which
// would look like the link was simply wrong.
const TAB_ALIASES = { enquiries: 'messages' };
const wantedTab = TAB_ALIASES[location.hash.slice(1)] || location.hash.slice(1);
let current = TABS.includes(wantedTab) ? wantedTab : 'overview';
// Guided profile-setup wizard state.
let cwizStep = 0, cwizEl = null, cwizAutoTried = false;

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
// [{id, name, region, territorial_authority}] from /api/suburbs. Objects, not
// names: nationwide the same name exists in several regions, so every write
// sends the id.
let suburbList = [];
let suburbsFailed = false; // the /api/suburbs fetch errored - say so, don't show a dead picker
let directory = []; // active cleaners (for the messages picker)
let convos = []; // this user's conversations
let pendingReviews = []; // cleans the customer has been asked to rate, and hasn't
let msgCache = {}; // conversationId -> messages[]
let reviewCache = {}; // conversationId -> review | null (undefined = not loaded)
let activeConvo = null;
let starredIds = new Set(); // cleaner ids this customer has starred
let starredList = []; // starred cleaners with details (for the My cleaners tab)

// "How Match Maid works" - customer steps as a scroll-driven zigzag timeline
// (same component as the maid side, customer copy).
const HOWFLOW_STEPS = [
  { n: '01', h: 'Search your area', b: `Choose your suburb and the type of clean to see local maids, <span class="hi">best match first</span>.` },
  { n: '02', h: 'Compare openly', b: `Check each maid's rate, rating, reviews and verified badges. <span class="hi">Nothing hidden</span>.` },
  { n: '03', h: 'Contact your pick', b: `Message the single cleaner you like: <span class="hi">no bidding wars</span>, no shared leads.` },
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

// New accounts start clean - only the name/email (the user's own account data)
// are pre-filled; everything about their home is blank until they set it.
const PROFILE_DEFAULTS = {
  photo: '', fullName: sessionUser?.fullName || '', email: sessionUser?.email || '', phone: '',
  suburb: '', suburbId: null, suburbRegion: '', address: '', bedrooms: '', bathrooms: '', stairs: false, pets: false, needsProducts: true, storeys: '', homeType: '', notes: '',
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
  getJSON(withCountry('/api/suburbs'))
    .then((list) => { suburbList = Array.isArray(list) ? list : []; reRenderIf('find', 'profile'); refreshCwizForSuburbs(); })
    .catch(() => { suburbsFailed = true; reRenderIf('find', 'profile'); refreshCwizForSuburbs(); });
}
function loadDirectory() {
  getJSON('/api/directory').then((list) => { directory = list; reRenderIf('messages'); }).catch(() => {});
}
function loadProfile() {
  getJSON(`/api/client-profile?userId=${encodeURIComponent(uid)}`)
    .then((data) => { cprof = { ...PROFILE_DEFAULTS, ...data }; reRenderIf('profile', 'find'); maybeAutoOpenCwiz(); })
    .catch(() => { maybeAutoOpenCwiz(); });
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
// The prompt also sits in the chat thread, but chat is where people arrange a
// clean, not where they go after one. This is what they actually see next.
function loadPendingReviews() {
  return getJSON(`/api/pending-reviews?userId=${encodeURIComponent(uid)}`)
    .then((list) => {
      pendingReviews = list || [];
      reRenderIf('overview');
    })
    .catch(() => {});
}
function refreshConvos() {
  return getJSON(`/api/conversations?userId=${encodeURIComponent(uid)}`)
    .then((list) => { convos = list; refreshBadges(); })
    .catch(() => {});
}
function loadMsgs(id) {
  return getJSON(`/api/messages?conversationId=${encodeURIComponent(id)}&userId=${encodeURIComponent(uid)}`)
    .then((data) => { msgCache[id] = data.messages || []; bookingCache[id] = data.booking || null; })
    .catch(() => { msgCache[id] = []; });
}
// Where the date has got to on each conversation, and which thread (if any) has
// its date picker open. The date is agreed in the chat, so it is tracked here.
const bookingCache = {};
let proposingFor = null;
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
  // Came from browse via "Contact" - open the official enquiry form for them.
  if (pendingContact && pendingContact.id) openEnquiryModal(pendingContact.id, pendingContact.name);
}

// Kick off all loads for the logged-in customer.
if (uid) {
  loadSuburbs();
  loadDirectory();
  loadProfile();
  loadFavourites();
  loadPendingReviews();
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
// A count bubble on a tab. Rendered into the tab button itself rather than
// floated over it, so it cannot drift out of place when the tabs wrap on a
// narrow screen. Removed entirely at zero - an empty badge still draws the eye
// to a tab with nothing behind it, which teaches people to ignore it.
function setTabBadge(tab, n) {
  const btn = tabs?.querySelector(`[data-tab="${tab}"]`);
  if (!btn) return;
  let b = btn.querySelector('.tab-badge');
  if (!n) { b?.remove(); btn.classList.remove('has-badge'); return; }
  if (!b) {
    b = document.createElement('span');
    b.className = 'tab-badge';
    btn.appendChild(b);
  }
  b.textContent = n > 99 ? '99+' : String(n);
  b.setAttribute('aria-label', `${n} unread`);
  btn.classList.add('has-badge');
}
function refreshBadges() {
  setTabBadge('messages', (convos || []).reduce((n, c) => n + (c.unread || 0), 0));
}

function render() {
  panel.innerHTML = PANELS[current]();
  WIRE[current]?.();
  refreshBadges();
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
      ${pendingReviewsHTML()}
      <div class="cta-card">
        <div>
          <h2>Find a cleaner</h2>
          <p class="muted">Browse local cleaners, compare rates and availability, and message
            whoever you pick. Replies come back to your Messages tab.</p>
        </div>
        <button class="btn solid" data-goto="find" type="button">Find a cleaner</button>
      </div>

      ${howflowHTML()}`;
  },

  // Only the cleaners this customer has starred. Empty until they star someone -
  // people they've merely messaged live in the Messages tab, not here.
  mycleaners() {
    return `
      <h1>My cleaners</h1>
      <p class="wizard-lede">The cleaners you've saved. Tap the ☆ on any cleaner to add them here.</p>

      <div class="panel-card">
        ${starredList.length
          ? `<div class="starred-grid">${starredList.map(starredCard).join('')}</div>`
          : `<p class="muted">No cleaners yet. Tap the ☆ on any cleaner, in search results or on
               their profile, and they'll be saved here so you can find them again.</p>
             <button class="btn solid" data-goto="find" type="button" style="margin-top:1rem">Find a cleaner</button>`}
      </div>`;
  },

  // Enquiries this customer has sent, newest first, with the cleaner's response.
  // The real search lives on /browse - the ungated public one, with live
  // availability, the price histogram and areas derived from each cleaner's
  // service circle. This panel points at it rather than being a second search
  // that would have to be kept in step.
  //
  // One panel, no branching. Search used to be open to the admin account alone,
  // so this had a second version explaining that - which survived the opening
  // and told every customer their access was special while everyone else was
  // locked out. It is open to all of them.
  find() {
    return `
      <h1>Find a cleaner</h1>
      <div class="panel-card">
        <p class="wizard-lede">Browse local cleaners, compare their rates and availability, and
          message whoever you pick - replies come back to your Messages tab.</p>
        <p class="muted">Filling in your profile gets you better matches: we use your suburb, the
          clean you want and the times that suit you to rank who comes up first.</p>
        <div class="save-row">
          <a class="btn solid" href="/browse">Search cleaners</a>
          <button class="btn outline" data-open-cwiz type="button">Complete my profile</button>
        </div>
      </div>`;
  },

  messages() {
    const convo = convos.find((c) => c.id === activeConvo) || convos[0] || null;
    if (convo) activeConvo = convo.id;
    return `
      <h1>Messages</h1>
      <p class="wizard-lede">Your conversations with cleaners. Your history is saved to your account.</p>
      <div class="msg-layout">
        <div class="convo-col">
          <div class="convo-list">${
            convos.length
              ? convoListHTML()
              : '<p class="muted" style="padding:1rem 0.4rem">No messages yet. Once cleaners are available in your area and you enquire, your chats will appear here.</p>'
          }</div>
        </div>
        <div class="thread">
          ${
            convo
              ? threadHTML(convo, msgCache[convo.id] ?? null)
              : '<div class="bubbles"><p class="muted" style="margin:auto">No conversation selected</p></div>'
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
          <div class="avatar-actions">
            <label class="btn outline sm">${cprof.photo ? 'Change photo' : 'Upload photo'}<input type="file" id="photoInput" accept="image/*" hidden /></label>
            <button type="button" class="btn ghost sm" id="removePhoto" ${cprof.photo ? '' : 'hidden'}>Remove</button>
          </div>
        </div>

        <div class="field-row">
          <label class="field"><span>Full name</span><input name="fullName" value="${attr(cprof.fullName)}" /></label>
          <label class="field"><span>Email</span><input name="email" type="email" value="${attr(cprof.email)}" /></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Phone</span><input name="phone" value="${attr(cprof.phone)}" placeholder="Optional" /></label>
          ${suburbComboHTML('profSuburbCombo')}
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
    panel.querySelectorAll('[data-review-convo]').forEach((b) =>
      b.addEventListener('click', () => openConvo(b.dataset.reviewConvo, true))
    );
    initHowflow(panel);
  },
  mycleaners() {
    panel.querySelector('[data-goto]')?.addEventListener('click', () => goTo('find'));
    wireStars(panel);
    wireContact(panel);
    bindCleanerLinks(panel);
  },
  // The search itself is on /browse; the only thing to wire here is the CTA
  // that opens the guided profile setup, since a filled-in profile is what the
  // search ranks against.
  find() {
    panel.querySelector('[data-open-cwiz]')?.addEventListener('click', openCwiz);
  },
  messages() {
    bindConvoButtons();
    // bindCleanerLinks already knows how to open the profile modal from a
    // data-cleaner attribute - the thread header just needed to carry one.
    bindCleanerLinks(panel);
    // toggleStar re-renders, so the box relabels itself between "Add to" and
    // "Saved to" without anything else being wired up here.
    wireStars(panel);
    wireBooking();
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
    mountSuburbCombo(panel.querySelector('#profSuburbCombo'));
    const avatar = panel.querySelector('#avatar');
    panel.querySelector('#photoInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        cprof.photo = reader.result;
        render(); // refresh so Change/Remove appear
      };
      reader.readAsDataURL(file);
    });
    panel.querySelector('#removePhoto')?.addEventListener('click', () => {
      cprof.photo = '';
      render();
    });
    panel.querySelector('#profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      Object.assign(cprof, {
        fullName: f.fullName.value, email: f.email.value, phone: f.phone.value,
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
        el.textContent = 'Could not save. Please try again.';
        el.className = 'save-msg err';
      }
    });
  },
};
// One mount for both the profile form and the wizard. Picking writes straight
// into cprof, so nothing has to read a <select> back out at save time.
let suburbCombo = null;
// Mounting the picker over an empty list is worse than showing nothing: the
// town field renders and looks live, but matches nothing whatever you type, so
// it reads as "Match Maid doesn't cover me" rather than "not loaded yet". The
// wizard's suburb step blocks on a pick, so that dead end is unescapable.
function suburbComboHTML(id) {
  if (suburbList.length) return `<div id="${id}"></div>`;
  return suburbsFailed
    ? `<div id="${id}"><p class="loc-note err">Could not load the suburb list. Check your connection and reload the page.</p></div>`
    : `<div id="${id}"><p class="loc-note muted">Loading suburbs…</p></div>`;
}
function mountSuburbCombo(root) {
  if (!root || !suburbList.length) return;
  suburbCombo = LocationPicker.attach(root, suburbList, {
    selectedId: cprof.suburbId,
    onPick: (item) => {
      if (!item) { cprof.suburbId = null; cprof.suburb = ''; cprof.suburbRegion = ''; return; }
      cprof.suburbId = item.id;
      cprof.suburb = item.name;
      cprof.suburbRegion = item.region;
    },
  });
}

// Match Maid is open everywhere in New Zealand, so nothing turns anyone away
// by postcode. This used to check a hardcoded launched-areas list and tell
// people outside it "not in your area yet" - a list that had already gone
// stale (a cleaner works Dunedin, which was never on it), and a closed door
// shown to exactly the households worth encouraging. Where there genuinely is
// nobody yet, search says so with real numbers instead.

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

// A plain-language price breakdown: the cleaner's rate, any per-hour surcharge
// for a specialist clean, then flat extras the customer picked and this cleaner
// offers. e.g. "Deep clean $30/hr · Deep clean +$8/hr · Oven +$5".
function priceBreakdown(r) {
  const addonMap = new Map((r.addons || []).map((a) => [a.slug, a.price]));
  const lines = [];
  const surcharge = Number(r.surcharge) || 0;
  // rateMin/fair already include the surcharge, so show the base rate separately.
  const base = surcharge > 0 ? r.baseRate : r.fair ?? r.rateMin ?? r.rateMax;
  if (base != null) lines.push(`${DEMO.serviceName(find.service)} $${base}/hr`);
  if (surcharge > 0) lines.push(`Specialist rate +$${surcharge}/hr`);
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
  const badges = [r.badges.id && 'ID', r.badges.police && 'Criminal check', r.badges.insurance && 'Insured', r.bringsProducts && 'Brings products'].filter(Boolean);
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
    ${r.bondGuaranteed ? '<p class="bond-badge">✓ Bond-back guaranteed on end-of-tenancy cleans</p>' : ''}
    ${badges.length ? `<p class="verif">${badges.map((b) => `<span class="chip">${b}</span>`).join('')}</p>` : ''}
    ${reqSlots && (r.matched || []).length ? `<div class="chips">${slotChips}</div>` : ''}
    ${reqSlots && !(r.matched || []).length ? `<p class="no-overlap">Not free at your chosen times. Ask about other slots.</p>` : ''}
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

// Messaging happens on /browse, where the search that found them lives - the
// suburb and clean type are already chosen there, so the enquiry carries them.
// This points at it rather than duplicating a composer that would have to be
// kept in step with the other one.
function openEnquiryModal(cleanerId, cleanerName) {
  if (!uid) { location.href = '/login?role=customer'; return; }
  if (!enquiryModal) return;
  enquiryModalBody.innerHTML = `
    <h2 style="margin-top:0">Message ${escapeHtml(cleanerName || 'this cleaner')}</h2>
    <p>Search picks up the suburb and the clean you want, so your message arrives with
      the details already attached.</p>
    <div class="cp-actions">
      <a class="btn solid full" href="/browse">Find them on Browse</a>
      <button class="btn outline full" type="button" data-enq-ok>Not now</button>
    </div>`;
  enquiryModal.hidden = false;
  enquiryModalBody.querySelector('[data-enq-ok]')?.addEventListener('click', () => { enquiryModal.hidden = true; });
}

function openEnquiryFormDisabled(cleanerId, cleanerName) {
  const first = escapeHtml((cleanerName || 'them').split(/['\s]/)[0]);
  const svcOpts = DEMO.services.map((s) => `<option value="${s.slug}" ${s.slug === find.service ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
  const home = [cprof.bedrooms && `${cprof.bedrooms} bed`, cprof.bathrooms && `${cprof.bathrooms} bath`, cprof.homeType, cprof.storeys, cprof.stairs && 'stairs', cprof.pets && 'pets'].filter(Boolean).join(' · ');
  enquiryModalBody.innerHTML = `
    <h2 style="margin-top:0">Enquire with ${escapeHtml(cleanerName || 'this cleaner')}</h2>
    <p class="muted">Send an official enquiry. It opens a private message thread with just the two of you.</p>
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

  // Stepped, so the submit button lives inside the flow rather than under it.
  reviewModalBody.innerHTML = `
    <h2 class="rv-title">How was ${escapeHtml(who)}?</h2>
    <form id="reviewForm" class="rv-form">
      ${Review.stepsHTML(existing)}
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
      pendingReviews = pendingReviews.filter((p) => p.conversationId !== conversationId);
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
  // Single price only - never a range.
  const r = min ?? max;
  return r == null ? 'rate on enquiry' : `$${r}/hr`;
}
function cleanerCardHTML(c) {
  const initial = escapeHtml((c.name || '?').slice(0, 1).toUpperCase());
  const first = escapeHtml((c.name || 'them').split(/['\s]/)[0]);
  const svc = c.services.length ? c.services.map((s) => `<span class="chip on">${escapeHtml(s)}</span>`).join('') : '<span class="muted">-</span>';
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
    ${Badges.earned(c.badges, c.bringsProducts)}
    ${c.bondGuaranteed ? '<p class="bond-badge">✓ Bond-back guaranteed on end-of-tenancy cleans</p>' : ''}
    ${c.bio ? `<p>${escapeHtml(c.bio)}</p>` : ''}
    <div class="cv-section"><h4>Services</h4><div class="chips">${svc}</div></div>
    ${c.serviceSurcharges && c.serviceSurcharges.length
      ? `<div class="cv-section"><h4>Specialist cleans</h4><ul class="addon-menu">${c.serviceSurcharges
          .map((s) => `<li><span>${escapeHtml(DEMO.serviceName(s.slug))}</span><span class="addon-cost">+$${Math.max(0, Math.round(Number(s.extra) || 0))}/hr</span></li>`)
          .join('')}</ul></div>`
      : ''}
    ${c.addons && c.addons.length
      ? `<div class="cv-section"><h4>Extras &amp; add-ons</h4><ul class="addon-menu">${c.addons
          .map((a) => `<li><span>${escapeHtml(DEMO.serviceName(a.slug))}</span><span class="addon-cost">+$${Math.max(0, Math.round(Number(a.price) || 0))}</span></li>`)
          .join('')}</ul></div>`
      : ''}
    <div class="cv-section"><h4>Areas covered</h4><p>${c.areas.length ? escapeHtml(c.areas.join(', ')) : '-'}</p></div>
    <div class="cv-section"><h4>Availability</h4><div class="chips">${avail}</div></div>
    ${Review.barsHTML(c.breakdown)}
    <div class="cp-actions"><button class="btn solid full" type="button" data-cpcontact="${attr(c.id)}">Message ${first}</button></div>`;
}

// Sits above the fold on the dashboard until every clean has been rated. The
// button opens the thread, where the existing prompt is waiting to be tapped.
function pendingReviewsHTML() {
  if (!pendingReviews.length) return '';
  const one = pendingReviews.length === 1;
  return `<div class="panel-card review-nudge">
    <h2>How did ${one ? 'your clean' : 'your cleans'} go?</h2>
    <p class="muted">Your rating is what tells the next customer who to trust.</p>
    ${pendingReviews
      .map(
        (p) => `<button type="button" class="btn solid sm" data-review-convo="${attr(p.conversationId)}">
                  Rate ${escapeHtml(p.cleaner)}
                </button>`
      )
      .join('')}
  </div>`;
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
          ? `<div class="bubble them review-done"><p>Thanks, you rated this clean ${Number(review.overall).toFixed(1)}/5.</p>
               <span class="rp-cta" data-review="1">Edit your review</span><span>${m.at}</span></div>`
          : `<button type="button" class="bubble them review-prompt" data-review="1">
               <p>${escapeHtml(m.body)}</p><span class="rp-cta">Leave a review →</span><span>${m.at}</span></button>`;
      }
      // A proposal or confirmation is a decision, not a remark - it reads back
      // in order with the conversation that produced it, but marked out from it.
      if (m.kind === 'date_proposal' || m.kind === 'date_confirmed') {
        return `<div class="bubble ${m.from} date-note ${m.kind === 'date_confirmed' ? 'done' : ''}">
            <p>${m.kind === 'date_confirmed' ? '✓' : '📅'} ${escapeHtml(m.body)}</p><span>${m.at}</span></div>`;
      }
      return `<div class="bubble ${m.from}"><p>${escapeHtml(m.body)}</p><span>${m.at}</span></div>`;
    })
    .join('');
}

// You agree the date here, in the conversation, and record it here too. You
// propose; they confirm - and their confirmation is what books the clean.
function bookingHTML(c) {
  const b = bookingCache[c.id];
  if (!b || ['declined', 'closed', 'completed'].includes(b.status)) return '';
  if (proposingFor === c.id) {
    const todayISO = new Date().toISOString().slice(0, 10);
    return `<form class="booking-bar propose" id="proposeDate">
      <label>Date of the clean
        <input type="date" name="date" min="${todayISO}" value="${attr(b.proposedDate || b.scheduledOn || '')}" required />
      </label>
      <div class="booking-actions">
        <button class="btn solid sm" type="submit">Propose</button>
        <button class="btn outline sm" type="button" data-cancel-date="1">Cancel</button>
      </div>
      <p class="save-msg" role="status"></p>
    </form>`;
  }
  const again = (label) => `<button class="btn outline sm" type="button" data-propose="1">${label}</button>`;
  if (b.status === 'accepted' && b.scheduledLabel)
    return `<div class="booking-bar booked">
      <span class="booking-state">Booked for <strong>${text(b.scheduledLabel)}</strong></span>
      ${again('Change date')}
    </div>`;
  if (b.proposedLabel && b.proposedByMe)
    return `<div class="booking-bar waiting">
      <span class="booking-state">You proposed <strong>${text(b.proposedLabel)}</strong> · waiting on them</span>
      ${again('Change')}
    </div>`;
  if (b.proposedLabel)
    return `<div class="booking-bar offered">
      <span class="booking-state">They proposed <strong>${text(b.proposedLabel)}</strong></span>
      <div class="booking-actions">
        <button class="btn solid sm" type="button" data-confirm-date="1">Confirm</button>
        ${again('Suggest another')}
      </div>
    </div>`;
  return `<div class="booking-bar">
    <span class="booking-state muted">No date agreed yet</span>
    ${again('Propose a date')}
  </div>`;
}

// Not postJSON: that rejects with the bare Response, and the server's reply
// here is the whole point ("wait for them to confirm the date you proposed" is
// worth reading, "that did not work" is not).
async function bookingAction(url, body, msgEl) {
  if (!uid || !HAS_FETCH) return;
  if (msgEl) { msgEl.textContent = 'Saving…'; msgEl.className = 'save-msg pending'; }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, userId: uid }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'That did not work.');
    proposingFor = null;
    await loadMsgs(activeConvo);
    await refreshConvos();
    render();
  } catch (err) {
    if (msgEl) { msgEl.textContent = err.message || 'That did not work.'; msgEl.className = 'save-msg err'; }
  }
}

function wireBooking() {
  const enquiryId = bookingCache[activeConvo]?.enquiryId;
  panel.querySelectorAll('[data-propose]').forEach((b) =>
    b.addEventListener('click', () => { proposingFor = activeConvo; render(); })
  );
  panel.querySelectorAll('[data-cancel-date]').forEach((b) =>
    b.addEventListener('click', () => { proposingFor = null; render(); })
  );
  panel.querySelectorAll('[data-confirm-date]').forEach((b) =>
    b.addEventListener('click', () => bookingAction('/api/enquiry/confirm-date', { enquiryId }))
  );
  const form = panel.querySelector('#proposeDate');
  form?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const date = form.date.value;
    if (!date) return;
    bookingAction('/api/enquiry/propose-date', { enquiryId, date }, form.querySelector('.save-msg'));
  });
}
function threadHTML(c, msgs) {
  // The mirror of the maid side: their name opens the cleaner's profile, with a
  // labelled button beside it so it is discoverable rather than a hidden click.
  // Saving the cleaner you are mid-conversation with is the moment you decide
  // you want them again, so the star belongs here rather than only on a search
  // result you have already navigated away from. Labelled, not a bare icon -
  // "what does this star do" is not a question worth making anyone ask.
  const saved = c.cleanerId && starredIds.has(c.cleanerId);
  return `<div class="thread-head">
      ${c.cleanerId
        ? `<button class="linklike thread-who" type="button" data-cleaner="${attr(c.cleanerId)}">${withLabel(c)}</button>
           <button class="btn outline sm" type="button" data-cleaner="${attr(c.cleanerId)}">View profile</button>`
        : `<strong>${withLabel(c)}</strong>`}
    </div>
    ${c.cleanerId
      ? `<div class="thread-save ${saved ? 'on' : ''}">
           ${starBtn(c.cleanerId, c.with)}
           <span class="thread-save-text">${saved ? 'Saved to My cleaners' : 'Add to My cleaners'}</span>
         </div>`
      : ''}
    <div class="bubbles" id="bubbles">${bubblesHTML(msgs, reviewCache[c.id])}</div>
    ${bookingHTML(c)}
    <form class="composer" id="composer">
      <input name="body" placeholder="Write a message…" autocomplete="off" />
      <button class="btn solid" type="submit">Send</button>
    </form>`;
}
// Person's name, with their business (if any) on a second line underneath.
// Name, then their suburb alongside it. For a cleaner reading a thread the
// suburb is the second thing they need after the name - whether the job is even
// in their patch - so it sits next to it rather than behind a profile click.
function withLabel(c) {
  return `${escapeHtml(c.with)}`
    + (c.withSuburb ? `<span class="with-suburb">${escapeHtml(c.withSuburb)}</span>` : '')
    + (c.withBusiness ? `<span class="with-biz">${escapeHtml(c.withBusiness)}</span>` : '');
}
function convoListHTML() {
  return convos.length
    ? convos
        .map(
          (c) => `<button type="button" class="convo ${c.id === activeConvo ? 'active' : ''}" data-convo="${c.id}">
            <strong>${withLabel(c)}</strong>
            <span class="muted">${escapeHtml((c.lastBody || '').slice(0, 36))}</span>
            ${c.unread ? `<span class="unread">${c.unread > 9 ? '9+' : c.unread}</span>` : ''}
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

// ---------- Guided profile-setup wizard ----------
// The customer analog of the maid setup wizard: a modal that walks a new
// customer through their profile and saves it in one
// call. Lives on document.body so background re-renders can't wipe it, and
// reuses the shared .wiz-* styles.
const CWIZ_STEPS = [
  { key: 'about', title: 'About you' },
  { key: 'suburb', title: 'Your suburb' },
  { key: 'home', title: 'Your home' },
];

function cprofComplete() {
  return !!(cprof.fullName && String(cprof.fullName).trim() && cprof.email && String(cprof.email).trim() && cprof.suburb);
}
function maybeAutoOpenCwiz() {
  if (cwizAutoTried || !uid) return;
  cwizAutoTried = true;
  let dismissed = false;
  try { dismissed = !!sessionStorage.getItem('mm_cwiz_dismissed'); } catch {}
  if (dismissed || cprofComplete()) return;
  openCwiz();
}

const CWIZ_CONTENT = {
  about: () => `
    <p class="wiz-lede">Just the basics so a cleaner knows who they're helping. So we can match you to the right cleaners.</p>
    <div class="avatar-row">
      <div class="avatar" id="cwizAvatar">${cprof.photo ? `<img src="${cprof.photo}" alt="" />` : '<span>Photo</span>'}</div>
      <label class="btn outline sm">Upload photo <span class="muted">(optional)</span><input type="file" id="cwizPhoto" accept="image/*" hidden /></label>
    </div>
    <label class="field"><span>Full name</span><input id="cwizName" type="text" value="${attr(cprof.fullName)}" placeholder="Alex Taylor" /></label>
    <label class="field"><span>Email</span><input id="cwizEmail" type="email" value="${attr(cprof.email)}" placeholder="you@example.com" /></label>
    <label class="field"><span>Phone <span class="muted">(optional)</span></span><input id="cwizPhone" type="text" value="${attr(cprof.phone)}" placeholder="Optional" /></label>`,
  suburb: () => `
    <p class="wiz-lede">Where's your home? We'll match you with cleaners who cover your area first.</p>
    ${suburbComboHTML('cwizSuburbCombo')}`,
  home: () => {
    const ph = (sel) => opt('', 'Select…', sel);
    const bedOpts = ph(cprof.bedrooms) + ['1', '2', '3', '4', '5', '6+'].map((v) => opt(v, v, cprof.bedrooms)).join('');
    const bathOpts = ph(cprof.bathrooms) + ['1', '2', '3', '4+'].map((v) => opt(v, v, cprof.bathrooms)).join('');
    const typeOpts = ph(cprof.homeType) + ['House', 'Apartment', 'Townhouse', 'Unit'].map((v) => opt(v, v, cprof.homeType)).join('');
    const storeyOpts = ph(cprof.storeys) + ['Single storey', 'Multi storey'].map((v) => opt(v, v, cprof.storeys)).join('');
    return `
      <p class="wiz-lede">A quick picture of your home helps cleaners quote accurately. All optional.</p>
      <div class="field-row">
        <label class="field"><span>Bedrooms</span><select id="cwizBed">${bedOpts}</select></label>
        <label class="field"><span>Bathrooms</span><select id="cwizBath">${bathOpts}</select></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Home type</span><select id="cwizType">${typeOpts}</select></label>
        <label class="field"><span>Storeys</span><select id="cwizStorey">${storeyOpts}</select></label>
      </div>
      <div class="field-row">
        <label class="check-inline" style="align-self:center"><input type="checkbox" id="cwizPets" ${cprof.pets ? 'checked' : ''} /> Pets at home</label>
        <label class="check-inline" style="align-self:center"><input type="checkbox" id="cwizProducts" ${cprof.needsProducts ? 'checked' : ''} /> Cleaner brings products</label>
      </div>
      <label class="field"><span>Layout notes &amp; access</span><textarea id="cwizNotes" rows="3" placeholder="e.g. stairs to the upper floor, park in the driveway, friendly dog.">${text(cprof.notes)}</textarea></label>`;
  },
};

const CWIZ_WIRE = {
  suburb: (root) => {
    mountSuburbCombo(root.querySelector('#cwizSuburbCombo'));
  },
  about: (root) => {
    root.querySelector('#cwizPhoto')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        cprof.photo = reader.result;
        const a = root.querySelector('#cwizAvatar');
        if (a) a.innerHTML = `<img src="${cprof.photo}" alt="" />`;
      };
      reader.readAsDataURL(file);
    });
  },
};

function openCwiz() {
  if (cwizEl) return;
  cwizStep = 0;
  cwizEl = document.createElement('div');
  cwizEl.className = 'wiz-overlay';
  cwizEl.innerHTML = `<div class="wiz" role="dialog" aria-modal="true" aria-label="Complete your profile">
    <button class="wiz-close" type="button" aria-label="Close">×</button>
    <div class="wiz-progress" id="cwizProgress"></div>
    <div class="wiz-body" id="cwizBody"></div>
    <p class="wiz-msg" id="cwizMsg" role="status"></p>
    <div class="wiz-foot">
      <button class="btn outline" id="cwizBack" type="button">Back</button>
      <div class="wiz-foot-right"><button class="btn solid" id="cwizNext" type="button">Next</button></div>
    </div>
  </div>`;
  document.body.appendChild(cwizEl);
  cwizEl.querySelector('.wiz-close').addEventListener('click', dismissCwiz);
  cwizEl.querySelector('#cwizBack').addEventListener('click', () => { if (cwizStep > 0) { cwizStep--; renderCwizStep(); } });
  cwizEl.querySelector('#cwizNext').addEventListener('click', advanceCwiz);
  renderCwizStep();
}
function dismissCwiz() {
  try { sessionStorage.setItem('mm_cwiz_dismissed', '1'); } catch {}
  closeCwiz();
}
function closeCwiz() {
  if (cwizEl) { cwizEl.remove(); cwizEl = null; }
}
// The suburb list is ~200 KB and the client-profile call that opens this wizard
// is small, so the wizard routinely renders first - and its suburb step *blocks*
// on a pick. Without this the customer is stuck on step 2 for good. Only fires
// when the picker genuinely isn't mounted, so it can't pull focus mid-typing.
// Same fault, and same fix, as refreshWizardForSuburbs in maid.js.
function refreshCwizForSuburbs() {
  if (!cwizEl || CWIZ_STEPS[cwizStep]?.key !== 'suburb') return;
  if (cwizEl.querySelector('#cwizSuburbCombo .combo')) return; // already live
  renderCwizStep();
}
function cwizSetMsg(t, c) {
  const m = cwizEl && cwizEl.querySelector('#cwizMsg');
  if (m) { m.textContent = t || ''; m.className = 'wiz-msg ' + (c || ''); }
}
function renderCwizStep() {
  if (!cwizEl) return;
  const step = CWIZ_STEPS[cwizStep];
  cwizEl.querySelector('#cwizProgress').innerHTML =
    CWIZ_STEPS.map((s, i) => `<span class="wiz-dot ${i === cwizStep ? 'now' : ''} ${i < cwizStep ? 'done' : ''}"></span>`).join('') +
    `<span class="wiz-step-count">Step ${cwizStep + 1} of ${CWIZ_STEPS.length}</span>`;
  const body = cwizEl.querySelector('#cwizBody');
  body.innerHTML = `<h2 class="wiz-title">${step.title}</h2>` + CWIZ_CONTENT[step.key]();
  CWIZ_WIRE[step.key] && CWIZ_WIRE[step.key](body);
  cwizSetMsg('');
  cwizEl.querySelector('#cwizBack').style.visibility = cwizStep === 0 ? 'hidden' : 'visible';
  cwizEl.querySelector('#cwizNext').textContent = cwizStep === CWIZ_STEPS.length - 1 ? 'Finish' : 'Next';
}
function captureCwizStep(key) {
  if (key === 'about') {
    const name = cwizEl.querySelector('#cwizName').value.trim();
    const email = cwizEl.querySelector('#cwizEmail').value.trim();
    if (!name) { cwizSetMsg('Add your name to continue.', 'err'); return false; }
    if (!email) { cwizSetMsg('Add your email to continue.', 'err'); return false; }
    cprof.fullName = name;
    cprof.email = email;
    cprof.phone = cwizEl.querySelector('#cwizPhone').value.trim();
    return true;
  }
  if (key === 'suburb') {
    // The combo writes into cprof as soon as something is picked, so there is
    // no field to read back - just check something actually was picked.
    if (!cprof.suburbId) { cwizSetMsg('Pick your suburb to continue.', 'err'); return false; }
    return true;
  }
  if (key === 'home') {
    cprof.bedrooms = cwizEl.querySelector('#cwizBed').value;
    cprof.bathrooms = cwizEl.querySelector('#cwizBath').value;
    cprof.homeType = cwizEl.querySelector('#cwizType').value;
    cprof.storeys = cwizEl.querySelector('#cwizStorey').value;
    cprof.pets = cwizEl.querySelector('#cwizPets').checked;
    cprof.needsProducts = cwizEl.querySelector('#cwizProducts').checked;
    cprof.notes = cwizEl.querySelector('#cwizNotes').value;
    return true;
  }
  return true;
}
async function advanceCwiz() {
  const step = CWIZ_STEPS[cwizStep];
  if (!captureCwizStep(step.key)) return;
  if (cwizStep < CWIZ_STEPS.length - 1) { cwizStep++; renderCwizStep(); return; }
  await saveCwiz();
}
async function saveCwiz() {
  if (!uid) { dismissCwiz(); render(); return; }
  const nextBtn = cwizEl.querySelector('#cwizNext');
  nextBtn.disabled = true;
  cwizSetMsg('Saving your profile…', 'pending');
  try {
    await putClientProfile({ userId: uid, ...cprof });
    try { sessionStorage.setItem('mm_cwiz_dismissed', '1'); } catch {}
    cwizSetMsg("You're all set - go and find a cleaner.", 'ok');
    setTimeout(() => { closeCwiz(); render(); }, 1100);
  } catch {
    nextBtn.disabled = false;
    cwizSetMsg('Could not save. Please try again.', 'err');
  }
}

// First paint (data streams in from the API and re-renders as it arrives).
// goTo, not render, so a #tab deep link also highlights the right tab.
goTo(current);
