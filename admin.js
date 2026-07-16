// Admin verification review. Gated server-side to the admin email; a
// non-admin session just gets a 403 and a friendly message.
const sessionUser = window.Session && Session.get();
const body = document.getElementById('adminBody');
const who = document.getElementById('who');
if (who && sessionUser) who.textContent = sessionUser.name || sessionUser.email || '';

const TYPE_LBL = { id: 'Identity document', police: 'Criminal check', insurance: 'Insurance' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const feedbackBody = document.getElementById('feedbackBody');
const reviewsBody = document.getElementById('reviewsBody');

if (!sessionUser) {
  body.innerHTML = '<div class="panel-card"><p class="muted">Please <a href="/login">log in</a> with the admin account to review documents.</p></div>';
} else {
  load();
  loadFeedback();
  loadReviews();
}

async function loadFeedback() {
  if (!feedbackBody) return;
  feedbackBody.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const res = await fetch(`/api/admin/feedback?userId=${encodeURIComponent(sessionUser.id)}`);
    if (res.status === 403) { feedbackBody.innerHTML = '<div class="panel-card"><p class="muted">Admin only.</p></div>'; return; }
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) {
      feedbackBody.innerHTML = '<div class="panel-card"><p class="muted">No feedback yet.</p></div>';
      return;
    }
    feedbackBody.innerHTML = list.map(feedbackHTML).join('');
  } catch {
    feedbackBody.innerHTML = '<div class="panel-card"><p class="muted">Could not load feedback.</p></div>';
  }
}

function feedbackHTML(f) {
  const when = f.created_at ? new Date(f.created_at).toLocaleString('en-NZ') : '';
  const from = [f.full_name, f.email].filter(Boolean).map(esc).join(' · ') || 'Anonymous';
  const role = f.role ? ` (${esc(f.role === 'cleaner' ? 'maid' : 'customer')})` : '';
  return `<div class="panel-card admin-fb">
    <p class="admin-fb-msg">${esc(f.message)}</p>
    <p class="muted admin-fb-meta">${from}${role} · ${esc(f.page || '')} · ${esc(when)}</p>
  </div>`;
}

async function load() {
  body.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const res = await fetch(`/api/admin/verifications?userId=${encodeURIComponent(sessionUser.id)}`);
    if (res.status === 403) {
      body.innerHTML = '<div class="panel-card"><p class="muted">This account isn’t set up as an admin, so it can’t review documents.</p></div>';
      return;
    }
    render(await res.json());
  } catch {
    body.innerHTML = '<div class="panel-card"><p class="muted">Could not load the review queue.</p></div>';
  }
}

function render(list) {
  if (!Array.isArray(list) || !list.length) {
    body.innerHTML = '<div class="panel-card"><p class="muted">Nothing waiting for review right now. 🎉</p></div>';
    return;
  }
  body.innerHTML = list.map(cardHTML).join('');
  body.querySelectorAll('[data-decide]').forEach((b) =>
    b.addEventListener('click', () => decide(b, b.dataset.id, b.dataset.decide))
  );
}

