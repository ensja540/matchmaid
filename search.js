// Guided customer search wizard. Hand-holds the customer through preferences,
// then asks /api/match for cleaners ranked by relevance.
const user = Session.require('client');

// ---- Shared slot model (mirrors the server) ----
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS = [
  { key: 'am', label: 'Morning', time: '8am – 12pm' },
  { key: 'lunch', label: 'Midday', time: '12pm – 2pm' },
  { key: 'pm', label: 'Afternoon', time: '2pm – 6pm' },
];
const DURATIONS = [
  { h: 1, label: '1 hour', hint: 'Quick tidy' },
  { h: 2, label: '2 hours', hint: 'Standard clean' },
  { h: 3, label: '3 hours', hint: 'Bigger home' },
  { h: 4, label: 'Half day', hint: 'Deep / move-out' },
];

// ---- Wizard state ----
const state = {
  suburb: '',
  service: '',
  serviceLabel: '',
  duration: 2,
  desiredRate: 35,
  slots: [], // [{day, slot}]
};
let suburbs = [];
let services = [];

// ---- Step definitions ----
const steps = ['intro', 'suburb', 'service', 'duration', 'budget', 'when', 'results'];
let stepIndex = 0;

const host = document.getElementById('stepHost');
const progress = document.getElementById('progress');
const backBtn = document.getElementById('backBtn');
const nextBtn = document.getElementById('nextBtn');
const nav = document.getElementById('wizardNav');

document.getElementById('who').textContent = `Hi, ${user.fullName.split(' ')[0]}`;
document.getElementById('logout').addEventListener('click', () => {
  Session.clear();
  location.href = '/';
});

// ---- Load reference data, then start ----
init();
async function init() {
  try {
    [suburbs, services] = await Promise.all([
      fetch('/api/suburbs').then((r) => r.json()),
      fetch('/api/services').then((r) => r.json()),
    ]);
  } catch {
    suburbs = [];
    services = [];
  }
  render();
}

// ---- Rendering ----
function render() {
  const step = steps[stepIndex];
  progress.innerHTML = steps
    .slice(0, -1) // don't dot the results screen
    .map((_, i) => `<span class="dot ${i <= stepIndex ? 'on' : ''}"></span>`)
    .join('');

  const R = RENDERERS[step];
  host.innerHTML = R();
  wire[step]?.();

  // Nav visibility
  backBtn.style.visibility = stepIndex === 0 ? 'hidden' : 'visible';
  if (step === 'results') {
    nav.style.display = 'none';
  } else {
    nav.style.display = '';
    nextBtn.textContent = step === 'when' ? 'See my matches' : 'Next';
  }
  updateNextEnabled();
}

