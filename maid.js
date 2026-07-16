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
let referrals = null; // { code, creditDollars, earned, pending, referrals[] }
// Header pill showing referral credit; clicking it jumps to the Subscription tab
// (where the full referral card lives). Hidden until credit data loads.
function updateRefPill() {
  const pill = document.getElementById('refPill');
  if (!pill || !referrals) return;
  pill.textContent = `🎁 $${referrals.creditDollars} credit`;
  pill.hidden = false;
}
let verif = loggedIn ? { id: 'none', police: 'none', insurance: 'none' } : loadVerif();
let verifRead = {}; // OCR-extracted text per verification type (review aid)
const saveVerif = () => localStorage.setItem(VERIF_KEY, JSON.stringify(verif));

const displayName = sessionUser?.fullName || profile.fullName;
// Capitalise the first name for greetings (people often type it lower-case).
const firstName = (displayName.split(' ')[0] || '').replace(/^./, (c) => c.toUpperCase());
document.getElementById('who').textContent = `Hi, ${firstName}`;
// Admin dashboard is reached directly at /admin (server-gated to the operator's
// email) — no header button, to keep the portal chrome clean.
document.getElementById('logout').addEventListener('click', (e) => {
  e.preventDefault();
  Session.clear();
  location.href = '/';
});

const panel = document.getElementById('panel');
const tabs = document.getElementById('tabs');
let current = 'overview';
// First-run setup wizard state (defined here so the async data-load callbacks
// can flip these flags safely).
let profileLoaded = false, availLoaded = false, wizardAutoTried = false;
let wizStep = 0, wizEl = null;

