// Location pickers. Two things live here:
//   Combo         - one type-to-search field over a list of items.
//   LocationPicker - a city field, then a suburb field scoped to that city.
//
// Why not one native <select>: with ~1,700 suburbs a single dropdown is
// unusable, and the browser opens it upward near the foot of a form. Why not
// one search box either: people who don't type the exact spelling conclude
// their suburb is missing (a real Ashburton user hit this). Picking the town
// first, then seeing that town's suburbs listed, lets them browse instead of
// guess.

const Combo = {
  // items: [{id, name, region, territorial_authority}]
  // opts.showAllOnFocus: on focus with an empty box, list everything (used for
  //   the scoped suburb field, so its handful of options are visible without
  //   typing). Left off for the ~900-entry city field.
  // onPick(item|null) fires on every change, null when the field is cleared.
  attach(root, items, opts = {}) {
    if (!root) return null;
    const { selectedId, placeholder = 'Start typing…', onPick, showAllOnFocus = false } = opts;
    const TYPED_MAX = 8;    // matches shown while typing
    const BROWSE_MAX = 400; // ceiling when listing a whole (scoped) set

    root.classList.add('combo');
    if (showAllOnFocus) root.classList.add('combo--select');
    root.innerHTML = `
      <input type="text" class="combo-input" role="combobox" aria-expanded="false"
        aria-autocomplete="list" autocomplete="off" spellcheck="false"
        placeholder="${escape(placeholder)}" />
      <ul class="combo-list" role="listbox" hidden></ul>
      <p class="combo-none" hidden>No match. Try the nearest town.</p>`;

    const input = root.querySelector('.combo-input');
    const list = root.querySelector('.combo-list');
    const none = root.querySelector('.combo-none');
    let pool = items || [];
    let matches = [];
    let active = -1;
    let picked = null;

    const label = (it) =>
      it.territorial_authority && it.territorial_authority !== it.name
        ? `${it.name} · ${it.territorial_authority}`
        : it.name;

    function preselect(id) {
      const pre = pool.find((i) => String(i.id) === String(id));
      if (pre) { picked = pre; input.value = label(pre); }
    }
    if (selectedId != null) preselect(selectedId);

    function find(q) {
      const s = q.trim().toLowerCase();
      if (!s) return showAllOnFocus ? pool.slice(0, BROWSE_MAX) : [];
      const starts = [], town = [], contains = [];
      for (const it of pool) {
        const n = it.name.toLowerCase();
        const t = (it.territorial_authority || '').toLowerCase();
        // Ranked: name prefix beats town prefix beats a plain substring, so
        // "ricc" puts Riccarton first rather than burying it.
        if (n.startsWith(s)) starts.push(it);
        else if (t.startsWith(s)) town.push(it);
        else if (n.includes(s)) contains.push(it);
        if (starts.length >= TYPED_MAX) break;
      }
      return [...starts, ...town, ...contains].slice(0, TYPED_MAX);
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

    function open() {
      matches = find(input.value);
      active = matches.length ? 0 : -1;
      draw();
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
      close();
      onPick?.(it);
    }

    input.addEventListener('focus', () => { if (showAllOnFocus || input.value.trim()) open(); });
    input.addEventListener('input', () => {
      // Typing after a pick invalidates it until they choose again - stops a
      // stale id being submitted alongside edited text.
      if (picked && input.value !== label(picked)) { picked = null; onPick?.(null); }
      open();
    });

    input.addEventListener('keydown', (e) => {
      if (list.hidden && (e.key === 'ArrowDown' || e.key === 'Enter')) { open(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, matches.length - 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') { close(); }
    });

    // mousedown, not click: blur would close the list before a click landed.
    list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('.combo-opt');
      if (!li) return;
      e.preventDefault();
      choose(Number(li.dataset.i));
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        close();
        // Keep whatever they typed - silently emptying the box reads as the
        // field losing their work. Snap back to the last real pick if any.
        if (picked) input.value = label(picked);
      }, 120);
    });

    return {
      get value() { return picked; },
      focus() { input.focus(); },
      // Repoint the field at a new set (the suburb field, when the city changes).
      setItems(next, keepId) {
        pool = next || [];
        picked = null;
        input.value = '';
        if (keepId != null) preselect(keepId);
        close();
      },
      clear() { picked = null; input.value = ''; close(); },
    };
  },
};

// City field, then a suburb field holding only that city's suburbs.
const LocationPicker = {
  // rows: the flat /api/suburbs list [{id, name, region, territorial_authority}].
  // onPick(row|null) fires with the resolved suburb row, or null while incomplete.
  attach(root, rows, { selectedId, onPick } = {}) {
    if (!root) return null;

    // Group suburbs by their city. territorial_authority is the town/city and is
    // present on every row, so it is the grouping key; region disambiguates the
    // handful of same-named towns (two Richmonds, etc.).
    const cityMap = new Map();
    for (const r of rows || []) {
      const key = `${r.territorial_authority}|${r.region}`;
      if (!cityMap.has(key)) {
        cityMap.set(key, { id: key, name: r.territorial_authority, region: r.region, territorial_authority: '', rows: [] });
      }
      cityMap.get(key).rows.push(r);
    }
    const cities = [...cityMap.values()].sort((a, b) => a.name.localeCompare(b.name));

    // A city that is just itself (a small town with no suburb breakdown) needs
    // no second step - picking the town resolves straight to its row.
    const soleRow = (city) =>
      city.rows.length === 1 && city.rows[0].name === city.name ? city.rows[0] : null;

    root.innerHTML = `
      <label class="field"><span>Town or city</span><div class="lp-city"></div></label>
      <label class="field lp-suburb-field" hidden><span>Suburb</span><div class="lp-suburb"></div></label>`;

    const suburbField = root.querySelector('.lp-suburb-field');
    let suburbCombo = null;

    // Reverse lookup for editing an existing profile: id -> its city.
    let preCityId = null, preSuburbId = null;
    if (selectedId != null) {
      const row = (rows || []).find((r) => String(r.id) === String(selectedId));
      if (row) { preCityId = `${row.territorial_authority}|${row.region}`; preSuburbId = row.id; }
    }

    function showSuburbs(city, keepId) {
      const sole = soleRow(city);
      if (sole) {
        // Nothing to choose - the town is the answer.
        suburbField.hidden = true;
        suburbCombo?.setItems([]);
        onPick?.(sole);
        return;
      }
      suburbField.hidden = false;
      suburbCombo.setItems(city.rows, keepId);
      if (!keepId) onPick?.(null); // wait for a suburb before resolving
    }

    suburbCombo = Combo.attach(root.querySelector('.lp-suburb'), [], {
      placeholder: 'Select your suburb',
      showAllOnFocus: true,
      onPick: (row) => onPick?.(row || null),
    });

    Combo.attach(root.querySelector('.lp-city'), cities, {
      selectedId: preCityId,
      placeholder: 'Start typing your town or city',
      onPick: (city) => {
        if (!city) { suburbField.hidden = true; suburbCombo.setItems([]); onPick?.(null); return; }
        showSuburbs(city);
      },
    });

    // Restore a saved suburb: fill the city, then its suburb.
    if (preCityId) {
      const city = cityMap.get(preCityId);
      if (city) showSuburbs(city, preSuburbId);
    }

    return { get value() { return suburbCombo?.value || null; } };
  },
};

function escape(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
