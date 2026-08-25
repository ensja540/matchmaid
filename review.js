// Review widgets, shared by the customer portal (leaving a review) and the
// public cleaner profile (reading one).
//
// Leaving a review is a STEPPED flow: one question per screen, big stars,
// nothing selected to begin with. The old version put all five categories on
// one page as small draggable rows preset to 5/5, which had two problems. A
// preset score is one nobody chose - most people submitted five fives without
// reading - and dragging a 1.7rem row to hit a decimal is fiddly on a phone,
// which is where most of these get written.
//
// Now: tap a star for a whole number, or drag across for anything in between.
// Scores still run 1.0-5.0 in 0.1 steps and the payload is unchanged, so the
// server and the profile page did not have to move.
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
  const escape = (s) =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // What a score means, said in words. A number on its own gives no sense of
  // whether 3 is "fine" or "bad", and people rate more honestly when the scale
  // is named.
  const WORD = [
    [0, ''],
    [1.5, 'Poor'],
    [2.5, 'Below par'],
    [3.5, 'Good'],
    [4.5, 'Great'],
    [5.01, 'Excellent'],
  ];
  function wordFor(n) {
    if (!n) return '';
    for (const [max, w] of WORD) if (n < max) return w;
    return 'Excellent';
  }

  // ---- the big star control -------------------------------------------------
  // Zero is a real starting state, not 1: "no answer yet" and "the worst
  // possible score" are different things, and starting on either extreme
  // anchors the answer.
  function starsHTML(value) {
    const pct = (value / 5) * 100;
    return `
      <div class="rv-stars-wrap">
        <div class="rv-stars" role="slider" tabindex="0"
             aria-valuemin="0" aria-valuemax="5" aria-valuenow="${value}"
             aria-valuetext="${value ? value.toFixed(1) + ' out of 5' : 'not rated yet'}">
          <span class="rating-stars xl"><i style="width:${pct}%"></i></span>
        </div>
        <p class="rv-readout"><span class="rv-num">${value ? value.toFixed(1) : '—'}</span>
          <span class="rv-word">${wordFor(value)}</span></p>
        <p class="rv-hint">Tap a star, or drag across for anything in between</p>
      </div>`;
  }

  // ---- the stepped form -----------------------------------------------------
  // One screen per category, then a last screen for the yes/no and the comment.
  function stepsHTML(existing) {
    const v = (k) => (existing && Number(existing[k])) || 0;
    const again = existing ? existing.wouldUseAgain : null;
    const dots = DIMS.map((_, i) => `<i class="rv-dot${i === 0 ? ' now' : ''}" data-dot="${i}"></i>`).join('') +
      `<i class="rv-dot" data-dot="${DIMS.length}"></i>`;

    const dimSteps = DIMS.map((d, i) => `
      <section class="rv-step${i === 0 ? ' on' : ''}" data-step="${i}" data-dim="${d.key}" data-value="${v(d.key)}">
        <p class="rv-step-count">Step ${i + 1} of ${DIMS.length + 1}</p>
        <h3 class="rv-q">${escape(d.label)}</h3>
        <p class="rv-hint-sub">${escape(d.hint)}</p>
        ${starsHTML(v(d.key))}
      </section>`).join('');

    return `
      <div class="rv-dots">${dots}</div>
      <div class="rv-steps">
        ${dimSteps}
        <section class="rv-step" data-step="${DIMS.length}" data-last>
          <p class="rv-step-count">Step ${DIMS.length + 1} of ${DIMS.length + 1}</p>
          <h3 class="rv-q">Would you book them again?</h3>
          <div class="chip-select rv-again-box" id="againBox">
            <button type="button" class="chip select lg ${again === true ? 'on' : ''}" data-again="yes">Yes</button>
            <button type="button" class="chip select lg ${again === false ? 'on' : ''}" data-again="no">No</button>
          </div>
          <label class="field"><span>Anything else? (optional)</span>
            <textarea name="comment" rows="3" placeholder="What stood out?">${existing ? escape(existing.comment || '') : ''}</textarea>
          </label>
          <div class="rv-summary" id="rvSummary"></div>
        </section>
      </div>
      <div class="rv-nav">
        <button type="button" class="btn outline" data-back hidden>Back</button>
        <button type="button" class="btn solid" data-next disabled>Next</button>
        <button class="btn solid" type="submit" data-submit hidden>${existing ? 'Update review' : 'Submit review'}</button>
      </div>`;
  }

  // Kept so anything still calling formHTML keeps working.
  const formHTML = stepsHTML;

  // ---- wiring ---------------------------------------------------------------
  function wire(root) {
    const steps = [...root.querySelectorAll('.rv-step')];
    const dots = [...root.querySelectorAll('.rv-dot')];
    const backBtn = root.querySelector('[data-back]');
    const nextBtn = root.querySelector('[data-next]');
    const submitBtn = root.querySelector('[data-submit]');
    let at = 0;

    const valueOf = (step) => Number(step.dataset.value) || 0;

    // Each category screen gets its own star control.
    steps.filter((s) => s.dataset.dim).forEach((step) => {
      const slider = step.querySelector('.rv-stars');
      const stars = step.querySelector('.rating-stars');
      const fill = step.querySelector('.rating-stars > i');
      const num = step.querySelector('.rv-num');
      const word = step.querySelector('.rv-word');

      const set = (n, quiet) => {
        step.dataset.value = n;
        slider.setAttribute('aria-valuenow', n);
        slider.setAttribute('aria-valuetext', n ? `${n.toFixed(1)} out of 5` : 'not rated yet');
        fill.style.width = `${(n / 5) * 100}%`;
        num.textContent = n ? n.toFixed(1) : '—';
        word.textContent = wordFor(n);
        step.classList.toggle('rated', n > 0);
        if (!quiet) syncNav();
      };

      // A tap lands on a whole star; a drag reads the exact position. Someone
      // who taps the 4th star means 4, not 3.7 because that is where their
      // thumb landed.
      const ratioAt = (clientX) => {
        const r = stars.getBoundingClientRect();
        return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      };
      let dragging = false;
      let moved = false;
      let downX = 0;

      stars.addEventListener('pointerdown', (e) => {
        dragging = true;
        moved = false;
        downX = e.clientX;
        stars.setPointerCapture?.(e.pointerId);
        e.preventDefault();
      });
      stars.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        if (Math.abs(e.clientX - downX) > 4) moved = true;
        if (moved) set(clamp(round1(ratioAt(e.clientX) * 5)));
      });
      const finish = (e) => {
        if (!dragging) return;
        dragging = false;
        // A tap (no movement) snaps to the whole star under the finger.
        if (!moved) set(clamp(Math.ceil(ratioAt(e.clientX) * 5) || 1));
      };
      stars.addEventListener('pointerup', finish);
      stars.addEventListener('pointercancel', () => { dragging = false; });

      slider.addEventListener('keydown', (e) => {
        const cur = valueOf(step);
        // From nothing, an arrow key starts at 3 - the middle - rather than at
        // an extreme.
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { set(cur ? clamp(round1(cur + 0.1)) : 3); e.preventDefault(); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { set(cur ? clamp(round1(cur - 0.1)) : 3); e.preventDefault(); }
        if (e.key >= '1' && e.key <= '5') { set(Number(e.key)); e.preventDefault(); }
      });

      set(valueOf(step), true);
    });

    // Would-book-again.
    let again = null;
    const box = root.querySelector('#againBox');
    box?.querySelectorAll('[data-again]').forEach((b) => {
      if (b.classList.contains('on')) again = b.dataset.again === 'yes';
      b.addEventListener('click', () => {
        box.querySelectorAll('[data-again]').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        again = b.dataset.again === 'yes';
        syncNav();
      });
    });

    function summarise() {
      const el = root.querySelector('#rvSummary');
      if (!el) return;
      const rated = steps.filter((s) => s.dataset.dim);
      const avg = rated.reduce((n, s) => n + valueOf(s), 0) / rated.length;
      el.innerHTML = `
        <p class="rv-sum-head">Your ratings <span class="rv-sum-avg">${avg.toFixed(1)}/5 overall</span></p>
        <ul class="rv-sum-list">${rated.map((s, i) => `
          <li><button type="button" class="rv-sum-row" data-goto="${i}">
            <span>${escape(DIMS[i].label)}</span>
            <span class="rv-sum-val">${valueOf(s).toFixed(1)}</span>
          </button></li>`).join('')}</ul>
        <p class="muted rv-sum-note">Tap any line to change it.</p>`;
      el.querySelectorAll('[data-goto]').forEach((b) =>
        b.addEventListener('click', () => go(Number(b.dataset.goto))));
    }

    function syncNav() {
      const step = steps[at];
      const last = at === steps.length - 1;
      // You cannot skip a category: an unrated one would fail the server's
      // 1-5 check anyway, and failing after five screens is a bad way to be
      // told.
      const ready = last ? again !== null : valueOf(step) > 0;
      backBtn.hidden = at === 0;
      nextBtn.hidden = last;
      submitBtn.hidden = !last;
      nextBtn.disabled = !ready;
      submitBtn.disabled = !ready;
      dots.forEach((d, i) => {
        d.classList.toggle('now', i === at);
        d.classList.toggle('done', i < at || (steps[i]?.dataset.dim && Number(steps[i].dataset.value) > 0));
      });
    }

    function go(i) {
      at = Math.min(steps.length - 1, Math.max(0, i));
      steps.forEach((s, n) => s.classList.toggle('on', n === at));
      if (steps[at].hasAttribute('data-last')) summarise();
      syncNav();
      // Focus the thing they are meant to act on, so a keyboard user is not
      // hunting for it after every step.
      const target = steps[at].querySelector('.rv-stars, [data-again]');
      target?.focus?.({ preventScroll: true });
      steps[at].scrollIntoView?.({ block: 'nearest' });
    }

    nextBtn.addEventListener('click', () => go(at + 1));
    backBtn.addEventListener('click', () => go(at - 1));
    // Enter advances, so a phone keyboard's "next" does the obvious thing.
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.target.matches('textarea')) return;
      if (!nextBtn.hidden && !nextBtn.disabled) { e.preventDefault(); go(at + 1); }
    });

    go(0);

    return function read() {
      const out = {
        wouldUseAgain: again,
        comment: root.querySelector('[name=comment]')?.value.trim() || '',
      };
      steps.filter((s) => s.dataset.dim).forEach((s) => { out[s.dataset.dim] = valueOf(s); });
      return out;
    };
  }

  // Per-category bars for a cleaner's public profile. Unchanged.
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

  return { DIMS, formHTML, stepsHTML, wire, barsHTML, wordFor };
})();