const RENDERERS = {
  intro: () => `
    <p class="eyebrow">Let's find your cleaner</p>
    <h1>A few quick questions.</h1>
    <p class="wizard-lede">We'll ask where you are, what you need, when suits you and your ideal
      price. Then we'll show you local maids ranked by how well they match, closest first.
      It takes about a minute.</p>
    <ul class="checks">
      <li>See rates up front, no surprises</li>
      <li>Contact only the one you choose</li>
      <li>Always free for you</li>
    </ul>`,

  suburb: () => `
    <p class="step-count">Step 1 of 5</p>
    <h2>Which suburb are you in?</h2>
    <p class="wizard-lede">We'll show cleaners who cover your area.</p>
    <div class="option-grid" id="suburbGrid">
      ${suburbs
        .map(
          (s) =>
            `<button type="button" class="option ${state.suburb === s.name ? 'sel' : ''}"
               data-suburb="${s.name}">${s.name}</button>`
        )
        .join('')}
    </div>`,

  service: () => `
    <p class="step-count">Step 2 of 5</p>
    <h2>What do you need done?</h2>
    <p class="wizard-lede">Pick the type of clean that fits best.</p>
    <div class="option-grid" id="serviceGrid">
      ${services
        .map(
          (s) =>
            `<button type="button" class="option ${state.service === s.slug ? 'sel' : ''}"
               data-slug="${s.slug}" data-label="${s.name}">${s.name}</button>`
        )
        .join('')}
    </div>`,

  duration: () => `
    <p class="step-count">Step 3 of 5</p>
    <h2>How long a clean?</h2>
    <p class="wizard-lede">A rough guide is fine, you can confirm details with your cleaner.</p>
    <div class="option-grid" id="durationGrid">
      ${DURATIONS.map(
        (d) =>
          `<button type="button" class="option tall ${state.duration === d.h ? 'sel' : ''}"
             data-h="${d.h}"><strong>${d.label}</strong><span>${d.hint}</span></button>`
      ).join('')}
    </div>`,

  budget: () => `
    <p class="step-count">Step 4 of 5</p>
    <h2>What's your ideal hourly rate?</h2>
    <p class="wizard-lede">You set your price, cleaners set theirs, and we match as close as we can.
      Cleaners above your rate still show, just lower down.</p>
    <div class="slider-wrap">
      <output class="slider-value" id="rateOut">$${state.desiredRate}/hr</output>
      <div class="rate-hist" id="rateHist" hidden aria-hidden="true"></div>
      <input type="range" id="rate" min="20" max="80" step="1" value="${state.desiredRate}" />
      <div class="slider-scale"><span>$20</span><span>$80</span></div>
      <p class="hist-caption muted" id="histCaption"></p>
      <p class="est" id="estLine"></p>
    </div>`,

  when: () => `
    <p class="step-count">Step 5 of 5</p>
    <h2>When would suit you?</h2>
    <p class="wizard-lede">Tap the times you're free. A match happens when a cleaner is free at the
      same time. Pick as many as you like, more choices means more matches.</p>
    <div class="cal" id="cal">${calendarHTML(state.slots, false)}</div>
    <p class="cal-hint" id="calHint"></p>`,

  results: () => `
    <p class="eyebrow">Your matches</p>
    <h2>Cleaners for you, best first.</h2>
    <p class="wizard-lede" id="resultsSummary">Finding your matches…</p>
    <div id="resultsList" class="results"></div>
    <div class="results-actions">
      <button class="btn outline" id="editBtn" type="button">Change my preferences</button>
    </div>`,
};