// Availability is real: load the logged-in maid's saved slots from the API,
// and save changes back to the database. Falls back to demo when not logged in.
let avail = loggedIn ? [] : profile.availability.map((s) => ({ ...s }));
const areas = new Set(loggedIn ? [] : profile.areas); // specific suburbs (when narrowing)
let mpCity = 'Christchurch'; // default city
let mpSpecific = false; // false = whole-city ("Christchurch-wide")
// The cleaner's own base location — a city + suburb picked from dropdowns (no
// free-text street address). Stored back into residential_address as
// "Suburb, City" so it needs no schema change.
let mpHomeCity = 'Christchurch';
let mpHomeSuburb = '';
function parseHome(addr) {
  const parts = String(addr || '').split(',').map((s) => s.trim()).filter(Boolean);
  const cities = Object.keys(DEMO.towns);
  const last = parts[parts.length - 1];
  const city = cities.includes(last) ? last : cities[0];
  const sub = parts.length > 1 ? parts[parts.length - 2] : '';
  return { city, suburb: (DEMO.towns[city] || []).includes(sub) ? sub : '' };
}
// Per-clean-type fee: { slug: dollars }. A type with a fee is one the maid
// offers; no entry means they don't offer it. Both regular and deep are hourly.
// End-of-lease and its bond-back guarantee are capabilities of the deep clean,
// stored as booleans in the same clean_rates JSON (not fees).
const PRODUCT_OPTIONS = [
  { value: 'own', label: 'I bring my own products and equipment' },
  { value: 'supplied', label: 'The customer supplies products and equipment' },
  { value: 'either', label: 'Either — I can bring them or use the customer’s' },
];
const PAYMENT_OPTIONS = [
  { value: 'bank', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
];
function extractRates(src) {
  const cr = src && typeof src === 'object' ? { ...src } : {};
  const bond = !!cr.bondGuaranteed;
  const endOfLease = !!cr.endOfLease;
  const productsOption = PRODUCT_OPTIONS.some((o) => o.value === cr.productsOption) ? cr.productsOption : 'own';
  // Accepted payment methods. Default to accepting both when nothing's saved.
  const payments = Array.isArray(cr.payments)
    ? cr.payments.filter((p) => PAYMENT_OPTIONS.some((o) => o.value === p))
    : PAYMENT_OPTIONS.map((o) => o.value);
  delete cr.bondGuaranteed;
  delete cr.endOfLease;
  delete cr.productsOption;
  delete cr.payments;
  return { rates: cr, bond, endOfLease, productsOption, payments };
}
let mpCleanRates = loggedIn ? {} : extractRates(profile.cleanRates).rates;
let mpBondGuaranteed = loggedIn ? false : extractRates(profile.cleanRates).bond;
let mpEndOfLease = loggedIn ? false : extractRates(profile.cleanRates).endOfLease;
let mpProductsOption = loggedIn ? 'own' : extractRates(profile.cleanRates).productsOption;
let mpPayments = new Set(loggedIn ? PAYMENT_OPTIONS.map((o) => o.value) : extractRates(profile.cleanRates).payments);
// Payment-method toggles shared by the profile form and the setup wizard.
function paymentOptionsHTML() {
  return `<div class="pay-opts">${PAYMENT_OPTIONS.map((o) =>
    `<label class="check-inline"><input type="checkbox" class="pay-toggle" value="${o.value}" ${mpPayments.has(o.value) ? 'checked' : ''} /> ${escapeHtml(o.label)}</label>`
  ).join('')}</div>`;
}
function wirePayments(root) {
  root.querySelectorAll('.pay-toggle').forEach((cb) =>
    cb.addEventListener('change', () => {
      if (cb.checked) mpPayments.add(cb.value);
      else mpPayments.delete(cb.value);
    })
  );
}
// Which cleans the maid offers (a slug is offered once ticked). Kept separate
// from the fee so a type can be "offered" while its price is still being typed.
let mpOffers = new Set(Object.keys(mpCleanRates));
const CLEAN_TYPES = [
  { slug: 'regular', name: 'Regular clean' },
  { slug: 'deep', name: 'Deep clean', includes: 'oven, interior windows, inside fridge, carpet, inside cupboards, wall wash', endOfLeaseOption: true },
];

// Per-clean-type fee rows. Each has an "I offer this" tick that reveals its
// hourly fee. Both cleans are hourly. The deep-clean row also carries the
// end-of-lease option and — only then — the bond-back guarantee.
function cleanFeesHTML() {
  return CLEAN_TYPES.map((t) => {
    const offered = mpOffers.has(t.slug);
    const val = mpCleanRates[t.slug];
    return `<div class="fee-row ${offered ? 'on' : ''}" data-fee="${t.slug}">
        <div class="fee-head">
          <label class="check-inline fee-offer"><input type="checkbox" class="offer-toggle" ${offered ? 'checked' : ''} /> <span class="fee-name">${escapeHtml(t.name)}</span></label>
          <span class="fee-price"><span class="fee-dollar">$</span><input type="number" class="fee-input" min="0" step="1" value="${val != null && val !== '' ? val : ''}" placeholder="—" ${offered ? '' : 'disabled'} /><span class="fee-per">/hr</span></span>
        </div>
        ${t.includes ? `<p class="fee-includes">Includes: ${escapeHtml(t.includes)}</p>` : ''}
        ${t.endOfLeaseOption ? `
          <label class="check-inline fee-eol"><input type="checkbox" class="eol-toggle" ${mpEndOfLease ? 'checked' : ''} /> Also available for end-of-lease cleans <span class="muted">— based on your deep-clean rate, but may be subject to custom pricing</span></label>
          <label class="check-inline fee-bond" ${mpEndOfLease ? '' : 'hidden'}><input type="checkbox" class="bond-toggle" ${mpBondGuaranteed ? 'checked' : ''} /> Bond-back guaranteed <span class="muted">— you'll put it right if the manager isn't satisfied</span></label>` : ''}
      </div>`;
  }).join('');
}
// The cleaner's base location as two dropdowns: city, then a suburb from that
// city. Changing the city repopulates the suburbs.
function homeLocationHTML() {
  const cityOpts = Object.keys(DEMO.towns)
    .map((c) => `<option value="${escapeHtml(c)}" ${c === mpHomeCity ? 'selected' : ''}>${escapeHtml(c)}</option>`)
    .join('');
  return `
    <div class="field"><span>Where you're based</span>
      <div class="home-loc">
        <select class="home-city" name="homeCity">${cityOpts}</select>
        <select class="home-suburb" name="homeSuburb">${homeSuburbOptions()}</select>
      </div>
    </div>`;
}
function homeSuburbOptions() {
  const subs = DEMO.towns[mpHomeCity] || [];
  return `<option value="">Select suburb…</option>` +
    subs.map((s) => `<option value="${escapeHtml(s)}" ${s === mpHomeSuburb ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
}
function wireHomeLocation(root) {
  const city = root.querySelector('.home-city');
  const suburb = root.querySelector('.home-suburb');
  if (!city || !suburb) return;
  city.addEventListener('change', () => {
    mpHomeCity = city.value;
    mpHomeSuburb = '';
    suburb.innerHTML = homeSuburbOptions();
  });
  suburb.addEventListener('change', () => { mpHomeSuburb = suburb.value; });
}

function wireCleanFees(root) {
  root.querySelectorAll('[data-fee]').forEach((row) => {
    const slug = row.dataset.fee;
    const input = row.querySelector('.fee-input');
    const offer = row.querySelector('.offer-toggle');
    const eol = row.querySelector('.eol-toggle');
    const bondLabel = row.querySelector('.fee-bond');
    const bond = row.querySelector('.bond-toggle');

    const syncFee = () => {
      const raw = input.value.trim();
      const v = Math.max(0, Math.round(Number(raw) || 0));
      if (raw !== '' && v > 0) mpCleanRates[slug] = v;
      else delete mpCleanRates[slug];
    };
    input.addEventListener('input', syncFee);

    // The offer tick is the source of truth for "do you do this clean". Ticking
    // enables the fee; unticking clears the fee and any deep-clean extras.
    if (offer) {
      offer.addEventListener('change', () => {
        if (offer.checked) {
          mpOffers.add(slug);
          input.disabled = false;
          row.classList.add('on');
          input.focus();
        } else {
          mpOffers.delete(slug);
          input.disabled = true;
          input.value = '';
          delete mpCleanRates[slug];
          row.classList.remove('on');
          if (eol) { eol.checked = false; mpEndOfLease = false; }
          if (bond) { bond.checked = false; }
          if (bondLabel) bondLabel.hidden = true;
          mpBondGuaranteed = false;
        }
      });
    }
    if (eol) {
      eol.addEventListener('change', () => {
        mpEndOfLease = eol.checked;
        if (bondLabel) bondLabel.hidden = !mpEndOfLease;
        // Bond guarantee only applies to end-of-lease work — clear it if that's off.
        if (!mpEndOfLease && bond) { bond.checked = false; mpBondGuaranteed = false; }
      });
    }
    if (bond) bond.addEventListener('change', () => { mpBondGuaranteed = bond.checked; });
  });
}
let mp = loggedIn
  ? { businessName: '', bio: '', years: '', listingStatus: 'draft', avgRating: 0, reviews: 0, bringsProducts: true, photo: '', fullName: '', residentialAddress: '' }
  : {
      businessName: profile.businessName,
      bio: profile.bio,
      years: profile.yearsExperience,
      listingStatus: profile.listingStatus,
      avgRating: profile.rating,
      reviews: profile.reviews,
      bringsProducts: !!profile.bringsProducts,
      fullName: profile.fullName || '',
      residentialAddress: profile.residentialAddress || '',
    };
if (!loggedIn) { const h = parseHome(mp.residentialAddress); mpHomeCity = h.city; mpHomeSuburb = h.suburb; }
// Load the real saved profile for the logged-in maid.
if (sessionUser?.id) {
  fetch(`/api/profile?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return;
      mp = {
        businessName: data.businessName ?? '',
        bio: data.bio ?? '',
        years: data.years ?? '',
        listingStatus: data.listingStatus ?? 'draft',
        avgRating: data.avgRating ?? 0,
        reviews: data.reviews ?? 0,
        bringsProducts: !!data.bringsProducts,
        photo: data.photo ?? '',
        fullName: data.fullName ?? '',
        residentialAddress: data.residentialAddress ?? '',
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
      { const ex = extractRates(data.cleanRates); mpCleanRates = ex.rates; mpBondGuaranteed = ex.bond; mpEndOfLease = ex.endOfLease; mpProductsOption = ex.productsOption; mpPayments = new Set(ex.payments); mpOffers = new Set(Object.keys(mpCleanRates)); }
      { const h = parseHome(mp.residentialAddress); mpHomeCity = h.city; mpHomeSuburb = h.suburb; }
      render();
      profileLoaded = true; tryAutoWizard();
    })
    .catch(() => { profileLoaded = true; tryAutoWizard(); });

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

  // Referral code + earned credit.
  fetch(`/api/referrals?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d) { referrals = d; updateRefPill(); render(); } })
    .catch(() => {});

  fetch(`/api/availability?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => { if (data?.slots) { avail = data.slots; render(); } availLoaded = true; tryAutoWizard(); })
    .catch(() => { availLoaded = true; tryAutoWizard(); });

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

// Header referral-credit pill → jump to the Subscription tab and scroll to the
// referral card, which lists everyone you've referred and whether they've joined.
document.getElementById('refPill')?.addEventListener('click', () => {
  current = 'subscription';
  tabs.querySelectorAll('.portal-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'subscription'));
  render();
  const card = panel.querySelector('.referral-card');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          <strong>Free access</strong>
          <span>Free while we build out our user base</span>
        </div>
        <p class="muted">Full access with no fees while we build out our user base. After that it's a flat
          $30/month (or $50/month for premium — top of the list).</p>
      </div>

      <div class="portal-note">
        <strong>We're onboarding cleaners first.</strong> Right now we're only accepting cleaner
        registrations while we build out the directory — households join once there's a strong network
        of cleaners for them to choose from. Get your profile ready so you're first in line.
      </div>

      <div class="dash-grid">
        <div class="stat-card"><span class="stat-num">${Number(mp.avgRating || 0).toFixed(1)}★</span><span class="stat-label">Rating (${mp.reviews || 0})</span></div>
        <div class="stat-card"><span class="stat-num">${newCount}</span><span class="stat-label">New enquiries</span></div>
        <div class="stat-card"><span class="stat-num">${avail.length}</span><span class="stat-label">Weekly slots open</span></div>
        <div class="stat-card"><span class="stat-num cap">${mp.listingStatus}</span><span class="stat-label">Listing status</span></div>
      </div>

      <div class="dash-badges">
        <h2 class="dash-badges-h">Your trust badges</h2>
        ${Badges.strip(verif)}
      </div>

      ${referralBannerHTML()}

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
        : '<div class="empty-state"><p class="muted">No enquiries yet. When a client messages you from search, it lands here, exclusively yours.</p></div>'}</div>`;
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
    return `
      <h1>Your profile</h1>
      <form class="profile-form" id="profileForm">
        <div class="avatar-row">
          <div class="avatar" id="avatar">${mp.photo ? `<img src="${escapeHtml(mp.photo)}" alt="" />` : '<span>Photo</span>'}</div>
          <div class="avatar-actions">
            <label class="btn outline sm">${mp.photo ? 'Change photo' : 'Upload photo'}<input type="file" id="photoInput" accept="image/*" hidden /></label>
            <button type="button" class="btn ghost sm" id="removePhoto" ${mp.photo ? '' : 'hidden'}>Remove</button>
          </div>
        </div>
        <label class="field"><span>Full name</span><input name="fullName" value="${escapeHtml(mp.fullName ?? '')}" placeholder="Your legal name" /></label>
        ${homeLocationHTML()}
        <label class="field"><span>Business name</span><input name="business" value="${escapeHtml(mp.businessName ?? '')}" /></label>
        <label class="field"><span>Bio</span><textarea name="bio" rows="3">${escapeHtml(mp.bio ?? '')}</textarea></label>
        <label class="field"><span>Years experience</span><input name="years" type="number" value="${mp.years ?? ''}" /></label>
        ${locSectionHTML()}
        <label class="field"><span>Cleaning products &amp; equipment</span>
          <select name="productsOption">
            ${PRODUCT_OPTIONS.map((o) => `<option value="${o.value}" ${mpProductsOption === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
          </select>
        </label>
        <div class="field"><span>Payment accepted</span>${paymentOptionsHTML()}</div>
        <div class="field"><span>Your fees</span>
          <p class="muted" style="margin:0.2rem 0 0.8rem">Both cleans are priced per hour. Leave one blank if you don't offer it. End-of-lease cleans are an option under the deep clean.</p>
          <div class="addon-list">${cleanFeesHTML()}</div>
        </div>
        <div class="field"><span>Verification</span>
          <p class="muted" style="margin:0.2rem 0 0.8rem">Verified badges show on your listing and let clients filter for you. Add each one below. We review and approve it.</p>
          ${Badges.strip(verif)}
          <div class="verif-list" style="margin-top:1rem">${VERIF_ITEMS.map(verifRow).join('')}</div>
        </div>
        <div class="save-row">
          <button class="btn solid" type="submit">Save profile</button>
          <span class="save-msg" id="profMsg"></span>
        </div>
      </form>
      ${pauseHTML()}
      ${loggedIn ? RemoveProfile.html({ billingNote: true, pauseOffer: mp.listingStatus !== 'paused' }) : ''}`;
  },

  subscription() {
    return `
      <h1>Subscription</h1>
      <div class="trial-banner">
        <strong>You're listed for free</strong>
        <p class="muted">Listed free while we build out our user base. Full access, no fees yet.</p>
      </div>
      <div class="plan-cards">
        <div class="plan">
          <p class="tag">Standard</p>
          <p class="price">$30<span>/month</span></p>
          <ul class="checks">
            <li>Stay listed in your suburbs</li>
            <li>Unlimited exclusive enquiries</li>
            <li>No commission on any job</li>
          </ul>
          <button class="btn outline full" type="button" disabled>Coming soon</button>
        </div>
        <div class="plan featured">
          <p class="tag">Premium</p>
          <p class="price">$50<span>/month</span></p>
          <ul class="checks">
            <li>Everything in Standard</li>
            <li><strong>Top of the list</strong> in your suburbs</li>
            <li>Premium badge on your profile</li>
          </ul>
          <button class="btn outline full" type="button" disabled>Coming soon</button>
        </div>
      </div>
      <p class="muted" style="max-width:62ch">We want to make a platform that's affordable for everyone
        and that maximises profits for cleaners. As we grow, we'll lower monthly costs for our cleaners.
        <strong>Pricing is subject to fall at launch, depending on demand.</strong></p>
      <p class="save-msg" id="planMsg"></p>
      ${referralsHTML()}`;
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
    panel.querySelectorAll('[data-open-wizard]').forEach((b) => b.addEventListener('click', openWizard));
    panel.querySelectorAll('[data-open-convo]').forEach((b) =>
      b.addEventListener('click', () => openEnquiryConvo(b.dataset.openConvo))
    );
    wireRefCopy(panel);
    initHowflow(panel);
  },
  availability() {
    wireCalendar(panel.querySelector('#cal'), avail, () => {
      setMsg('availMsg', 'Unsaved changes', 'pending');
    });
    panel.querySelector('#saveAvail').addEventListener('click', async () => {
      if (!sessionUser?.id) {
        setMsg('availMsg', `Saved (demo: log in as a maid to save for real). ${avail.length} slots set.`, 'ok');
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
        setMsg('availMsg', `Saved. ${data.saved} slot${data.saved === 1 ? '' : 's'} on your profile. Customers can now match these times.`, 'ok');
      } catch {
        setMsg('availMsg', 'Could not save. Please try again.', 'err');
      }
    });
  },
  enquiries() {
    panel.querySelectorAll('[data-act]').forEach((b) =>
      b.addEventListener('click', async () => {
        const enq = enquiries.find((e) => e.id === b.dataset.id);
        if (!enq) return;
        // Accepting needs a date, so it opens the little form below the card
        // rather than firing straight at the API.
        if (b.dataset.act === 'accept') return openAcceptForm(b, enq);
        const ACT = { decline: 'declined', complete: 'completed' };
        const status = ACT[b.dataset.act];
        if (!status) return;
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
    if (loggedIn) RemoveProfile.bind(sessionUser.id, {
      onPause: () => {
        const pb = panel.querySelector('#pauseBtn');
        if (pb) { pb.scrollIntoView({ behavior: 'smooth', block: 'center' }); pb.classList.add('flash'); setTimeout(() => pb.classList.remove('flash'), 1600); }
      },
    });
    // Photo is held as a data URL and saved with the rest of the profile.
    const avatar = panel.querySelector('#avatar');
    panel.querySelector('#photoInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        mp.photo = reader.result;
        render(); // refresh so Change/Remove appear
      };
      reader.readAsDataURL(file);
    });
    panel.querySelector('#removePhoto')?.addEventListener('click', () => {
      mp.photo = '';
      render();
      setMsg('profMsg', 'Photo removed. Save your profile to confirm.', 'pending');
    });
    const pauseBtn = panel.querySelector('#pauseBtn');
    pauseBtn?.addEventListener('click', async () => {
      const paused = pauseBtn.dataset.paused === 'true';
      pauseBtn.disabled = true;
      setMsg('pauseMsg', paused ? 'Resuming…' : 'Pausing…', 'pending');
      try {
        const res = await fetch('/api/profile/pause', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: sessionUser.id, paused: !paused }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'failed');
        mp.listingStatus = data.listingStatus;
        render();
      } catch {
        pauseBtn.disabled = false;
        setMsg('pauseMsg', 'Could not update your listing. Please try again.', 'err');
      }
    });
    wireHomeLocation(panel);
    wirePayments(panel);
    wireCleanFees(panel);
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
      mp.fullName = f.fullName.value;
      mp.residentialAddress = mpHomeSuburb ? `${mpHomeSuburb}, ${mpHomeCity}` : mpHomeCity;
      mp.years = f.years.value;
      mpProductsOption = f.productsOption.value;
      mp.bringsProducts = mpProductsOption !== 'supplied';
      if (!sessionUser?.id) {
        setMsg('profMsg', 'Saved (demo: log in as a maid to save for real).', 'ok');
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
            fullName: mp.fullName,
            residentialAddress: mp.residentialAddress,
            years: mp.years,
            bringsProducts: mp.bringsProducts,
            productsOption: mpProductsOption,
            payments: [...mpPayments],
            photo: mp.photo,
            cleanRates: mpCleanRates,
            bondGuaranteed: mpBondGuaranteed,
            endOfLease: mpEndOfLease,
            services: [...Object.keys(mpCleanRates), ...(mpEndOfLease ? ['end-of-tenancy'] : [])],
            areas: mpSpecific ? (DEMO.towns[mpCity] || []).filter((s) => areas.has(s)) : (DEMO.towns[mpCity] || []).slice(),
            listingStatus: 'active',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'save failed');
        setMsg('profMsg', "Saved to your profile. You're now live in search.", 'ok');
      } catch {
        setMsg('profMsg', 'Could not save. Please try again.', 'err');
      }
    });
  },
  subscription() {
    // Plans aren't purchasable yet — buttons show "Coming soon" (disabled).
    wireRefCopy(panel);
    panel.querySelectorAll('[data-start]').forEach((b) =>
      b.addEventListener('click', () => {
        current = b.dataset.start;
        tabs.querySelectorAll('.portal-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === current));
        render();
      })
    );
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
  { n: '06', h: 'Free while we build out our user base', b: `Try it now for free while we build out our user base; after that it's a flat <span class="hi">$30/month</span> (or <span class="hi">$50 for premium</span>).` },
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
  const profileSet = !!(mp.businessName && mp.businessName.trim() && (mpCleanRates.regular || mpCleanRates.deep));
  const availSet = avail.length > 0;
  const steps = [
    { n: 1, label: 'Set your profile', desc: 'Add your business name, a short bio and your fees.', tab: 'profile', done: profileSet },
    { n: 2, label: 'Set your availability', desc: 'Mark the mornings, afternoons and evenings you can work. This is what matches you to clients.', tab: 'availability', done: availSet },
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
            ${s.done ? '<span class="status status-accepted">Done</span>' : `<button class="btn solid sm" data-start="${s.tab}" type="button">Start</button>`}
          </div>`
        )
        .join('')}
    </div>
    <button class="btn solid gs-launch" data-open-wizard type="button">Set up my profile</button>
  </div>`;
}

function enquiryRow(e) {
  return `<div class="enquiry-row clickable" data-open-convo="${e.conversationId || ''}" role="button" tabindex="0">
    <div><strong>${e.customer}</strong> · ${e.service}<br /><span class="muted">${e.suburb} · ${e.when}</span></div>
    <span class="status status-${e.status}">${e.status}</span>
  </div>`;
}

// Pausing hides the listing from browse, search and matches. Nothing else
// changes — it's the reversible middle ground between staying live and removing
// the account entirely.
function pauseHTML() {
  if (!loggedIn) return '';
  const paused = mp.listingStatus === 'paused';
  return `
    <section class="pause-card">
      <h2>${paused ? 'Your listing is paused' : 'Pause your listing'}</h2>
      <p class="muted">${
        paused
          ? "You're hidden from browse, search and matches. Your account, messages and reviews are untouched. Resume whenever you're ready."
          : 'Taking a break? Hide yourself from browse, search and matches without deleting anything. Your account, messages and reviews stay exactly as they are.'
      }</p>
      <div class="save-row">
        <button class="btn ${paused ? 'solid' : 'outline'}" id="pauseBtn" type="button" data-paused="${paused}">
          ${paused ? 'Resume my listing' : 'Pause my listing'}
        </button>
        <span class="save-msg" id="pauseMsg"></span>
      </div>
    </section>`;
}

// Prominent, hard-to-miss referral pitch for the overview. Grows the network
// (our whole mission) and rewards the maid for it — so it earns top billing on
// the dashboard, not just a card buried in the subscription tab.
function referralBannerHTML() {
  if (!loggedIn) return '';
  const per = referrals ? referrals.perReferralDollars : null;
  const link = referrals
    ? `${location.origin}/login?role=maid&mode=signup&ref=${encodeURIComponent(referrals.code)}`
    : '';
  return `
    <div class="referral-banner">
      <div class="rb-body">
        <span class="rb-kicker">Grow the network, get paid for it</span>
        <h2 class="rb-head">Refer a cleaner${per ? `, earn $${per} credit` : ''}</h2>
        <p class="rb-copy">Know a great cleaner? Share your invite link. When they join and get
          ID-verified${per ? `, you earn <strong>$${per}</strong> off your future payments` : ', you earn credit off your future payments'} —
          and there's no cap on how many you can bring in.</p>
        ${referrals
          ? `<div class="rb-actions">
              <code class="ref-code">${escapeHtml(referrals.code)}</code>
              <button class="btn solid sm js-ref-copy" type="button" data-link="${escapeHtml(link)}">Copy invite link</button>
              <button class="btn outline sm" type="button" data-start="subscription">See your referrals</button>
            </div>`
          : '<p class="muted">Loading your invite link…</p>'}
      </div>
    </div>`;
}

// Copy-to-clipboard wiring for every invite-link button under `root`. Falls back
// to a prompt when the clipboard is blocked (insecure origin / permissions).
function wireRefCopy(root) {
  root.querySelectorAll('.js-ref-copy').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const link = btn.dataset.link;
      try {
        await navigator.clipboard.writeText(link);
        btn.textContent = 'Copied!';
      } catch {
        window.prompt('Copy your invite link:', link);
      }
      setTimeout(() => { btn.textContent = 'Copy invite link'; }, 1800);
    })
  );
}

// Referral card: your code, your credit, and who you've brought in. The credit
// only lands once a referred cleaner is ID-verified, so pending ones are
// shown as such rather than silently missing.
function referralsHTML() {
  if (!loggedIn) return '';
  if (!referrals) return '<div class="panel-card"><h2>Refer a cleaner</h2><p class="muted">Loading your referral code…</p></div>';

  const per = referrals.perReferralDollars;
  const link = `${location.origin}/login?role=maid&mode=signup&ref=${encodeURIComponent(referrals.code)}`;
  const rows = referrals.referrals
    .map(
      (r) => `<div class="ref-row">
        <span>${escapeHtml(r.name)}</span>
        ${r.credited
          ? `<span class="status status-accepted">+$${r.creditDollars} credited</span>`
          : '<span class="status status-new">Awaiting ID verification</span>'}
      </div>`
    )
    .join('');

  return `
    <div class="panel-card referral-card">
      <h2>Refer a cleaner</h2>
      <p class="muted">Share your code. When a cleaner you refer becomes ID-verified,
        you earn <strong>$${per}</strong> of credit toward your future payments.</p>

      <div class="ref-credit">
        <span class="ref-amount">$${referrals.creditDollars}</span>
        <span class="ref-amount-label">Referral credit</span>
      </div>

      <div class="ref-code-row">
        <code class="ref-code">${escapeHtml(referrals.code)}</code>
        <button class="btn outline sm js-ref-copy" type="button" data-link="${escapeHtml(link)}">Copy invite link</button>
      </div>
      <p class="muted ref-counts">
        ${referrals.earned} ID-verified · ${referrals.pending} awaiting verification
      </p>

      ${rows ? `<div class="ref-list">${rows}</div>` : '<p class="muted">No referrals yet. Share your code to get started.</p>'}
    </div>`;
}

// Accepting books a date. That date, not the cleaner remembering to press a
// button afterwards, is what asks the customer for a review — so it is part of
// the accept rather than an afterthought, and there is no way to skip it.
function openAcceptForm(button, enq) {
  const actions = button.parentElement;
  if (actions.querySelector('.accept-date')) return;
  // UTC, so in New Zealand this floor is never later than the local today.
  const todayISO = new Date().toISOString().slice(0, 10);
  actions.innerHTML = `
    <form class="accept-date">
      <label>Date of the clean
        <input type="date" name="scheduledOn" min="${todayISO}" required />
      </label>
      <div class="accept-date-actions">
        <button class="btn solid sm" type="submit">Confirm</button>
        <button class="btn outline sm" type="button" data-cancel>Cancel</button>
      </div>
      <p class="save-msg" role="status"></p>
    </form>`;
  const form = actions.querySelector('.accept-date');
  const msg = form.querySelector('.save-msg');
  form.querySelector('[data-cancel]').addEventListener('click', render);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const scheduledOn = form.scheduledOn.value;
    if (!scheduledOn) return;
    if (!sessionUser?.id) {
      enq.status = 'accepted';
      return render();
    }
    msg.textContent = 'Accepting…';
    msg.className = 'save-msg pending';
    try {
      const res = await fetch('/api/enquiry-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enquiryId: enq.id, userId: sessionUser.id, status: 'accepted', scheduledOn }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not accept.');
      enq.status = 'accepted';
      render();
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'save-msg err';
    }
  });
}

