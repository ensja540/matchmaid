// Review widgets, shared by the customer portal (leaving a review) and the
// public cleaner profile (reading one).
//
// Scores run 1.0–5.0 in 0.1 steps. The star row is draggable: press and slide
// across it and the gold fill follows the pointer, so a 4.3 is as easy to pick
// as a 4. Keyboard users get arrow keys via the slider role.
window.Review = (function () {
  const DIMS = [
    { key: 'quality', label: 'Quality of clean', hint: 'Did they clean your house to a satisfactory level?' },
    { key: 'value', label: 'Value for money', hint: 'Was the price fair for the work done?' },
    { key: 'timeliness', label: 'Timeliness', hint: 'Did they complete the clean within the agreed time?' },
    { key: 'punctuality', label: 'Punctuality', hint: 'Did they arrive on time with the correct equipment?' },
    { key: 'communication', label: 'Communication', hint: 'How easy were they to connect with and organise the clean?' },
  ];
  const clamp = (n) => Math.min(5, Math.max(1, n));
  const round1 = (n) => Math.round(n * 10) / 10;

  function starRow(key, value) {
    const pct = (value / 5) * 100;
    return `<div class="star-input" data-dim="${key}" role="slider" tabindex="0"
              aria-valuemin="1" aria-valuemax="5" aria-valuenow="${value}" aria-label="${key}">
        <span class="rating-stars lg"><i style="width:${pct}%"></i></span>
        <output class="star-val">${value.toFixed(1)}</output>
      </div>`;
  }

  // The form body only; the caller supplies the surrounding modal + submit.
  function formHTML(existing) {
    const v = (k) => (existing && Number(existing[k])) || 5;
    const again = existing ? existing.wouldUseAgain : null;
    return `
      <div class="review-dims">
        ${DIMS.map(
          (d) => `<div class="review-dim">
            <div class="review-dim-head">
              <strong>${d.label}</strong>
              <span class="muted">${d.hint}</span>
            </div>
            ${starRow(d.key, v(d.key))}
          </div>`
        ).join('')}
      </div>
      <div class="review-again">
        <strong>Would you use them again?</strong>
        <div class="chip-select" id="againBox">
          <button type="button" class="chip select ${again === true ? 'on' : ''}" data-again="yes">Yes</button>
          <button type="button" class="chip select ${again === false ? 'on' : ''}" data-again="no">No</button>
        </div>
      </div>
      <label class="field"><span>Anything else? (optional)</span>
        <textarea name="comment" rows="3" placeholder="What stood out?">${existing ? escape(existing.comment || '') : ''}</textarea>
      </label>`;
  }

  function escape(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Wire the star rows inside `root`. Returns a read() giving the scores.
  function wire(root) {
    root.querySelectorAll('.star-input').forEach((el) => {
      const fill = el.querySelector('i');
      const out = el.querySelector('.star-val');
      const stars = el.querySelector('.rating-stars');

      const setFromX = (clientX) => {
        const r = stars.getBoundingClientRect();
        const ratio = (clientX - r.left) / r.width;
        set(clamp(round1(ratio * 5)));
      };
      const set = (n) => {
        el.dataset.value = n;
        el.setAttribute('aria-valuenow', n);
        fill.style.width = `${(n / 5) * 100}%`;
        out.textContent = n.toFixed(1);
      };
      set(Number(el.getAttribute('aria-valuenow')) || 5);

      let dragging = false;
      const down = (e) => { dragging = true; el.setPointerCapture?.(e.pointerId); setFromX(e.clientX); e.preventDefault(); };
      const move = (e) => { if (dragging) setFromX(e.clientX); };
      const up = () => { dragging = false; };
      stars.addEventListener('pointerdown', down);
      stars.addEventListener('pointermove', move);
      stars.addEventListener('pointerup', up);
      stars.addEventListener('pointercancel', up);

      el.addEventListener('keydown', (e) => {
        const cur = Number(el.dataset.value) || 5;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { set(clamp(round1(cur + 0.1))); e.preventDefault(); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { set(clamp(round1(cur - 0.1))); e.preventDefault(); }
      });
    });

    let again = null;
    const box = root.querySelector('#againBox');
    box?.querySelectorAll('[data-again]').forEach((b) => {
      if (b.classList.contains('on')) again = b.dataset.again === 'yes';
      b.addEventListener('click', () => {
        box.querySelectorAll('[data-again]').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        again = b.dataset.again === 'yes';
      });
    });

    return function read() {
      const out = { wouldUseAgain: again, comment: root.querySelector('[name=comment]')?.value.trim() || '' };
      root.querySelectorAll('.star-input').forEach((el) => {
        out[el.dataset.dim] = Number(el.dataset.value);
      });
      return out;
    };
  }

  // Per-category bars for a cleaner's public profile.
  function barsHTML(b) {
    if (!b || !b.count) return '';
    const row = (label, val) => `
      <div class="rv-row">
        <span class="rv-label">${label}</span>
        <span class="rv-track"><span class="rv-fill" style="width:${(val / 5) * 100}%"></span></span>
        <span class="rv-val">${val.toFixed(1)}</span>
      </div>`;
    const again =
      b.wouldUseAgainPct == null
        ? ''
        : `<p class="rv-again"><strong>${b.wouldUseAgainPct}%</strong> of customers would use them again</p>`;
    return `
      <section class="review-breakdown">
        <div class="rv-head">
          <h3>Reviews</h3>
          <span class="muted">${b.count} review${b.count === 1 ? '' : 's'} · overall ${b.overall.toFixed(1)}/5</span>
        </div>
        ${DIMS.map((d) => row(d.label, Number(b[d.key]) || 0)).join('')}
        ${again}
      </section>`;
  }

  return { DIMS, formHTML, wire, barsHTML };
})();
