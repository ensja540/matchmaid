// Admin verification review. Gated server-side to the admin email; a
// non-admin session just gets a 403 and a friendly message.
const sessionUser = window.Session && Session.get();
const body = document.getElementById('adminBody');
const who = document.getElementById('who');
if (who && sessionUser) who.textContent = sessionUser.name || sessionUser.email || '';

const TYPE_LBL = { id: 'Identity document', police: 'Police check', insurance: 'Insurance' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

if (!sessionUser) {
  body.innerHTML = '<div class="panel-card"><p class="muted">Please <a href="/login">log in</a> with the admin account to review documents.</p></div>';
} else {
  load();
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
  return `<div class="panel-card admin-vrow" id="v-${v.id}">
    <div class="admin-vinfo">
      <strong>${esc(v.cleaner)}</strong> · ${esc(TYPE_LBL[v.type] || v.type)}
      <span class="muted">${esc(v.email)} — uploaded ${esc(v.when)}</span>
      ${v.extractedText ? `<p class="verif-read">Scanned text: “${esc(v.extractedText)}”</p>` : ''}
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