function enquiryCard(e) {
  // Accepting books a date; the evening of that date the customer is asked for
  // a review. "Mark clean complete" only brings that forward by hand.
  const booked = e.scheduledWhen ? `<p class="muted booked-on">Booked for ${e.scheduledWhen}</p>` : '';
  const actions =
    e.status === 'new'
      ? `<button class="btn solid sm" data-act="accept" data-id="${e.id}" type="button">Accept</button>
         <button class="btn outline sm" data-act="decline" data-id="${e.id}" type="button">Decline</button>`
      : e.status === 'accepted'
        ? `${booked}
           <button class="btn solid sm" data-act="complete" data-id="${e.id}" type="button">Mark clean complete</button>`
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
    : st === 'failed' ? '<span class="status status-new">Not accepted, re-upload</span>'
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
    <p class="loc-note muted" ${mpSpecific ? 'hidden' : ''}>Working <strong>${mpCity}-wide</strong>. Clients anywhere in ${mpCity} can find you.</p>
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
  if (!chosen.length) return '<span class="muted" style="font-size:0.85rem">No suburbs added yet. Search above and add the ones you cover.</span>';
  return chosen
    .map((s) => `<span class="area-chip">${s}<button type="button" class="area-x" data-remove="${s}" aria-label="Remove ${s}">×</button></span>`)
    .join('');
}
// These accept a root element (default: the portal panel) so the same location
// picker can be wired inside the first-run wizard modal, which lives on body.
function renderAreaChips(root = panel) {
  const box = root.querySelector('#selectedAreas');
  if (!box) return;
  box.innerHTML = areaChipsHTML();
  box.querySelectorAll('[data-remove]').forEach((b) =>
    b.addEventListener('click', () => { areas.delete(b.dataset.remove); renderAreaChips(root); })
  );
}
function renderSubResults(q, root = panel) {
  const box = root.querySelector('#subResults');
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
      const inp = root.querySelector('#subSearch');
      if (inp) { inp.value = ''; inp.focus(); }
      box.hidden = true;
      renderAreaChips(root);
    })
  );
}
function wireLocSection(root = panel) {
  root.querySelector('#citySel')?.addEventListener('change', (e) => { mpCity = e.target.value; rerenderLoc(root); });
  root.querySelector('#specificToggle')?.addEventListener('change', (e) => { mpSpecific = e.target.checked; rerenderLoc(root); });
  const inp = root.querySelector('#subSearch');
  if (inp) {
    inp.addEventListener('input', () => renderSubResults(inp.value, root));
    inp.addEventListener('focus', () => renderSubResults(inp.value, root));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const first = root.querySelector('#subResults [data-add]'); if (first) first.click(); }
    });
    // Hide the dropdown shortly after leaving the field (delay lets a click land).
    inp.addEventListener('blur', () => setTimeout(() => { const box = root.querySelector('#subResults'); if (box) box.hidden = true; }, 150));
  }
  renderAreaChips(root);
}
function rerenderLoc(root = panel) {
  const f = root.querySelector('#locField');
  if (!f) return;
  f.outerHTML = locSectionHTML();
  wireLocSection(root);
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

// ---------- First-run setup wizard ----------
// A modal that walks a new maid through the settings that make them live in
// search, then saves the profile and availability together. It lives on
// document.body so a background re-render of the portal can't wipe it, and
// reuses the same location picker, fee rows, calendar and verification
// UIs as the full profile tab.
const WIZ_STEPS = [
  { key: 'about', title: 'About you' },
  { key: 'areas', title: 'Where you work' },
  { key: 'pricing', title: 'Pricing & services' },
  { key: 'availability', title: 'Availability' },
  { key: 'verification', title: 'Verification' },
];

// Live in search once they have the essentials: a name, a regular-clean fee and
// some hours. An already-active listing is never re-prompted, so a maid who set
// up before doesn't get the wizard again.
function profileComplete() {
  if (mp.listingStatus === 'active') return true;
  const set = !!(mp.businessName && String(mp.businessName).trim() && (mpCleanRates.regular || mpCleanRates.deep));
  return set && avail.length > 0;
}
function tryAutoWizard() {
  if (profileLoaded && availLoaded) maybeAutoOpenWizard();
}
function maybeAutoOpenWizard() {
  if (wizardAutoTried || !loggedIn) return;
  wizardAutoTried = true;
  let dismissed = false;
  try { dismissed = !!sessionStorage.getItem('mm_wizard_dismissed'); } catch {}
  if (dismissed || profileComplete()) return;
  openWizard();
}

const WIZ_CONTENT = {
  about: () => `
    <p class="wiz-lede">The essentials clients see first. You can polish everything later in your profile.</p>
    <label class="field"><span>Full name</span>
      <input id="wizName" type="text" value="${escapeHtml(mp.fullName || '')}" placeholder="Your legal name" /></label>
    ${homeLocationHTML()}
    <label class="field"><span>Business or display name</span>
      <input id="wizBiz" type="text" value="${escapeHtml(mp.businessName || '')}" placeholder="e.g. Alex's Cleaning" /></label>
    <label class="field"><span>Short bio <span class="muted">(optional)</span></span>
      <textarea id="wizBio" rows="3" placeholder="A sentence or two about you and your cleaning.">${escapeHtml(mp.bio || '')}</textarea></label>`,
  areas: () => `
    <p class="wiz-lede">Where will you take jobs? Christchurch-wide by default, or narrow to specific suburbs.</p>
    ${locSectionHTML()}`,
  pricing: () => `
      <p class="wiz-lede">Both cleans are priced per hour. Leave one blank if you don't offer it. End-of-lease cleans are an option under the deep clean.</p>
      <div class="field"><span>Your fees</span>
        <div class="addon-list">${cleanFeesHTML()}</div></div>
      <label class="field"><span>Cleaning products &amp; equipment</span>
        <select id="wizProducts">
          ${PRODUCT_OPTIONS.map((o) => `<option value="${o.value}" ${mpProductsOption === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
        </select></label>
      <div class="field"><span>Payment accepted</span>${paymentOptionsHTML()}</div>`,
  availability: () => `
    <p class="wiz-lede">Tap the times you're usually free. This is what matches you to clients.</p>
    <div class="cal" id="wizCal">${calendarHTML(avail)}</div>`,
  verification: () => `
    <p class="wiz-lede">Optional — but verified badges win trust and let clients filter for you. Add them now or skip and do it later.</p>
    ${Badges.strip(verif)}
    <div class="verif-list" style="margin-top:1rem">${VERIF_ITEMS.map(verifRow).join('')}</div>`,
};

const WIZ_WIRE = {
  about: (root) => wireHomeLocation(root),
  areas: (root) => wireLocSection(root),
  pricing: (root) => { wireCleanFees(root); wirePayments(root); },
  availability: (root) => {
    const cal = root.querySelector('#wizCal');
    if (cal) wireCalendar(cal, avail, () => {});
  },
  verification: (root) => {
    root.querySelectorAll('[data-doc]').forEach((inp) =>
      inp.addEventListener('change', () => {
        const file = inp.files[0];
        if (!file || !sessionUser?.id) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const doc = inp.dataset.doc;
          verif[doc] = 'pending';
          renderWizStep(); // refresh only the wizard, never the whole portal
          const scanned = await ocrDocument(reader.result, file.type);
          if (scanned) { verifRead[doc] = scanned.slice(0, 160); renderWizStep(); }
          try {
            const res = await fetch('/api/verification', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: sessionUser.id, type: doc, documentDataUrl: reader.result, extractedText: scanned || '' }),
            });
            const data = await res.json();
            if (data && data.read) { verifRead[doc] = data.read; renderWizStep(); }
          } catch {}
        };
        reader.readAsDataURL(file);
      })
    );
  },
};

function openWizard() {
  if (wizEl) return;
  wizStep = 0;
  wizEl = document.createElement('div');
  wizEl.className = 'wiz-overlay';
  wizEl.innerHTML = `<div class="wiz" role="dialog" aria-modal="true" aria-label="Set up your profile">
    <button class="wiz-close" type="button" aria-label="Close">×</button>
    <div class="wiz-progress" id="wizProgress"></div>
    <div class="wiz-body" id="wizBody"></div>
    <p class="wiz-msg" id="wizMsg" role="status"></p>
    <div class="wiz-foot">
      <button class="btn outline" id="wizBack" type="button">Back</button>
      <div class="wiz-foot-right">
        <button class="btn ghost" id="wizSkip" type="button">Skip</button>
        <button class="btn solid" id="wizNext" type="button">Next</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wizEl);
  wizEl.querySelector('.wiz-close').addEventListener('click', dismissWizard);
  wizEl.querySelector('#wizBack').addEventListener('click', () => { if (wizStep > 0) { wizStep--; renderWizStep(); } });
  wizEl.querySelector('#wizSkip').addEventListener('click', () => advanceWizard(true));
  wizEl.querySelector('#wizNext').addEventListener('click', () => advanceWizard(false));
  renderWizStep();
}
function dismissWizard() {
  try { sessionStorage.setItem('mm_wizard_dismissed', '1'); } catch {}
  closeWizard();
}
function closeWizard() {
  if (wizEl) { wizEl.remove(); wizEl = null; }
}
function wizSetMsg(text, cls) {
  const m = wizEl && wizEl.querySelector('#wizMsg');
  if (m) { m.textContent = text || ''; m.className = 'wiz-msg ' + (cls || ''); }
}
function renderWizStep() {
  if (!wizEl) return;
  const step = WIZ_STEPS[wizStep];
  wizEl.querySelector('#wizProgress').innerHTML =
    WIZ_STEPS.map((s, i) => `<span class="wiz-dot ${i === wizStep ? 'now' : ''} ${i < wizStep ? 'done' : ''}"></span>`).join('') +
    `<span class="wiz-step-count">Step ${wizStep + 1} of ${WIZ_STEPS.length}</span>`;
  const body = wizEl.querySelector('#wizBody');
  body.innerHTML = `<h2 class="wiz-title">${step.title}</h2>` + WIZ_CONTENT[step.key]();
  WIZ_WIRE[step.key] && WIZ_WIRE[step.key](body);
  wizSetMsg('');
  wizEl.querySelector('#wizBack').style.visibility = wizStep === 0 ? 'hidden' : 'visible';
  wizEl.querySelector('#wizSkip').hidden = step.key !== 'verification';
  wizEl.querySelector('#wizNext').textContent = wizStep === WIZ_STEPS.length - 1 ? 'Finish' : 'Next';
}
// Validate/capture the current step, then move on — or save on the last step.
function captureWizStep(key) {
  if (key === 'about') {
    const name = wizEl.querySelector('#wizName').value.trim();
    const biz = wizEl.querySelector('#wizBiz').value.trim();
    if (!name) { wizSetMsg('Add your full name to continue.', 'err'); return false; }
    if (!mpHomeSuburb) { wizSetMsg('Pick the suburb you’re based in to continue.', 'err'); return false; }
    if (!biz) { wizSetMsg('Add a business or display name to continue.', 'err'); return false; }
    mp.fullName = name;
    mp.residentialAddress = `${mpHomeSuburb}, ${mpHomeCity}`;
    mp.businessName = biz;
    mp.bio = wizEl.querySelector('#wizBio').value;
    return true;
  }
  if (key === 'pricing') {
    const wp = wizEl.querySelector('#wizProducts');
    if (wp) { mpProductsOption = wp.value; mp.bringsProducts = mpProductsOption !== 'supplied'; }
    if (!mpCleanRates.regular && !mpCleanRates.deep) { wizSetMsg('Offer at least one clean and set its hourly fee to continue.', 'err'); return false; }
    return true;
  }
  if (key === 'availability') {
    if (!avail.length) { wizSetMsg('Tap at least one time you can work.', 'err'); return false; }
    return true;
  }
  // areas + verification: state is already mutated live by their own wiring.
  return true;
}
async function advanceWizard(skip) {
  const step = WIZ_STEPS[wizStep];
  if (!skip && !captureWizStep(step.key)) return;
  if (wizStep < WIZ_STEPS.length - 1) { wizStep++; renderWizStep(); return; }
  await saveWizard();
}
async function saveWizard() {
  if (!sessionUser?.id) { dismissWizard(); render(); return; }
  const nextBtn = wizEl.querySelector('#wizNext');
  nextBtn.disabled = true;
  wizSetMsg('Saving your profile…', 'pending');
  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: sessionUser.id,
        businessName: mp.businessName,
        bio: mp.bio,
        fullName: mp.fullName,
        residentialAddress: mp.residentialAddress,
        years: mp.years,
        bringsProducts: mp.bringsProducts,
        productsOption: mpProductsOption,
        payments: [...mpPayments],
        photo: mp.photo || null,
        cleanRates: mpCleanRates,
        bondGuaranteed: mpBondGuaranteed,
        endOfLease: mpEndOfLease,
        services: [...Object.keys(mpCleanRates), ...(mpEndOfLease ? ['end-of-tenancy'] : [])],
        areas: mpSpecific ? (DEMO.towns[mpCity] || []).filter((s) => areas.has(s)) : (DEMO.towns[mpCity] || []).slice(),
        listingStatus: 'active',
      }),
    });
    if (!res.ok) throw new Error('profile');
    mp.listingStatus = 'active';
    if (avail.length) {
      await fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: sessionUser.id, slots: avail }),
      });
    }
    try { sessionStorage.setItem('mm_wizard_dismissed', '1'); } catch {}
    wizSetMsg("You're all set — you're now live in search!", 'ok');
    setTimeout(() => { closeWizard(); render(); }, 1100);
  } catch {
    nextBtn.disabled = false;
    wizSetMsg('Could not save. Please check your details and try again.', 'err');
  }
}

// Everything above is defined — safe to do the first render now.
render();