function cardHTML(v) {
  const isImg = /^data:image\//.test(v.documentUrl || '');
  const doc = v.documentUrl
    ? isImg
      ? `<a href="${v.documentUrl}" target="_blank" rel="noopener"><img class="admin-doc" src="${v.documentUrl}" alt="Uploaded document" /></a>`
      : `<a class="btn outline sm" href="${v.documentUrl}" target="_blank" rel="noopener">Open document</a>`
    : '<span class="muted">No file attached</span>';
  const rate = v.rateMin != null
    ? (v.rateMax && v.rateMax !== v.rateMin ? `$${v.rateMin}–$${v.rateMax}/hr` : `$${v.rateMin}/hr`)
    : '';
  const areas = Array.isArray(v.areas) && v.areas.length ? v.areas.join(', ') : '';
  // Details to check the document against — legal name first, it's what an ID shows.
  const info = [
    ['Legal name', v.fullName],
    ['Based in', v.residentialAddress],
    ['Business', v.businessName],
    ['Email', v.email],
    ['Phone', v.phone],
    ['Rate', rate],
    ['Experience', v.years != null ? `${v.years} yr${v.years === 1 ? '' : 's'}` : ''],
    ['Works', areas],
    ['Joined', v.joined],
  ].filter(([, val]) => val);
  const details = `<dl class="admin-vdetails">${info
    .map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`)
    .join('')}</dl>`;
  return `<div class="panel-card admin-vrow" id="v-${v.id}">
    <div class="admin-vinfo">
      <strong>${esc(v.cleaner)}</strong> · ${esc(TYPE_LBL[v.type] || v.type)}
      <span class="muted">Uploaded ${esc(v.when)}</span>
      ${details}
      ${v.extractedText ? `<p class="verif-read">Scanned from document: “${esc(v.extractedText)}”</p>` : ''}
      <div class="admin-vactions">
        <button class="btn solid sm" data-decide="approve" data-id="${esc(v.id)}" type="button">Approve</button>
        <button class="btn outline sm" data-decide="reject" data-id="${esc(v.id)}" type="button">Reject</button>
      </div>
    </div>
    <div class="admin-vdoc">${doc}</div>
  </div>`;
}

async function decide(btn, id, decision) {
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/verification-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: sessionUser.id, id, decision }),
    });
    if (res.ok) load();
    else btn.disabled = false;
  } catch {
    btn.disabled = false;
  }
}

// ---- Customer reviews -----------------------------------------------------
async function loadReviews() {
  if (!reviewsBody) return;
  reviewsBody.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const res = await fetch(`/api/admin/reviews?userId=${encodeURIComponent(sessionUser.id)}`);
    if (res.status === 403) { reviewsBody.innerHTML = '<div class="panel-card"><p class="muted">Admin only.</p></div>'; return; }
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) {
      reviewsBody.innerHTML = '<div class="panel-card"><p class="muted">No reviews yet.</p></div>';
      return;
    }
    reviewsBody.innerHTML = list.map(reviewHTML).join('');
    reviewsBody.querySelectorAll('[data-moderate]').forEach((b) =>
      b.addEventListener('click', () => moderateReview(b, b.dataset.id, b.dataset.moderate))
    );
  } catch {
    reviewsBody.innerHTML = '<div class="panel-card"><p class="muted">Could not load reviews.</p></div>';
  }
}

function reviewHTML(r) {
  const hidden = r.status !== 'published';
  const cats = [['Quality', r.quality], ['Value', r.value], ['Timeliness', r.timeliness],
    ['Punctuality', r.punctuality], ['Communication', r.communication]]
    .map(([k, v]) => `${k} ${Number(v).toFixed(1)}`).join(' · ');
  const again = r.wouldUseAgain ? 'Would use again' : 'Would not use again';
  const badge = hidden ? '<span class="admin-rv-hidden">Hidden</span>' : '';
  const btn = hidden
    ? `<button class="btn outline sm" data-moderate="restore" data-id="${esc(r.id)}" type="button">Restore</button>`
    : `<button class="btn outline sm" data-moderate="hide" data-id="${esc(r.id)}" type="button">Hide</button>`;
  return `<div class="panel-card admin-rv${hidden ? ' is-hidden' : ''}">
    <div class="admin-rv-head"><strong>${Number(r.overall).toFixed(1)} ★</strong> ${badge}
      <span class="muted">${esc(again)}</span></div>
    ${r.comment ? `<p class="admin-rv-msg">“${esc(r.comment)}”</p>` : '<p class="muted admin-rv-msg">No comment left.</p>'}
    <p class="muted admin-rv-cats">${esc(cats)}</p>
    <p class="muted admin-rv-meta">${esc(r.cleaner)} · from ${esc(r.client)} · ${esc(r.when)}</p>
    <div class="admin-rv-actions">${btn}</div>
  </div>`;
}

async function moderateReview(btn, id, action) {
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/review-moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: sessionUser.id, id, action }),
    });
    if (res.ok) loadReviews();
    else btn.disabled = false;
  } catch {
    btn.disabled = false;
  }
}
