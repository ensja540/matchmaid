// Maid portal. Runs on demo data so it works standalone; if a real session
// exists we greet that user, otherwise we fall back to the demo maid.
const { DAYS, SLOTS } = DEMO;
const profile = DEMO.maidProfile;
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

let enquiries = []; // real enquiries load from the API when logged in

// A logged-in maid always starts CLEAN and loads their own data from the API -
// the demo profile is only a fallback for the standalone (not-logged-in) view.
const sessionUser = Session.get();
const loggedIn = !!sessionUser?.id;

// A client session on the maid portal used to render the whole portal against a
// client's id. Nothing failed loudly - the page looked fine - but every maid
// endpoint 404s for that id, so the referral card sat on "Loading your invite
// link…" forever with nothing to say why. Send them to their own portal.
//
// Keyed on a known role rather than "not a cleaner": homeFor() falls back to
// /customer for anything it doesn't recognise, so an unexpected role would
// bounce /customer -> /customer forever. An unknown role stays put instead.
const ROLE_HOME = { cleaner: '/maid', client: '/customer' };
if (sessionUser && sessionUser.role !== 'cleaner' && ROLE_HOME[sessionUser.role]) {
  location.replace(ROLE_HOME[sessionUser.role]);
}

// Verification process state (demo: persisted in localStorage).
const VERIF_KEY = 'mm_maid_verif';
const VERIF_ITEMS = [
  { key: 'id', label: 'ID verified', desc: 'Upload a photo of your driver licence or passport, plus a selfie so we can check it is you.', selfie: true },
  { key: 'police', label: 'Criminal check', desc: 'Upload your criminal record (Ministry of Justice) check.', extra: `Don't have a criminal check? <a href="https://checkplease.co.nz/" target="_blank" rel="noopener">Get one here</a>.` },
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
let referralsError = null; // why the fetch failed, so the card can say so
// A failure has to be visible: swallowing it left the card reading "Loading
// your invite link…" indefinitely, which reads as a slow network rather than
// as something that is never going to arrive. Named so Retry can call it again.
function loadReferrals() {
  if (!sessionUser?.id) return;
  fetch(`/api/referrals?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`server returned ${r.status}`))))
    .then((d) => { referrals = d; referralsError = null; updateRefPill(); render(); })
    .catch((err) => {
      console.error('referrals:', err);
      referralsError = err.message || 'network error';
      render();
    });
}
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
let verifSelfie = false; // ID check also needs a selfie to compare against the document
const saveVerif = () => localStorage.setItem(VERIF_KEY, JSON.stringify(verif));

const displayName = sessionUser?.fullName || profile.fullName;
// Capitalise the first name for greetings (people often type it lower-case).
const firstName = (displayName.split(' ')[0] || '').replace(/^./, (c) => c.toUpperCase());
document.getElementById('who').textContent = `Hi, ${firstName}`;
// Admin dashboard is reached directly at /admin (server-gated to the operator's
// email) - no header button, to keep the portal chrome clean.
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
// Dates the cleaner has marked off, as 'YYYY-MM-DD' -> reason. Only the "off"
// ones are held here: clearing an exception means going back to whatever the
// weekly pattern says, so its absence IS the normal state.
let availExceptions = new Map();
let availMonthOffset = 0; // 0 = this month, 1 = next, and so on
// Service areas are stored by suburb ID, not name: the same suburb name exists
// in several regions (Richmond, Bishopdale), so a name would attach the cleaner
// to the wrong region's suburb. maidSubs is the id-bearing /api/suburbs list;
// maidCityMap groups it into cities keyed "<town>|<region>" so same-named towns
// stay distinct.
let maidSubs = [];
let maidSubsFailed = false; // the /api/suburbs fetch errored - say so, don't spin
let maidCityMap = new Map(); // "town|region" -> { key, name, region, rows:[{id,name,...}] }
const areas = new Set(); // suburb IDs the cleaner has narrowed to
let mpCity = null; // a city key "<town>|<region>"; set once suburbs load
// The service area itself: a circle. `areas` is derived from it (see
// syncAreasFromCircle) and stays what the rest of the app reads.
let mpCenter = null;    // {lat, lng} - null until the profile or a default lands
let mpRadiusKm = 10;
// Suburbs inside the circle the cleaner has crossed off by hand. Kept as an
// explicit list rather than baked into `areas`, so it survives moving the
// circle - cross off Lyttelton once and it stays off when the radius changes.
const mpExcluded = new Set();

function buildMaidCities(rows) {
  maidSubs = Array.isArray(rows) ? rows : [];
  maidCityMap = new Map();
  for (const r of maidSubs) {
    const key = `${r.territorial_authority}|${r.region}`;
    if (!maidCityMap.has(key)) {
      maidCityMap.set(key, { key, name: r.territorial_authority, region: r.region, rows: [] });
    }
    maidCityMap.get(key).rows.push(r);
  }
}
const cityName = (key) => maidCityMap.get(key)?.name || '';
const cityRows = (key) => maidCityMap.get(key)?.rows || [];
// Combo items for the city field: one per city, region breaking name ties.
function maidCities() {
  return [...maidCityMap.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ id: c.key, name: c.name, region: c.region, territorial_authority: '' }));
}
function defaultCityKey() {
  for (const k of maidCityMap.keys()) if (k.startsWith('Christchurch')) return k;
  return maidCityMap.keys().next().value || null;
}
// The cleaner's own base location - the same town-then-suburb search fields
// used everywhere else, over the real suburb list (no free-text street
// address). Stored back into residential_address as "Suburb, City" so it needs
// no schema change; the id is only held to preselect the fields when editing.
let mpHomeCity = '';   // town or city name
let mpHomeSuburb = ''; // suburb within that town
let mpHomeId = null;   // its /api/suburbs row id, once the list has loaded
function parseHome(addr) {
  const parts = String(addr || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { city: '', suburb: '' };
  // A lone name is a town that is its own suburb (small towns save as one part).
  if (parts.length === 1) return { city: parts[0], suburb: parts[0] };
  return { suburb: parts[parts.length - 2], city: parts[parts.length - 1] };
}
// Saved as names, shown by id: match the stored pair back to a suburb row once
// the list is in. Town match first - the same suburb name exists in several.
function resolveHomeId() {
  if (!maidSubs.length || !mpHomeSuburb) return;
  const sub = mpHomeSuburb.toLowerCase(), town = mpHomeCity.toLowerCase();
  // A handful of small towns share a name across regions (Wainui, Kinloch), and
  // the town alone can't separate them - break the tie on the region they work in.
  const region = maidCityMap.get(mpCity)?.region;
  const named = maidSubs.filter((r) => r.name.toLowerCase() === sub);
  const inTown = named.filter((r) => (r.territorial_authority || '').toLowerCase() === town);
  const row =
    inTown.find((r) => r.region === region) || inTown[0] ||
    named.find((r) => r.region === region) || named[0];
  // Nothing matched (an old town-only value): leave the field empty rather than
  // holding a name the picker can't show, so what saves is what they can see.
  if (!row) { mpHomeSuburb = ''; mpHomeId = null; return; }
  mpHomeId = row.id;
  mpHomeSuburb = row.name;
  mpHomeCity = row.territorial_authority || row.name;
}
// "Suburb, Town", collapsed to one name when the town is its own suburb.
function homeAddress() {
  if (!mpHomeSuburb) return mpHomeCity;
  if (!mpHomeCity || mpHomeSuburb === mpHomeCity) return mpHomeSuburb;
  return `${mpHomeSuburb}, ${mpHomeCity}`;
}
// Per-clean-type fee: { slug: dollars }. A type with a fee is one the maid
// offers; no entry means they don't offer it. Both regular and deep are hourly.
// End-of-lease and its bond-back guarantee are capabilities of the deep clean,
// stored as booleans in the same clean_rates JSON (not fees).
const PRODUCT_OPTIONS = [
  { value: 'own', label: 'I bring my own products and equipment' },
  { value: 'supplied', label: 'The customer supplies products and equipment' },
  { value: 'either', label: 'Either - I can bring them or use the customer’s' },
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
// Mirrors MIN_HOURLY_RATE on the server. The server is the one that decides -
// this just stops someone typing $5, filling in the rest of the form and only
// then being told.
// Per country: A$20/hr is below the Australian casual minimum wage, so it
// cannot be the Australian floor. The server decides - this only keeps the form
// from letting someone type a number it is about to reject.
const MIN_HOURLY_RATE = MM_COUNTRY === 'AU' ? 30 : 20;
const CLEAN_TYPES = [
  { slug: 'regular', name: 'Regular clean' },
  { slug: 'deep', name: 'Deep clean', includes: 'oven, interior windows, inside fridge, carpet, inside cupboards, wall wash', endOfLeaseOption: true },
];

// Per-clean-type fee rows. Each has an "I offer this" tick that reveals its
// hourly fee. Both cleans are hourly. The deep-clean row also carries the
// end-of-lease option and - only then - the bond-back guarantee.
function cleanFeesHTML() {
  return CLEAN_TYPES.map((t) => {
    const offered = mpOffers.has(t.slug);
    const val = mpCleanRates[t.slug];
    return `<div class="fee-row ${offered ? 'on' : ''}" data-fee="${t.slug}">
        <div class="fee-head">
          <label class="check-inline fee-offer"><input type="checkbox" class="offer-toggle" ${offered ? 'checked' : ''} /> <span class="fee-name">${escapeHtml(t.name)}</span></label>
          <span class="fee-price"><span class="fee-dollar">$</span><input type="number" class="fee-input" min="${MIN_HOURLY_RATE}" step="1" value="${val != null && val !== '' ? val : ''}" placeholder="-" ${offered ? '' : 'disabled'} /><span class="fee-per">/hr</span></span>
        </div>
        ${t.includes ? `<p class="fee-includes">Includes: ${escapeHtml(t.includes)}</p>` : ''}
        ${t.endOfLeaseOption ? `
          <label class="check-inline fee-eol"><input type="checkbox" class="eol-toggle" ${mpEndOfLease ? 'checked' : ''} /> Also available for end-of-lease cleans <span class="muted">- based on your deep-clean rate, but may be subject to custom pricing</span></label>
          <label class="check-inline fee-bond" ${mpEndOfLease ? '' : 'hidden'}><input type="checkbox" class="bond-toggle" ${mpBondGuaranteed ? 'checked' : ''} /> Bond-back guaranteed <span class="muted">- you'll put it right if the manager isn't satisfied</span></label>` : ''}
      </div>`;
  }).join('');
}
// The cleaner's base location: type a town, then a suburb of that town. Both
// lists stay hidden until you start typing (see LocationPicker in combo.js).
function homeLocationHTML() {
  // Nothing here works without the suburb list, and the About step of the wizard
  // won't let anyone past until a suburb is picked - so a failed fetch has to say
  // so rather than sit on "Loading…" forever.
  const placeholder = maidSubsFailed
    ? '<p class="loc-note err">Could not load the location list. Check your connection and reload the page.</p>'
    : '<p class="loc-note muted">Loading locations…</p>';
  return `
    <div class="field"><span>Where you're based</span>
      ${maidSubs.length ? '<div class="home-loc" id="homeLoc"></div>' : placeholder}
    </div>`;
}
function wireHomeLocation(root) {
  const mount = root.querySelector('#homeLoc');
  if (!mount) return;
  LocationPicker.attach(mount, maidSubs, {
    selectedId: mpHomeId,
    onPick: (row) => {
      mpHomeId = row ? row.id : null;
      mpHomeSuburb = row ? row.name : '';
      mpHomeCity = row ? row.territorial_authority || row.name : '';
    },
  });
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
        // Bond guarantee only applies to end-of-lease work - clear it if that's off.
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

// The cleaner's saved service areas, held until the suburb list is also loaded
// (both are async, either can land first).
let loadedAreas = null;
function resolveMaidLocation() {
  if (!maidCityMap.size) return;                  // suburbs not loaded yet
  if (!mpCity) mpCity = defaultCityKey();
  resolveHomeId();                                // saved base location -> row id
  if (!loadedAreas) { render(); return; }         // no profile areas yet
  areas.clear();
  loadedAreas.forEach((a) => { if (a && a.id != null) areas.add(a.id); });
  // Pick the city holding the most of the saved suburbs.
  let best = mpCity, bestN = -1;
  for (const c of maidCityMap.values()) {
    const n = c.rows.reduce((k, r) => k + (areas.has(r.id) ? 1 : 0), 0);
    if (n > bestN) { bestN = n; best = c.key; }
  }
  mpCity = best;
  // No saved circle (a profile last edited before the map existed): fit one to
  // the suburbs they already cover, so the map opens on their real patch rather
  // than throwing it away. The server does the same for everyone on migration.
  if (!mpCenter && areas.size) {
    const rows = maidSubs.filter((r) => areas.has(r.id) && r.lat != null);
    if (rows.length) {
      mpCenter = {
        lat: rows.reduce((t, r) => t + Number(r.lat), 0) / rows.length,
        lng: rows.reduce((t, r) => t + Number(r.lng), 0) / rows.length,
      };
      mpRadiusKm = Math.max(5, Math.ceil(Math.max(...rows.map((r) => kmBetween(mpCenter, r)))));
    }
  }
  render();
  refreshWizardForSuburbs();
}
// The suburb list is ~1,700 rows and routinely lands after the profile and
// availability calls that trigger the wizard, so the wizard can render before it
// arrives. Both the About step (base location) and the Areas step (the map) are
// built from it, and About *blocks* on a suburb being picked - leave it showing
// "Loading locations…" and the cleaner is stuck on step 1 with no way forward.
// Re-render whichever of the two is open; typed input is stashed first so the
// refresh doesn't eat a half-filled form.
function refreshWizardForSuburbs() {
  if (!wizEl) return;
  // Only when the control genuinely isn't there. Both steps mount their real UI
  // (#homeLoc, #areaMap) the moment maidSubs is non-empty, so its absence is the
  // stuck state exactly - and re-rendering on top of a working step would only
  // pull focus out from under someone mid-sentence.
  const stuck = { about: '#homeLoc', areas: '#areaMap' }[WIZ_STEPS[wizStep]?.key];
  if (!stuck || wizEl.querySelector(stuck)) return;
  stashWizInputs();
  renderWizStep();
}

// The id-bearing suburb list powers both location pickers. Fetched whether or
// not anyone is logged in - it is public, and the demo profile shows the same
// fields, which sit at "Loading locations…" without it.
fetch(withCountry('/api/suburbs'))
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error('suburbs'))))
  .then((rows) => { buildMaidCities(rows || []); resolveMaidLocation(); })
  .catch(() => { maidSubsFailed = true; render(); refreshWizardForSuburbs(); });

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
      // areas arrive as {id, name, region}. Stash them; the city can only be
      // inferred once the suburb list has loaded, so reconcile both together.
      loadedAreas = Array.isArray(data.areas) ? data.areas : [];
      // The saved circle, if they have one. resolveMaidLocation fits one from
      // the suburb list when they don't.
      if (data.serviceCenter && Number.isFinite(+data.serviceCenter.lat)) {
        mpCenter = { lat: +data.serviceCenter.lat, lng: +data.serviceCenter.lng };
        if (Number.isFinite(+data.serviceRadiusKm)) mpRadiusKm = Math.round(+data.serviceRadiusKm);
      }
      mpExcluded.clear();
      (Array.isArray(data.serviceExcluded) ? data.serviceExcluded : []).forEach((id) => mpExcluded.add(Number(id)));
      // Parse the base location first - resolveMaidLocation turns it into a row id.
      { const h = parseHome(mp.residentialAddress); mpHomeCity = h.city; mpHomeSuburb = h.suburb; }
      resolveMaidLocation();
      { const ex = extractRates(data.cleanRates); mpCleanRates = ex.rates; mpBondGuaranteed = ex.bond; mpEndOfLease = ex.endOfLease; mpProductsOption = ex.productsOption; mpPayments = new Set(ex.payments); mpOffers = new Set(Object.keys(mpCleanRates)); }
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
      verifSelfie = !!s.hasSelfie;
      ['id', 'police', 'insurance'].forEach((k) => { if (s[k]) verif[k] = s[k]; });
      render();
    })
    .catch(() => {});

  loadReferrals();

  fetch(`/api/availability?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data?.slots) { avail = data.slots; render(); }
      if (Array.isArray(data?.exceptions)) {
        availExceptions = new Map(data.exceptions.filter((e) => !e.available).map((e) => [e.date, e.reason || '']));
        render();
      }
      availLoaded = true; tryAutoWizard();
    })
    .catch(() => { availLoaded = true; tryAutoWizard(); });

  // Real enquiries addressed to this maid.
  refreshEnquiries().then(render);
}

