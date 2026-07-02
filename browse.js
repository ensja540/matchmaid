// Public, ungated cleaner browse. Anyone can search and see real (demo)
// cleaners. Signup is never a gate — it only appears at the peak, when they
// choose to contact a cleaner (or tap the always-present "Create free account").
const { DAYS, SLOTS } = DEMO;

const suburbSel = document.getElementById('suburb');
const serviceSel = document.getElementById('service');
const rate = document.getElementById('rate');
const rateOut = document.getElementById('rateOut');
const results = document.getElementById('results');
const meta = document.getElementById('meta');

document.getElementById('sf-year').textContent = new Date().getFullYear();

// Populate filters
suburbSel.innerHTML = DEMO.suburbs.map((s) => `<option ${s === 'Riccarton' ? 'selected' : ''}>${s}</option>`).join('');
serviceSel.innerHTML = DEMO.services.map((s) => `<option value="${s.slug}">${s.name}</option>`).join('');

rate.addEventListener('input', () => (rateOut.textContent = `$${rate.value}/hr`));
document.getElementById('browseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch();
});

// Auto-run so the marketplace is felt immediately — no empty state, no gate.
runSearch();

function runSearch() {
  const find = {
    suburb: suburbSel.value,
    service: serviceSel.value,
    desiredRate: Number(rate.value),
    slots: [],
  };
  const scored = DEMO.cleaners
    .map((c) => DEMO.scoreCleaner(c, find))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || Number(b.featured) - Number(a.featured) || b.rating - a.rating);

  if (!scored.length) {
    meta.textContent = `No cleaners cover ${find.suburb} for that service yet — more are joining soon.`;
    results.innerHTML = '';
    return;
  }
  meta.textContent = `${scored.length} cleaner${scored.length > 1 ? 's' : ''} in ${find.suburb}, best match first.`;

  const cards = scored.map(resultCard);
  // Slot an easy, non-blocking signup nudge in after the second result.
  if (cards.length > 2) cards.splice(2, 0, hookCard());
  results.innerHTML = cards.join('');

  results.querySelectorAll('[data-contact]').forEach((b) =>
    b.addEventListener('click', () => openModal(b.dataset.contact))
  );
  results.querySelectorAll('[data-hook]').forEach((b) => b.addEventListener('click', () => openModal(null)));
}

function resultCard(r) {
  const tierLabel = r.tier === 'great' ? 'Strong match' : r.tier === 'good' ? 'Good match' : 'Also available';
  const badges = [r.badges.id && 'ID', r.badges.police && 'Police', r.badges.insurance && 'Insured'].filter(Boolean);
  return `<article class="result ${r.featured ? 'featured' : ''}">
    <div class="result-head">
      <div><h3>${r.name} ${r.featured ? '<span class="pin">Promoted</span>' : ''}</h3>
        <p class="result-meta">★ ${r.rating.toFixed(1)} (${r.reviews}) · $${r.rate}/hr · ${r.areas.join(', ')}</p></div>
      <span class="tier tier-${r.tier}">${tierLabel}</span>
    </div>
    ${badges.length ? `<p class="verif">${badges.map((b) => `<span class="chip">${b}</span>`).join('')}</p>` : ''}
    <div class="result-actions">
      <button class="btn solid sm" type="button" data-contact="${r.name}">Contact ${r.name.split(/['\s]/)[0]}</button>
    </div>
  </article>`;
}

function hookCard() {
  return `<div class="hook-card">
    <div>
      <h3>Found someone you like?</h3>
      <p>Create a free account to message your maid. Takes seconds, no card needed.</p>
    </div>
    <button class="btn solid" type="button" data-hook>Create free account</button>
  </div>`;
}

// ---- Capture modal ----
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalSub = document.getElementById('modalSub');
const capForm = document.getElementById('capForm');
const capMsg = document.getElementById('capMsg');

document.getElementById('signupHook').addEventListener('click', () => openModal(null));
document.getElementById('modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

function openModal(cleanerName) {
  if (cleanerName) {
    modalTitle.textContent = `Message ${cleanerName}`;
    modalSub.textContent = "You're one step away — create your free account to send a message.";
  } else {
    modalTitle.textContent = 'Create your free account';
    modalSub.textContent = 'Free forever, and about 20 seconds.';
  }
  capMsg.textContent = '';
  capMsg.className = 'auth-msg';
  modal.hidden = false;
  setTimeout(() => capForm.fullName.focus(), 30);
}
function closeModal() {
  modal.hidden = true;
}

capForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  capMsg.className = 'auth-msg';
  capMsg.textContent = 'Creating your account…';
  const body = {
    role: 'customer',
    fullName: capForm.fullName.value,
    email: capForm.email.value,
    password: capForm.password.value,
  };
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    Session.set(data.user);
    location.href = '/customer.html';
  } catch {
    // No server yet (demo): simulate the signup so the flow can be felt.
    Session.set({ id: 'demo', role: 'client', fullName: body.fullName || 'You', email: body.email });
    capMsg.textContent = 'Account created (demo) — taking you to your portal…';
    capMsg.classList.add('ok');
    setTimeout(() => (location.href = '/customer.html'), 800);
  }
});