// ---- Per-step wiring ----
const wire = {
  suburb() {
    host.querySelectorAll('[data-suburb]').forEach((b) =>
      b.addEventListener('click', () => {
        state.suburb = b.dataset.suburb;
        host.querySelectorAll('[data-suburb]').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        updateNextEnabled();
      })
    );
  },
  service() {
    host.querySelectorAll('[data-slug]').forEach((b) =>
      b.addEventListener('click', () => {
        state.service = b.dataset.slug;
        state.serviceLabel = b.dataset.label;
        host.querySelectorAll('[data-slug]').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        updateNextEnabled();
      })
    );
  },
  duration() {
    host.querySelectorAll('[data-h]').forEach((b) =>
      b.addEventListener('click', () => {
        state.duration = Number(b.dataset.h);
        host.querySelectorAll('[data-h]').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
      })
    );
  },
  budget() {
    const rate = host.querySelector('#rate');
    const out = host.querySelector('#rateOut');
    const est = host.querySelector('#estLine');
    const hist = host.querySelector('#rateHist');
    const caption = host.querySelector('#histCaption');
    const MIN = 20, MAX = 80, BUCKET = 5;
    const nBuckets = (MAX - MIN) / BUCKET; // 12 columns across the slider range
    const bucketOf = (v) => Math.min(nBuckets - 1, Math.max(0, Math.floor((v - MIN) / BUCKET)));
    let rates = [];
    let loaded = false;

    // Draw the histogram of where cleaners' rates sit, highlighting the buckets
    // at or below the customer's chosen rate (i.e. within their budget).
    const renderHist = () => {
      if (!loaded) return;
      if (!rates.length) { hist.hidden = true; return; }
      hist.hidden = false;
      const counts = new Array(nBuckets).fill(0);
      rates.forEach((r) => { counts[bucketOf(r)]++; });
      const maxC = Math.max(...counts, 1);
      hist.innerHTML = counts
        .map((c, i) => {
          const lo = MIN + i * BUCKET;
          const inBudget = lo + BUCKET / 2 <= state.desiredRate; // bucket midpoint within budget
          const h = c ? Math.round((c / maxC) * 100) : 0;
          return `<span class="hist-bar ${inBudget ? 'in' : ''}" style="height:${h}%" title="$${lo}–$${lo + BUCKET}/hr: ${c} cleaner${c === 1 ? '' : 's'}"></span>`;
        })
        .join('');
    };
    const updateCaption = () => {
      if (!loaded) return;
      if (!rates.length) {
        caption.textContent = `Not enough cleaners in ${state.suburb} yet to show the price spread.`;
        return;
      }
      const within = rates.filter((r) => r <= state.desiredRate).length;
      caption.textContent = `${within} of ${rates.length} cleaner${rates.length === 1 ? '' : 's'} here ${
        within === 1 ? 'is' : 'are'
      } at or below $${state.desiredRate}/hr.`;
    };
    const sync = () => {
      state.desiredRate = Number(rate.value);
      out.textContent = `$${state.desiredRate}/hr`;
      est.textContent = `About $${state.desiredRate * state.duration} for a ${
        DURATIONS.find((d) => d.h === state.duration).label.toLowerCase()
      } visit at this rate.`;
      renderHist();
      updateCaption();
    };
    rate.addEventListener('input', sync);
    sync();

    // Pull the real spread of cleaner rates for this suburb + service.
    if (state.suburb && state.service) {
      fetch(`/api/cleaner-rates?suburb=${encodeURIComponent(state.suburb)}&service=${encodeURIComponent(state.service)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          loaded = true;
          rates = d && Array.isArray(d.rates) ? d.rates : [];
          renderHist();
          updateCaption();
        })
        .catch(() => {});
    }
  },
  when() {
    wireCalendar(host.querySelector('#cal'), state.slots, () => {
      host.querySelector('#calHint').textContent = state.slots.length
        ? `${state.slots.length} time${state.slots.length > 1 ? 's' : ''} selected.`
        : '';
      updateNextEnabled();
    });
    wire.when.updateHint = true;
    host.querySelector('#calHint').textContent = state.slots.length
      ? `${state.slots.length} time${state.slots.length > 1 ? 's' : ''} selected.`
      : '';
  },
  results() {
    host.querySelector('#editBtn').addEventListener('click', () => {
      stepIndex = steps.indexOf('when');
      render();
    });
    runMatch();
  },
};

// ---- Calendar helpers (shared shape with availability page) ----
function calendarHTML(selected, readonlyLabels) {
  const isSel = (day, slot) => selected.some((s) => s.day === day && s.slot === slot);
  let html = '<div class="cal-grid">';
  html += '<div class="cal-corner"></div>';
  DAYS.forEach((d) => (html += `<div class="cal-day">${d}</div>`));
  SLOTS.forEach((slot) => {
    html += `<div class="cal-slot"><strong>${slot.label}</strong><span>${slot.time}</span></div>`;
    DAYS.forEach((_, day) => {
      html += `<button type="button" class="cal-cell ${isSel(day, slot.key) ? 'on' : ''}"
        data-day="${day}" data-slot="${slot.key}" aria-pressed="${isSel(day, slot.key)}"></button>`;
    });
  });
  html += '</div>';
  return html;
}

function wireCalendar(container, selected, onChange) {
  container.querySelectorAll('.cal-cell').forEach((cell) =>
    cell.addEventListener('click', () => {
      const day = Number(cell.dataset.day);
      const slot = cell.dataset.slot;
      const i = selected.findIndex((s) => s.day === day && s.slot === slot);
      if (i >= 0) selected.splice(i, 1);
      else selected.push({ day, slot });
      const on = i < 0;
      cell.classList.toggle('on', on);
      cell.setAttribute('aria-pressed', String(on));
      onChange?.();
    })
  );
}

// ---- Nav / validation ----
function canAdvance() {
  switch (steps[stepIndex]) {
    case 'suburb':
      return !!state.suburb;
    case 'service':
      return !!state.service;
    case 'when':
      return state.slots.length > 0;
    default:
      return true;
  }
}
function updateNextEnabled() {
  nextBtn.disabled = !canAdvance();
}

backBtn.addEventListener('click', () => {
  if (stepIndex > 0) stepIndex--;
  render();
});
nextBtn.addEventListener('click', () => {
  if (!canAdvance()) return;
  if (stepIndex < steps.length - 1) stepIndex++;
  render();
});

// ---- Results ----
async function runMatch() {
  const list = document.getElementById('resultsList');
  const summary = document.getElementById('resultsSummary');
  try {
    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suburb: state.suburb,
        service: state.service,
        desiredRate: state.desiredRate,
        durationHours: state.duration,
        slots: state.slots,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');

    const results = data.results || [];
    if (!results.length) {
      summary.textContent = `No ${state.serviceLabel.toLowerCase()} cleaners cover ${state.suburb} yet. Try another suburb or service.`;
      list.innerHTML = '';
      return;
    }
    const great = results.filter((r) => r.tier === 'great').length;
    summary.innerHTML = `Showing <strong>${results.length}</strong> cleaner${
      results.length > 1 ? 's' : ''
    } in ${state.suburb} for ${state.serviceLabel.toLowerCase()}, ranked by how well they match${
      great ? `, ${great} strong match${great > 1 ? 'es' : ''} at the top` : ''
    }.`;
    list.innerHTML = results.map(resultCard).join('');
  } catch (err) {
    summary.textContent = 'Could not load matches. Is the server running?';
    list.innerHTML = '';
  }
}

function resultCard(r) {
  const tierLabel =
    r.tier === 'great' ? 'Strong match' : r.tier === 'good' ? 'Good match' : 'Also available';
  const badges = [
    r.badges.id && 'ID',
    r.badges.police && 'Police',
    r.badges.insurance && 'Insured',
  ].filter(Boolean);
  const slotChips = r.matched
    .map((m) => `<span class="chip on">${DAYS[m.day]} ${SLOTS.find((s) => s.key === m.slot).label}</span>`)
    .join('');
  const availLine =
    r.requestedCount > 0
      ? r.matchedCount > 0
        ? `<div class="chips">${slotChips}</div>`
        : `<p class="no-overlap">Not free at your chosen times, ask about other slots.</p>`
      : '';

  return `
    <article class="result ${r.featured ? 'featured' : ''}">
      <div class="result-head">
        <div>
          <h3>${r.name} ${r.featured ? '<span class="pin">Promoted</span>' : ''}</h3>
          <p class="result-meta">
            ★ ${r.rating.toFixed(1)} (${r.reviews}) ·
            ${r.hourlyRate != null ? `$${r.hourlyRate}/hr` : 'Rate on enquiry'}
            ${r.estCost != null ? ` · ~$${r.estCost} this visit` : ''}
          </p>
        </div>
        <span class="tier tier-${r.tier}">${tierLabel}</span>
      </div>
      ${badges.length ? `<p class="verif">${badges.map((b) => `<span class="chip">${b}</span>`).join('')}</p>` : ''}
      ${availLine}
      <div class="result-actions">
        <button class="btn solid" type="button" disabled title="Enquiry flow is the next build step">
          Contact ${r.name.split(/['\s]/)[0]}
        </button>
      </div>
    </article>`;
}
