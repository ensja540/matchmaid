// Type-to-search location picker, replacing a <select> that would otherwise
// hold ~1,700 options.
//
// Why not a native <select>: the browser decides where its popup goes, and near
// the bottom of a form it opens upward. This list is a plain element pinned
// under the field, so it always drops down, and it only ever shows the handful
// of matches for what has been typed rather than the whole country.
//
// Matches on the suburb name AND its town, so typing "Christchurch" lists every
// Christchurch suburb - cities and suburbs are both reachable from one field.
const Combo = {
  // items: [{id, name, region, territorial_authority}]
  // onPick(item|null) fires on every change, null when the field is cleared.
  attach(root, items, { selectedId, placeholder = 'Start typing your suburb or town', onPick } = {}) {
    if (!root) return null;
    const MAX = 8; // enough to choose from, short enough to scan

    root.classList.add('combo');
    root.innerHTML = `
      <input type="text" class="combo-input" role="combobox" aria-expanded="false"
        aria-autocomplete="list" autocomplete="off" spellcheck="false"
        placeholder="${escape(placeholder)}" />
      <ul class="combo-list" role="listbox" hidden></ul>
      <p class="combo-none" hidden>No match. Try the nearest town.</p>
      <p class="combo-hint" hidden>Pick one from the list to set your suburb.</p>`;

    const input = root.querySelector('.combo-input');
    const list = root.querySelector('.combo-list');
    const none = root.querySelector('.combo-none');
    const hint = root.querySelector('.combo-hint');
    let matches = [];
    let active = -1;
    let picked = null;

    const label = (it) =>
      it.territorial_authority && it.territorial_authority !== it.name
        ? `${it.name} · ${it.territorial_authority}`
        : it.name;

    if (selectedId != null) {
      const pre = items.find((i) => String(i.id) === String(selectedId));
      if (pre) { picked = pre; input.value = label(pre); }
    }

    function find(q) {
      const s = q.trim().toLowerCase();
      if (!s) return [];
      const starts = [];
      const town = [];
      const contains = [];
      for (const it of items) {
        const n = it.name.toLowerCase();
        const t = (it.territorial_authority || '').toLowerCase();
        // Ranked: name prefix beats town prefix beats anything containing it,
        // so typing "ricc" puts Riccarton first rather than burying it.
        if (n.startsWith(s)) starts.push(it);
        else if (t.startsWith(s)) town.push(it);
        else if (n.includes(s)) contains.push(it);
        if (starts.length >= MAX) break;
      }
      return [...starts, ...town, ...contains].slice(0, MAX);
    }

    function draw() {
      list.innerHTML = matches
        .map((it, i) => `<li class="combo-opt${i === active ? ' on' : ''}" role="option"
          aria-selected="${i === active}" data-i="${i}">
          <span class="combo-name">${escape(it.name)}</span>
          <span class="combo-sub">${escape([it.territorial_authority, it.region].filter((x) => x && x !== it.name).join(', '))}</span>
        </li>`)
        .join('');
      const open = matches.length > 0;
      list.hidden = !open;
      input.setAttribute('aria-expanded', String(open));
      none.hidden = !(input.value.trim() && !open);
    }

    function close() {
      list.hidden = true;
      none.hidden = true;
      active = -1;
      input.setAttribute('aria-expanded', 'false');
    }

    function choose(i) {
      const it = matches[i];
      if (!it) return;
      picked = it;
      input.value = label(it);
      hint.hidden = true;
      close();
      onPick?.(it);
    }

    input.addEventListener('input', () => {
      // Typing after a pick invalidates it until they choose again - stops a
      // stale id being submitted alongside edited text.
      if (picked && input.value !== label(picked)) { picked = null; onPick?.(null); }
      hint.hidden = true;
      matches = find(input.value);
      active = matches.length ? 0 : -1;
      draw();
    });

    input.addEventListener('keydown', (e) => {
      if (list.hidden && (e.key === 'ArrowDown' || e.key === 'Enter')) {
        matches = find(input.value);
        active = matches.length ? 0 : -1;
        draw();
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, matches.length - 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') { close(); }
    });

    // mousedown, not click: blur would close the list before click landed.
    list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('.combo-opt');
      if (!li) return;
      e.preventDefault();
      choose(Number(li.dataset.i));
    });

    input.addEventListener('blur', () => {
      // Give the mousedown a tick to land before tidying up.
      setTimeout(() => {
        close();
        // Keep whatever they typed on screen. Silently emptying the box reads
        // as the field losing their work; instead the text stays and a hint
        // says it is not a selection yet.
        if (picked) { input.value = label(picked); hint.hidden = true; }
        else hint.hidden = !input.value.trim();
      }, 120);
    });

    return {
      get value() { return picked; },
      clear() { picked = null; input.value = ''; close(); },
    };
  },
};

function escape(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