// Confirming a date in a thread changes an enquiry's status, so the list has to
// be reloaded from the same place it first came from rather than patched by
// hand in two tabs.
function refreshEnquiries() {
  if (!sessionUser?.id) return Promise.resolve();
  return fetch(`/api/enquiries?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((list) => { if (list) { enquiries = list.filter((e) => e.role === 'cleaner'); refreshBadges(); } })
    .catch(() => {});
}

// ---- Messaging (real-time; same endpoints as the customer side) ----
let convos = [];
let msgCache = {};
let activeConvo = null;
// Where the date has got to on each conversation, and which thread (if any) has
// its date picker open. Both hang off the conversation because that is where
// the two of them are agreeing it.
const bookingCache = {};
let proposingFor = null;
const mHasFetch = typeof fetch !== 'undefined';
const mGet = (u) => (mHasFetch ? fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(r))) : Promise.reject());
function refreshConvos() {
  if (!sessionUser?.id) return Promise.resolve();
  return mGet(`/api/conversations?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((list) => { convos = list; refreshBadges(); })
    .catch(() => {});
}
function loadMsgs(id) {
  return mGet(`/api/messages?conversationId=${encodeURIComponent(id)}&userId=${encodeURIComponent(sessionUser.id)}`)
    .then((data) => { msgCache[id] = data.messages || []; bookingCache[id] = data.booking || null; })
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

// ---- Perfect-review celebration -------------------------------------------
// A cleaner who gets full marks hears about it the next time they open the
// portal, once. The server decides what counts and what is still unseen; this
// only draws it and says when it has been seen.
//
// Marked seen on CLOSE rather than on load. A fetch that never rendered - a
// tab closed mid-load, a dropped connection - must not burn the only time they
// were going to be told.
const celebrateModal = document.getElementById('celebrateModal');
const celebrateBody = document.getElementById('celebrateBody');
let celebratePending = [];

function closeCelebration() {
  if (!celebrateModal || celebrateModal.hidden) return;
  celebrateModal.hidden = true;
  const ids = celebratePending.map((r) => r.id);
  celebratePending = [];
  if (!ids.length || !sessionUser?.id) return;
  fetch('/api/celebrations/seen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: sessionUser.id, reviewIds: ids }),
  }).catch(() => {
    // If this fails they see it once more next time, which is the right way
    // round: a repeat is better than never being told.
  });
}

document.getElementById('celebrateClose')?.addEventListener('click', closeCelebration);
celebrateModal?.addEventListener('click', (e) => {
  if (e.target === celebrateModal) closeCelebration();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeCelebration();
});

function celebrationHTML(list) {
  const first = list[0];
  const more = list.length - 1;
  return `
    <div class="cb-burst" aria-hidden="true">
      ${Array.from({ length: 14 }, (_, i) =>
        `<i style="--i:${i}"></i>`).join('')}
    </div>
    <p class="cb-eyebrow">${more > 0 ? `${list.length} perfect reviews` : 'A perfect review'}</p>
    <h2 class="cb-title" id="celebrateTitle">Five out of five.</h2>
    <div class="cb-stars" aria-label="5 out of 5">★★★★★</div>
    <p class="cb-who">${escapeHtml(first.from)} rated every part of your clean full marks
      <span class="cb-when">${escapeHtml(first.when)}</span></p>
    ${first.comment
      ? `<blockquote class="cb-quote">${escapeHtml(first.comment)}</blockquote>`
      : ''}
    ${more > 0
      ? `<p class="cb-more">And ${more} other${more === 1 ? '' : 's'} since you last looked.</p>`
      : ''}
    <p class="cb-note">This is what customers see first when they compare cleaners.
      Reviews like this are the reason someone picks you.</p>
    <div class="cb-actions">
      <button class="btn solid" type="button" data-cb-profile>See my profile</button>
      <button class="btn outline" type="button" data-cb-close>Nice</button>
    </div>`;
}

function showCelebration(list) {
  if (!celebrateModal || !celebrateBody || !list.length) return;
  celebratePending = list;
  celebrateBody.innerHTML = celebrationHTML(list);
  celebrateModal.hidden = false;
  celebrateBody.querySelector('[data-cb-close]')?.addEventListener('click', closeCelebration);
  celebrateBody.querySelector('[data-cb-profile]')?.addEventListener('click', () => {
    closeCelebration();
    const tab = tabs?.querySelector('[data-tab="profile"]');
    if (tab) tab.click();
  });
  document.getElementById('celebrateClose')?.focus?.();
}

function checkCelebrations() {
  if (!sessionUser?.id || !mHasFetch) return;
  mGet(`/api/celebrations?userId=${encodeURIComponent(sessionUser.id)}`)
    .then((d) => {
      const list = (d && d.reviews) || [];
      if (list.length) showCelebration(list);
    })
    .catch(() => {});
}

if (sessionUser?.id) checkCelebrations();


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

// Count bubbles on the tabs. Same approach as the customer portal: inside the
// button so it cannot drift when the tabs wrap, and removed at zero rather than
// left showing a nought.
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
  b.setAttribute('aria-label', `${n} needing attention`);
  btn.classList.add('has-badge');
}
function refreshBadges() {
  setTabBadge('messages', (convos || []).reduce((n, c) => n + (c.unread || 0), 0));
  // An enquiry stays pending until a date is agreed and confirmed, so that is
  // the count worth surfacing - it is work waiting on them, not just unread.
  setTabBadge('enquiries', (enquiries || []).filter((e) => e.status === 'new').length);
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
          <span>Free for everyone while we build NZ's biggest network</span>
        </div>
        <p class="muted">Full access, no fees, no commission on any job. Everything you earn is yours.</p>
      </div>

      <div class="portal-note">
        <strong>Households are searching now.</strong> Customers can browse cleaners and message
        whoever they pick, so anything missing from your profile costs you enquiries: a rate puts
        you in search, your hours decide which jobs you match, and an ID badge is what customers
        filter for.
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
      <h1>Your availability</h1>
      <p class="wizard-lede">Set the times you're usually free, then mark off any individual days
        you can't work. Customers match to you when they want a clean at a time you're available.</p>

      <div class="panel-card">
        <h2 class="avail-head">Your usual week</h2>
        <p class="muted">This is what customers are matched against. Tap the times you're normally free.</p>
        <div class="cal" id="cal">${calendarHTML(avail)}</div>
        <div class="save-row">
          <button class="btn solid" id="saveAvail" type="button">Save availability</button>
          <span class="save-msg" id="availMsg"></span>
        </div>
      </div>

      <div class="panel-card">
        <h2 class="avail-head">The month ahead</h2>
        <p class="muted">Your usual week, laid out on real dates. Tap a day to mark it off - a
          holiday, a booked-out Saturday - and tap it again to put it back.</p>
        ${monthHTML()}
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
      ${loggedIn ? RemoveProfile.html({ billingNote: true, pauseOffer: true, paused: mp.listingStatus === 'paused' }) : ''}`;
  },

  subscription() {
    return `
      <h1>Your plan</h1>
      <div class="trial-banner">
        <strong>Free for everyone while we build NZ's biggest network</strong>
        <p class="muted">Full access, no fees, and no commission on any job - every cent a customer
          pays you is yours. We'll give you plenty of notice before that ever changes.</p>
      </div>
      <div class="plan-cards">
        <div class="plan featured">
          <p class="tag">What you get</p>
          <p class="price">$0</p>
          <ul class="checks">
            <li>Stay listed in every suburb you cover</li>
            <li>Unlimited exclusive enquiries</li>
            <li>No commission on any job</li>
            <li>Verified badges on your profile</li>
          </ul>
        </div>
      </div>
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
    wireMonth(panel);
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
    wireBooking();
    // Same modal the Enquiries tab uses - keyed on the enquiry the conversation
    // hangs off, so there is nothing new to load or keep in step.
    panel.querySelectorAll('[data-house]').forEach((b) =>
      b.addEventListener('click', () => openClientModal(b.dataset.house))
    );
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
    if (loggedIn) RemoveProfile.bind(sessionUser.id);
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
      inp.addEventListener('change', () => submitVerificationFile(inp.files[0], inp.dataset.doc, 'doc', render))
    );
    panel.querySelectorAll('[data-selfie]').forEach((inp) =>
      inp.addEventListener('change', () => submitVerificationFile(inp.files[0], inp.dataset.selfie, 'selfie', render))
    );
    panel.querySelector('#profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      mp.businessName = f.business.value;
      mp.bio = f.bio.value;
      mp.fullName = f.fullName.value;
      mp.residentialAddress = homeAddress();
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
            // The circle is what's saved; the server resolves it to suburb ids
            // itself. `areas` rides along only for the pre-map fallback path.
            serviceCenter: mpCenter,
            serviceRadiusKm: mpRadiusKm,
            serviceExcluded: [...mpExcluded],
            areas: [...areas],
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
    // Plans aren't purchasable yet - buttons show "Coming soon" (disabled).
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
// One uploader for both halves of a verification, used by the profile tab and
// the setup wizard. `kind` is 'doc' or 'selfie'; the selfie skips OCR (there is
// no text on a face) and is only ever attached to the ID check.
async function submitVerificationFile(file, type, kind, refresh) {
  if (!file || !sessionUser?.id) return;
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
  if (!dataUrl) return;

  if (kind === 'selfie') verifSelfie = true;
  else verif[type] = 'pending';
  refresh();

  // Read the document in the browser (never on the server - a corrupt image can
  // crash the OCR worker) so we can show what was scanned.
  let scanned = null;
  if (kind === 'doc') {
    scanned = await ocrDocument(dataUrl, file.type);
    if (scanned) { verifRead[type] = scanned.slice(0, 160); refresh(); }
  }

  try {
    const body = { userId: sessionUser.id, type };
    if (kind === 'selfie') body.selfieDataUrl = dataUrl;
    else { body.documentDataUrl = dataUrl; body.extractedText = scanned || ''; }
    const res = await fetch('/api/verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      // Most likely a selfie sent before any ID document exists.
      if (kind === 'selfie') verifSelfie = false;
      refresh();
      return;
    }
    if (data && data.read) verifRead[type] = data.read;
    if (data) verifSelfie = !!data.hasSelfie;
    refresh();
  } catch {}
}

function wireVerificationUploads(root, refresh) {
  root.querySelectorAll('[data-doc]').forEach((inp) =>
    inp.addEventListener('change', () => submitVerificationFile(inp.files[0], inp.dataset.doc, 'doc', refresh))
  );
  root.querySelectorAll('[data-selfie]').forEach((inp) =>
    inp.addEventListener('change', () => submitVerificationFile(inp.files[0], inp.dataset.selfie, 'selfie', refresh))
  );
}

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

// "How Match Maid works" - six steps rendered as a scroll-driven zigzag
// timeline. Copy is fixed; emphasis (.hi) on exclusivity and the prices.
const HOWFLOW_STEPS = [
  { n: '01', h: 'Complete your profile', b: `Add your name, photo and a short bio so clients know who they're inviting in.` },
  { n: '02', h: 'Set your availability', b: `Update your weekly calendar with the mornings, middays and afternoons you can work; this is what matches you to clients.` },
  { n: '03', h: 'Set your price', b: `Add your hourly rate. You set it, and it's shown openly; no race to the bottom.` },
  { n: '04', h: 'Add your locations', b: `Search a town and toggle the suburbs you cover, or wider areas near you.` },
  { n: '05', h: `Get <span class="hi">exclusive</span> enquiries`, b: `Clients who want your services at your times reach out to <span class="hi">you alone</span>. Reply and arrange directly; <span class="hi">you keep 100%</span>.` },
  { n: '06', h: 'Free for everyone', b: `<span class="hi">Free for everyone</span> while we build New Zealand's biggest network of cleaners. No fees, and <span class="hi">no commission</span> on any job.` },
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
  // data loads - show those instantly, only observe the rest.
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
    { n: 4, label: 'Get verified', desc: 'Upload ID, a criminal check and insurance to earn trust badges.', tab: 'profile', done: ['id', 'police', 'insurance'].some((k) => verif[k] && verif[k] !== 'none') },
  ];
  // Once the profile itself is fully set up (details, availability and areas),
  // retire the whole get-started card - verification is a separate optional nudge.
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

// Prominent, hard-to-miss referral pitch for the overview. Grows the network
// (our whole mission) and rewards the maid for it - so it earns top billing on
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
        <p class="rb-copy">Know a great cleaner? Share your invite link. Once they've been on a
          paid plan for a month${per ? `, you earn <strong>$${per}</strong> off your own` : ', you earn credit off your own'} -
          and there's no cap on how many you can bring in.</p>
        <p class="rb-copy muted rb-note">Everyone is free while we build the network, so nothing
          is payable yet - referrals you make now are banked and credit once paid plans begin.</p>
        ${referrals
          ? `<div class="rb-actions">
              <code class="ref-code">${escapeHtml(referrals.code)}</code>
              <button class="btn solid sm js-ref-copy" type="button" data-link="${escapeHtml(link)}">Copy invite link</button>
              <button class="btn outline sm" type="button" data-start="subscription">See your referrals</button>
            </div>`
          : referralsError
            ? `<p class="muted">Couldn't load your invite link (${escapeHtml(referralsError)}).
                 <button class="btn outline sm js-ref-retry" type="button">Try again</button></p>`
            : '<p class="muted">Loading your invite link…</p>'}
      </div>
    </div>`;
}

// Copy-to-clipboard wiring for every invite-link button under `root`. Falls back
// to a prompt when the clipboard is blocked (insecure origin / permissions).
function wireRefCopy(root) {
  // Retry lives here rather than in its own wiring pass: both referral surfaces
  // already call wireRefCopy, so a second hook would be one more thing to
  // remember on whichever surface got added next.
  root.querySelectorAll('.js-ref-retry').forEach((btn) =>
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Trying…';
      loadReferrals();
    })
  );
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
// only lands once a referred cleaner has held a paid plan for a month, so
// everyone else is shown as pending rather than silently missing - and while
// the whole platform is free, that means everyone.
function referralsHTML() {
  if (!loggedIn) return '';
  if (!referrals) {
    return referralsError
      ? `<div class="panel-card"><h2>Refer a cleaner</h2>
           <p class="muted">Couldn't load your referral code (${escapeHtml(referralsError)}).
             <button class="btn outline sm js-ref-retry" type="button">Try again</button></p></div>`
      : '<div class="panel-card"><h2>Refer a cleaner</h2><p class="muted">Loading your referral code…</p></div>';
  }

  const per = referrals.perReferralDollars;
  const link = `${location.origin}/login?role=maid&mode=signup&ref=${encodeURIComponent(referrals.code)}`;
  const rows = referrals.referrals
    .map(
      (r) => `<div class="ref-row">
        <span>${escapeHtml(r.name)}</span>
        ${r.credited
          ? `<span class="status status-accepted">+$${r.creditDollars} credited</span>`
          : '<span class="status status-new">Credits after a paid month</span>'}
      </div>`
    )
    .join('');

  return `
    <div class="panel-card referral-card">
      <h2>Refer a cleaner</h2>
      <p class="muted">Share your code. Once a cleaner you refer has been on a paid plan for at
        least one month, you earn <strong>$${per}</strong> of credit toward your own payments.
        Match Maid is free for everyone right now, so referrals bank until paid plans start.</p>

      <div class="ref-credit">
        <span class="ref-amount">$${referrals.creditDollars}</span>
        <span class="ref-amount-label">Referral credit</span>
      </div>

      <div class="ref-code-row">
        <code class="ref-code">${escapeHtml(referrals.code)}</code>
        <button class="btn outline sm js-ref-copy" type="button" data-link="${escapeHtml(link)}">Copy invite link</button>
      </div>
      <p class="muted ref-counts">
        ${referrals.earned} credited · ${referrals.pending} pending a paid month
      </p>

      ${rows ? `<div class="ref-list">${rows}</div>` : '<p class="muted">No referrals yet. Share your code to get started.</p>'}
    </div>`;
}


// An enquiry is pending until a date is agreed. Accepted means a date is
// confirmed and in the diary - which is why nothing here offers to accept: you
// get there by agreeing a date in the conversation, not before it.
const ENQ_LABEL = { new: 'Pending', accepted: 'Booked' };
const enqLabel = (st) => ENQ_LABEL[st] || st;

function enquiryCard(e) {
  // The date, once agreed, is what asks the customer for a review on the
  // evening of the clean. "Mark clean complete" only brings that forward.
  const booked = e.scheduledWhen ? `<p class="muted booked-on">Booked for ${e.scheduledWhen}</p>` : '';
  // A standing proposal is the one thing on this card worth chasing, so it says
  // whose move it is rather than leaving a pending enquiry looking untouched.
  const pending = e.proposedWhen
    ? `<p class="muted booked-on">${e.proposedByMe
        ? `You proposed ${e.proposedWhen} · waiting on them`
        : `They proposed ${e.proposedWhen}`}</p>`
    : '<p class="muted booked-on">Message them to agree a date</p>';
  const actions =
    e.status === 'new'
      ? `${pending}
         <button class="btn outline sm" data-act="decline" data-id="${e.id}" type="button">Decline</button>`
      : e.status === 'accepted'
        ? `${booked}
           <button class="btn solid sm" data-act="complete" data-id="${e.id}" type="button">Mark clean complete</button>`
        : `<span class="status status-${e.status}">${enqLabel(e.status)}</span>`;
  return `<article class="enquiry">
    <div class="enquiry-head">
      <div><h3>${e.customer}</h3><p class="muted">${e.service} · ${e.suburb} · ${e.when}</p></div>
      <span class="status status-${e.status}">${enqLabel(e.status)}</span>
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
// A date proposal or confirmation is posted into the thread as a message so the
// agreement reads back in order with the conversation that produced it. It is
// marked out from the talking, because it is a decision rather than a remark.
function bubblesHTML(msgs) {
  if (msgs == null) return '<p class="muted" style="margin:auto">Loading…</p>';
  if (!msgs.length) return '<p class="muted" style="margin:auto">Say hello 👋</p>';
  return msgs
    .map((m) =>
      m.kind === 'date_proposal' || m.kind === 'date_confirmed'
        ? `<div class="bubble ${m.from} date-note ${m.kind === 'date_confirmed' ? 'done' : ''}">
             <p>${m.kind === 'date_confirmed' ? '✓' : '📅'} ${escapeHtml(m.body)}</p><span>${m.at}</span></div>`
        : `<div class="bubble ${m.from}"><p>${escapeHtml(m.body)}</p><span>${m.at}</span></div>`
    )
    .join('');
}

// The date of a clean is settled in the conversation, so the controls for it sit
// under the conversation - not on a card in another tab that was asking the
// cleaner to invent a date before they had spoken to anyone. Either side
// proposes, the other confirms, and that confirmation books the job.
function bookingHTML(c) {
  const b = bookingCache[c.id];
  if (!b || ['declined', 'closed', 'completed'].includes(b.status)) return '';
  if (proposingFor === c.id) {
    const todayISO = new Date().toISOString().slice(0, 10);
    return `<form class="booking-bar propose" id="proposeDate">
      <label>Date of the clean
        <input type="date" name="date" min="${todayISO}" value="${escapeHtml(b.proposedDate || b.scheduledOn || '')}" required />
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
      <span class="booking-state">Booked for <strong>${escapeHtml(b.scheduledLabel)}</strong></span>
      ${again('Change date')}
    </div>`;
  if (b.proposedLabel && b.proposedByMe)
    return `<div class="booking-bar waiting">
      <span class="booking-state">You proposed <strong>${escapeHtml(b.proposedLabel)}</strong> · waiting on them</span>
      ${again('Change')}
    </div>`;
  if (b.proposedLabel)
    return `<div class="booking-bar offered">
      <span class="booking-state">They proposed <strong>${escapeHtml(b.proposedLabel)}</strong></span>
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

// Shared by both buttons: post, refresh the thread, redraw.
async function bookingAction(url, body, msgEl) {
  if (!sessionUser?.id) return;
  if (msgEl) { msgEl.textContent = 'Saving…'; msgEl.className = 'save-msg pending'; }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, userId: sessionUser.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'That did not work.');
    proposingFor = null;
    await loadMsgs(activeConvo);
    await refreshConvos();
    await refreshEnquiries();
    render();
  } catch (err) {
    if (msgEl) { msgEl.textContent = err.message; msgEl.className = 'save-msg err'; }
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
// Person's name, with their business (if any) on a second line underneath.
// Name, then their suburb alongside it. For a cleaner reading a thread the
// suburb is the second thing they need after the name - whether the job is even
// in their patch - so it sits next to it rather than behind a profile click.
function withLabel(c) {
  return `${escapeHtml(c.with)}`
    + (c.withSuburb ? `<span class="with-suburb">${escapeHtml(c.withSuburb)}</span>` : '')
    + (c.withBusiness ? `<span class="with-biz">${escapeHtml(c.withBusiness)}</span>` : '');
}
function threadHTML(c, msgs) {
  // The name opens the house profile, and there is a labelled button beside it
  // as well: a clickable name is easy to miss, and "what does their place look
  // like" is the question you have before answering, not after.
  return `<div class="thread-head">
      ${c.enquiryId
        ? `<button class="linklike thread-who" type="button" data-house="${escapeHtml(c.enquiryId)}">${withLabel(c)}</button>
           <button class="btn outline sm" type="button" data-house="${escapeHtml(c.enquiryId)}">View house profile</button>`
        : `<strong>${withLabel(c)}</strong>`}
    </div>
    <div class="bubbles" id="bubbles">${bubblesHTML(msgs)}</div>
    ${bookingHTML(c)}
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
            ${c.unread ? `<span class="unread">${c.unread > 9 ? '9+' : c.unread}</span>` : ''}
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
  // An ID is only under review once its selfie is in too - until then it is not
  // in the admin's queue, so don't tell the maid it is being reviewed.
  const awaitingSelfie = item.selfie && st === 'pending' && !verifSelfie;
  const pill =
    st === 'verified' ? '<span class="status status-accepted">Verified ✓</span>'
    : awaitingSelfie ? '<span class="status status-new">Add a selfie to finish</span>'
    : st === 'pending' ? '<span class="status status-responded">Under review</span>'
    : st === 'failed' ? '<span class="status status-new">Not accepted, re-upload</span>'
    : '<span class="status status-new">Not added</span>';
  // Verified badges are awarded on review; the maid can (re)submit a document
  // unless already verified.
  const label = st === 'pending' ? 'Replace document' : st === 'verified' ? '' : 'Upload document';
  const action = st === 'verified'
    ? ''
    : `<label class="btn outline sm doc-upload">${label}<input type="file" accept="image/*,application/pdf" data-doc="${item.key}" hidden /></label>`;
  // ID needs a second upload: a selfie, so a reviewer can check the face on the
  // document is the person submitting it. capture="user" opens the front camera
  // on a phone rather than the file browser.
  const selfieAction = item.selfie && st !== 'verified'
    ? `<label class="btn outline sm doc-upload">${verifSelfie ? 'Retake selfie' : 'Upload selfie'}<input type="file" accept="image/*" capture="user" data-selfie="${item.key}" hidden /></label>`
    : '';
  const selfieNote = item.selfie && st !== 'verified'
    ? `<p class="verif-selfie ${verifSelfie ? 'ok' : ''}">${verifSelfie ? 'Selfie added ✓' : 'Selfie still needed'}</p>`
    : '';
  const readTxt = verifRead[item.key];
  const readNote = readTxt && st === 'pending'
    ? `<p class="verif-read muted">Scanned from your document: “${escapeHtml(readTxt)}”. If that looks wrong, upload a clearer photo.</p>`
    : '';
  return `<div class="verif-item">
    <div><strong>${item.label}</strong><br /><span class="muted">${item.desc}</span>${item.extra ? `<br /><span class="muted verif-extra">${item.extra}</span>` : ''}${selfieNote}${readNote}</div>
    <div class="verif-item-right">${pill}${action}${selfieAction}</div>
  </div>`;
}
// Location: a circle fixed to the centre of a map. Move the map to where you
// set out from, set how far you'll travel, and the suburbs inside the circle
// become your service areas. This replaced ticking suburbs one at a time -
// "everywhere within 20km" is how cleaners actually think about it, and it
// crosses town boundaries for free (Amberley to the top of Christchurch is one
// pan, not forty ticks).
//
// The circle is only the input. What gets saved and matched on is still the
// suburb id list, resolved from the circle - by the server on save, and here for
// the live count. Both use the same haversine, so they agree.
// Everything the circle reaches, before the cleaner's own opt-outs.
function inCircleSuburbs() {
  if (!mpCenter) return [];
  return maidSubs.filter((r) => r.lat != null && kmBetween(mpCenter, r) <= mpRadiusKm);
}
// What they'll actually be found for: inside the circle, minus the ones they've
// crossed off. A circle can't express "everywhere within 20km except over the
// hill", and that exception is common enough to be worth keeping.
function coveredSuburbs() {
  return inCircleSuburbs().filter((r) => !mpExcluded.has(r.id));
}
function kmBetween(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
// `areas` still drives the save payload and the rest of the portal, so keep it
// in step with the circle rather than making every reader understand geometry.
function syncAreasFromCircle() {
  areas.clear();
  coveredSuburbs().forEach((r) => areas.add(r.id));
}
// Where to centre the map the first time: their own suburb, else the middle of
// their town, else the country's default.
function defaultCenter() {
  const home = maidSubs.find((r) => r.id === mpHomeId && r.lat != null);
  if (home) return { lat: Number(home.lat), lng: Number(home.lng) };
  const rows = cityRows(mpCity).filter((r) => r.lat != null);
  if (rows.length) {
    return {
      lat: rows.reduce((t, r) => t + Number(r.lat), 0) / rows.length,
      lng: rows.reduce((t, r) => t + Number(r.lng), 0) / rows.length,
    };
  }
  return { lat: -43.5321, lng: 172.6362 }; // Christchurch
}
function locSectionHTML() {
  if (!maidSubs.length) {
    return `<div class="field" id="locField"><span>Where you work</span>
      <p class="loc-note muted">Loading locations…</p></div>`;
  }
  const covered = coveredSuburbs();
  return `<div class="field" id="locField">
    <span>Where you work</span>
    <p class="loc-note muted">Drag the pin to where you set out from, then set how far you'll travel. Clients inside the circle can find you.</p>
    <div class="area-map" id="areaMap"></div>
    <div class="radius-row">
      <input type="range" id="radiusRange" min="1" max="100" step="1" value="${mpRadiusKm}"
        aria-label="How far you'll travel, in kilometres" />
      <span class="radius-val"><strong id="radiusOut">${mpRadiusKm}</strong> km</span>
    </div>
    <p class="loc-cover">Covers <strong id="coverCount">${covered.length}</strong> ${covered.length === 1 ? 'suburb' : 'suburbs'}
      <button type="button" class="link-btn" id="coverToggle" aria-expanded="false">see the list</button></p>
    <div class="area-chips" id="coverList" hidden>${coverListHTML()}</div>
    <div id="excludedRow">${excludedHTML()}</div>
  </div>`;
}
function chipTown(r) {
  return r.territorial_authority && r.territorial_authority !== r.name
    ? `<span class="chip-town">${escapeHtml(r.territorial_authority)}</span>`
    : '';
}
function coverListHTML() {
  const covered = coveredSuburbs().sort((a, b) => kmBetween(mpCenter, a) - kmBetween(mpCenter, b));
  if (!covered.length) return '<span class="muted" style="font-size:0.85rem">Nothing inside the circle yet - widen it or move the map.</span>';
  // Nearest first, and each one carries its town: seeing "Rangiora" appear at
  // 25km is the check that the circle reaches where they meant it to.
  return covered
    .map((r) => `<span class="area-chip">${escapeHtml(r.name)}${chipTown(r)}<button type="button" class="area-x" data-drop="${r.id}" aria-label="Don't work in ${escapeHtml(r.name)}">×</button></span>`)
    .join('');
}
// Only the crossed-off suburbs the circle still reaches. One they've moved away
// from is no longer a choice they need to see - but it stays in the set, so it
// comes back crossed off if the circle returns.
function excludedHTML() {
  const off = inCircleSuburbs().filter((r) => mpExcluded.has(r.id));
  if (!off.length) return '';
  return `<p class="loc-excluded">Not working in:
    ${off.map((r) => `<span class="area-chip off">${escapeHtml(r.name)}${chipTown(r)}<button type="button" class="area-x" data-restore="${r.id}" aria-label="Work in ${escapeHtml(r.name)} after all">↺</button></span>`).join('')}</p>`;
}
// Live readout as the map pans or the slider runs - no save needed to see it.
function refreshCoverage(root = panel) {
  syncAreasFromCircle();
  const covered = coveredSuburbs();
  const count = root.querySelector('#coverCount');
  if (count) {
    count.textContent = covered.length;
    count.nextSibling && (count.nextSibling.textContent = ` ${covered.length === 1 ? 'suburb' : 'suburbs'} `);
  }
  const list = root.querySelector('#coverList');
  if (list && !list.hidden) list.innerHTML = coverListHTML();
  const off = root.querySelector('#excludedRow');
  if (off) off.innerHTML = excludedHTML();
}
// One Leaflet map per mount. Held so a re-render can tear the old one down -
// Leaflet leaves listeners on a detached container otherwise.
let areaMap = null;
function wireLocSection(root = panel) {
  const mount = root.querySelector('#areaMap');
  if (!mount || typeof L === 'undefined') return;
  if (!mpCenter) mpCenter = defaultCenter();

  if (areaMap) { areaMap.remove(); areaMap = null; }
  // scrollWheelZoom starts off on purpose: the map sits mid-form, and hijacking
  // the page scroll to zoom is the single most hated map behaviour there is.
  // mmHoverZoom below arms it only while the pointer is over the map, which is
  // the compromise - two fingers zoom when you are on it, and never when you are
  // just scrolling past.
  // setView is not optional: Leaflet cannot project a layer onto a map with no
  // centre, so adding the circle first throws and takes the whole picker with it.
  // maxBounds is the validation box (165..180 E, -48..-33 S), not a looser frame
  // around it: the pin cannot be dragged outside the visible map, so keeping the
  // view inside the box keeps the pin inside it too. The clamp on drag is the
  // real guarantee; this just stops you being able to aim somewhere invalid.
  const map = L.map(mount, {
    scrollWheelZoom: false, zoomControl: true,
    maxBounds: [[-48, 165], [-33, 180]], maxBoundsViscosity: 1,
  }).setView([mpCenter.lat, mpCenter.lng], 11);
  areaMap = map;
  if (window.mmHoverZoom) mmHoverZoom(map, mount);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // Drag the pin, not the map.
  //
  // This used to pin the circle to the map centre and have you pan the map
  // underneath it. That reads as inverted: to move your area north you had to
  // drag the map south, because the thing under your finger goes the opposite
  // way to the thing you are aiming. Now the pin is the handle - it follows your
  // finger - and panning the map just looks around, leaving your area where you
  // put it on the ground.
  //
  // interactive:false on the circle so a drag starting anywhere over it still
  // pans the map, rather than the fill swallowing the gesture.
  const circle = L.circle(mpCenter, {
    radius: mpRadiusKm * 1000, className: 'area-circle', interactive: false,
    color: '#b87333', weight: 1.5, fillColor: '#b87333', fillOpacity: 0.12,
  }).addTo(map);

  // A draggable marker rather than a hand-rolled pointer handler: L.Marker
  // already does touch, inertia and keyboard, which a custom mousedown/mousemove
  // would have to reimplement and get wrong on phones.
  const pin = L.marker(mpCenter, {
    draggable: true,
    keyboard: true,
    // Pan the map when the pin is dragged to the edge, so reaching the next
    // suburb over doesn't mean drop, pan, pick it up again.
    autoPan: true,
    autoPanPadding: [40, 40],
    title: 'Drag to where you set out from',
    icon: L.divIcon({ className: 'area-pin', iconSize: [18, 18], iconAnchor: [9, 9] }),
  }).addTo(map);

  const clamp = (ll) => ({
    lat: Math.min(-33, Math.max(-48, ll.lat)),
    lng: Math.min(180, Math.max(165, ll.lng)),
  });
  const fitRadius = () => map.fitBounds(circle.getBounds().pad(0.12));
  fitRadius();

  // 'drag' fires continuously, so the circle and the covered-suburb count follow
  // the pin live - suburbs drop in and out as you move it. The clamp is
  // belt-and-braces: a centre the server would reject can never be what is
  // saved, even if a fling carries the pin past the edge.
  pin.on('drag', () => {
    mpCenter = clamp(pin.getLatLng());
    circle.setLatLng(mpCenter);
    refreshCoverage(root);
  });
  // Snap the pin back onto the clamped point, so what you see is what saves.
  pin.on('dragend', () => {
    pin.setLatLng(mpCenter);
    circle.setLatLng(mpCenter);
    refreshCoverage(root);
  });
  // Tapping the map is a second way to place it - easier than a long drag when
  // the spot is off in the corner.
  map.on('click', (e) => {
    mpCenter = clamp(e.latlng);
    pin.setLatLng(mpCenter);
    circle.setLatLng(mpCenter);
    refreshCoverage(root);
  });

  const range = root.querySelector('#radiusRange');
  const out = root.querySelector('#radiusOut');
  range?.addEventListener('input', () => {
    mpRadiusKm = Number(range.value);
    if (out) out.textContent = mpRadiusKm;
    circle.setRadius(mpRadiusKm * 1000);
    refreshCoverage(root);
  });
  // Zoom to the new radius on release, not on every step - the map lurching
  // under a moving thumb makes the slider feel like it's fighting you.
  range?.addEventListener('change', fitRadius);

  // Delegated: both lists are re-rendered on every change, so binding each
  // chip's button would mean rebinding them all on every drag frame.
  root.querySelector('#locField')?.addEventListener('click', (e) => {
    const drop = e.target.closest('[data-drop]');
    const back = e.target.closest('[data-restore]');
    if (!drop && !back) return;
    if (drop) mpExcluded.add(Number(drop.dataset.drop));
    if (back) mpExcluded.delete(Number(back.dataset.restore));
    refreshCoverage(root);
  });

  const toggle = root.querySelector('#coverToggle');
  toggle?.addEventListener('click', () => {
    const list = root.querySelector('#coverList');
    if (!list) return;
    list.hidden = !list.hidden;
    if (!list.hidden) list.innerHTML = coverListHTML();
    toggle.setAttribute('aria-expanded', String(!list.hidden));
    toggle.textContent = list.hidden ? 'see the list' : 'hide the list';
  });

  // The container has no size until the panel is laid out; Leaflet needs a nudge
  // once it does. Bail if a re-render has already replaced this map - the timer
  // outlives it, and poking a torn-down map throws.
  setTimeout(() => { if (areaMap === map) { map.invalidateSize(); fitRadius(); } }, 60);
  refreshCoverage(root);
}
// Used when the suburb list lands after the section has already rendered.
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
// ---------- The month ahead ----------
// A calendar of real dates, coloured by the weekly pattern above it. It is a
// VIEW of that pattern plus per-date exceptions, not a second source of truth -
// so a cleaner who thinks in "most Tuesdays" sets it once, and only reaches for
// a date when a particular one differs.
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The grid runs Mon..Sun to match the weekly calendar above it, but JS weeks
// start on Sunday - so getDay() is rotated rather than used raw.
const mondayIndex = (jsDay) => (jsDay + 6) % 7;

function slotsForWeekday(dayIdx) {
  return SLOTS.filter((s) => avail.some((a) => a.day === dayIdx && a.slot === s.key));
}

function monthHTML() {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + availMonthOffset, 1);
  const year = base.getFullYear(), month = base.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = mondayIndex(first.getDay());
  const todayStr = ymd(now);

  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="m-pad"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const key = ymd(date);
    const slots = slotsForWeekday(mondayIndex(date.getDay()));
    const off = availExceptions.has(key);
    const past = key < todayStr;
    const cls = [
      'm-day',
      off ? 'off' : '',
      !slots.length ? 'blank' : '',
      key === todayStr ? 'today' : '',
      past ? 'past' : '',
    ].filter(Boolean).join(' ');
    // Past days are shown for context but not editable - marking off a day that
    // has already happened does nothing except confuse the count.
    const label = off ? 'Marked off' : slots.length ? slots.map((s) => s.label).join(', ') : 'Not usually working';
    cells += `<button type="button" class="${cls}" data-date="${key}" ${past ? 'disabled' : ''}
        title="${escapeHtml(label)}" aria-label="${d} ${MONTH_NAMES[month]} - ${escapeHtml(label)}">
        <span class="m-num">${d}</span>
        <span class="m-slots">${off ? 'Off' : slots.map((s) => `<i class="m-dot m-${s.key}"></i>`).join('')}</span>
      </button>`;
  }

  const offThisMonth = [...availExceptions.keys()].filter((k) => k.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)).length;
  return `
    <div class="month-nav">
      <button class="btn outline sm" type="button" data-month="-1" ${availMonthOffset <= 0 ? 'disabled' : ''}>‹ Previous</button>
      <strong class="month-title">${MONTH_NAMES[month]} ${year}</strong>
      <button class="btn outline sm" type="button" data-month="1" ${availMonthOffset >= 11 ? 'disabled' : ''}>Next ›</button>
    </div>
    <div class="month-grid">
      ${DAYS.map((d) => `<div class="m-head">${d}</div>`).join('')}
      ${cells}
    </div>
    <p class="month-legend">
      ${SLOTS.map((s) => `<span class="m-key"><i class="m-dot m-${s.key}"></i>${s.label}</span>`).join('')}
      <span class="m-key"><i class="m-dot m-offkey"></i>Marked off</span>
    </p>
    ${offThisMonth ? `<p class="muted month-note">${offThisMonth} day${offThisMonth === 1 ? '' : 's'} marked off this month.</p>` : ''}`;
}

