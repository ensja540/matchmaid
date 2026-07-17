// Trust badges - one per verification a cleaner has passed.
//
// A badge is never self-claimed: the server only sets id_verified /
// police_verified / insurance_verified once an uploaded document is approved,
// so anything rendered here is earned.
//
// Two shapes for two audiences. `earned()` shows a customer only what a cleaner
// actually holds - an unearned badge would read as a mark against them. `strip()`
// shows a cleaner all three, unearned ones greyed, because the gaps are the
// point: it's the checklist that gets them to upload the next document.
window.Badges = (function () {
  const ITEMS = [
    { key: 'id', label: 'ID verified' },
    { key: 'police', label: 'Criminal checked' },
    { key: 'insurance', label: 'Insured' },
  ];

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pill(label, on) {
    return `<span class="tbadge${on ? '' : ' off'}"><i aria-hidden="true">${on ? '✓' : ''}</i>${esc(label)}</span>`;
  }

  // Customer-facing. `badges` is the {id, police, insurance} object the API
  // returns; `bringsProducts` rides along as a plain chip since it's a choice,
  // not a verification, and shouldn't wear a verified tick.
  function earned(badges, bringsProducts) {
    const held = ITEMS.filter((i) => badges && badges[i.key]);
    const extra = bringsProducts ? '<span class="chip">Brings products</span>' : '';
    if (!held.length && !extra) return '';
    return `<p class="tbadge-row">${held.map((i) => pill(i.label, true)).join('')}${extra}</p>`;
  }

  // Cleaner-facing. `status` maps each key to 'verified' | 'pending' | 'failed'
  // | 'none'; only 'verified' lights the badge.
  function strip(status) {
    const st = status || {};
    const got = ITEMS.filter((i) => st[i.key] === 'verified').length;
    const note = got === ITEMS.length
      ? 'All three earned. Your listing shows every trust badge.'
      : `${got} of ${ITEMS.length} earned. Each one you add shows on your listing.`;
    return `<div class="tbadge-strip">
      <p class="tbadge-row">${ITEMS.map((i) => pill(i.label, st[i.key] === 'verified')).join('')}</p>
      <p class="tbadge-note muted">${note}</p>
    </div>`;
  }

  return { ITEMS, earned, strip };
})();