function wireMonth(root) {
  root.querySelectorAll('[data-month]').forEach((b) =>
    b.addEventListener('click', () => {
      availMonthOffset = Math.max(0, Math.min(11, availMonthOffset + Number(b.dataset.month)));
      render();
    })
  );
  root.querySelectorAll('[data-date]').forEach((b) =>
    b.addEventListener('click', async () => {
      const date = b.dataset.date;
      const nowOff = !availExceptions.has(date);
      // Optimistic: the grid answers immediately and is put back if the save
      // fails. A calendar that waits on a round trip per tap feels broken.
      if (nowOff) availExceptions.set(date, ''); else availExceptions.delete(date);
      render();
      if (!sessionUser?.id) return;
      try {
        const res = await fetch('/api/availability/exception', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: sessionUser.id, date, off: nowOff }),
        });
        if (!res.ok) throw new Error('save failed');
      } catch {
        if (nowOff) availExceptions.delete(date); else availExceptions.set(date, '');
        render();
        setMsg('availMsg', "Couldn't save that day. Try again.", 'err');
      }
    })
  );
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
    <p class="wiz-lede">How far will you travel for a job? Centre the map where you set out from and stretch the circle to suit.</p>
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
    <p class="wiz-lede">Optional - but verified badges win trust and let clients filter for you. Add them now or skip and do it later.</p>
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
    // refresh only the wizard, never the whole portal
    wireVerificationUploads(root, renderWizStep);
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
// Capture-without-validating, for a re-render the cleaner didn't ask for (the
// suburb list landing mid-step). captureWizStep is the gate; this one only
// preserves. The other steps write into state as you touch them, so About - the
// only step of plain text inputs - is all there is to save.
function stashWizInputs() {
  if (!wizEl || WIZ_STEPS[wizStep]?.key !== 'about') return;
  const name = wizEl.querySelector('#wizName');
  const biz = wizEl.querySelector('#wizBiz');
  const bio = wizEl.querySelector('#wizBio');
  if (name) mp.fullName = name.value;
  if (biz) mp.businessName = biz.value;
  if (bio) mp.bio = bio.value;
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
// Validate/capture the current step, then move on - or save on the last step.
function captureWizStep(key) {
  if (key === 'about') {
    const name = wizEl.querySelector('#wizName').value.trim();
    const biz = wizEl.querySelector('#wizBiz').value.trim();
    if (!name) { wizSetMsg('Add your full name to continue.', 'err'); return false; }
    if (!mpHomeSuburb) { wizSetMsg('Pick the suburb you’re based in to continue.', 'err'); return false; }
    if (!biz) { wizSetMsg('Add a business or display name to continue.', 'err'); return false; }
    mp.fullName = name;
    mp.residentialAddress = homeAddress();
    mp.businessName = biz;
    mp.bio = wizEl.querySelector('#wizBio').value;
    return true;
  }
  if (key === 'pricing') {
    const wp = wizEl.querySelector('#wizProducts');
    if (wp) { mpProductsOption = wp.value; mp.bringsProducts = mpProductsOption !== 'supplied'; }
    if (!mpCleanRates.regular && !mpCleanRates.deep) { wizSetMsg('Offer at least one clean and set its hourly fee to continue.', 'err'); return false; }
    const tooLow = Object.entries(mpCleanRates).filter(([, v]) => typeof v === 'number' && v > 0 && v < MIN_HOURLY_RATE);
    if (tooLow.length) { wizSetMsg(`The lowest hourly rate on Match Maid is $${MIN_HOURLY_RATE}. Please raise your fee to continue.`, 'err'); return false; }
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
        serviceCenter: mpCenter,
        serviceRadiusKm: mpRadiusKm,
        serviceExcluded: [...mpExcluded],
        areas: [...areas],
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
    wizSetMsg("You're all set - you're now live in search!", 'ok');
    setTimeout(() => { closeWizard(); render(); }, 1100);
  } catch {
    nextBtn.disabled = false;
    wizSetMsg('Could not save. Please check your details and try again.', 'err');
  }
}

// Everything above is defined - safe to do the first render now.
render();
