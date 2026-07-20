// Shared "danger zone" for both portals. Removing a profile deactivates the
// account and pulls the listing out of the directory immediately. Nothing is
// deleted: the other party keeps their message threads and reviews, and signing
// back in (confirming the prompt) restores the account exactly as it was.
//
// The layout deliberately does two things:
//  - The pause offer sits OUTSIDE the danger styling. It is the good outcome,
//    and wrapping it in red framing made it read as part of the scary thing.
//  - The confirm field stays hidden until removal is actually requested, so the
//    page is not permanently sitting in an "about to delete" state. The
//    consequences are a scannable list rather than three paragraphs of prose.
window.RemoveProfile = (function () {
  const PHRASE = 'REMOVE';
  const COOLDOWN_MONTHS = 2; // cleaners only - must match the server

  // opts.billingNote: only the maid side pays, so only they see billing terms.
  // opts.pauseOffer: maid whose listing is live - nudge them to pause instead.
  function html(opts) {
    const isMaid = !!(opts && opts.billingNote);

    // Pause is the softer, reversible alternative - and cheaper than starting
    // over. It carries the same button id and message span the maid portal
    // already wires up, so pausing keeps working with the standalone pause card
    // gone. Rendered in both states: without the resume half, a paused maid
    // would have no way back.
    const paused = !!(opts && opts.paused);
    const pauseOffer = opts && opts.pauseOffer
      ? `<section class="dz-card pause">
           <h2>${paused ? 'Your listing is paused' : 'Is your calendar full?'}</h2>
           <p>${
             paused
               ? "You're hidden from browse, search and matches. Your account, messages and reviews are untouched. Resume whenever you're ready."
               : 'Pause instead: stay listed for half the monthly fee and switch back on whenever you want more work. No cooling-off period.'
           }</p>
           <div class="save-row">
             <button class="btn ${paused ? 'solid' : 'outline'}" id="pauseBtn" type="button" data-paused="${paused}">
               ${paused ? 'Resume my listing' : 'Pause my listing'}
             </button>
             <span class="save-msg" id="pauseMsg"></span>
           </div>
         </section>`
      : '';

    // One fact per line beats a wall of prose - people skim this, they don't read it.
    const facts = isMaid
      ? [
          ['Straight away', 'Your profile leaves Match Maid and you lose access to your account.'],
          ['Nothing is deleted', 'Your messages, reviews and history are all kept.'],
          [`${COOLDOWN_MONTHS}-month wait`, 'You cannot reactivate until the cooling-off period ends.'],
          ['Billing', 'You are billed to the end of the current cycle. Restoring access means re-subscribing.'],
        ]
      : [
          ['Straight away', 'Your profile leaves Match Maid and you lose access to your account.'],
          ['Nothing is deleted', 'Your messages, reviews and history are all kept.'],
          ['Reversible', 'Sign back in any time to restore everything.'],
        ];

    return `
      ${pauseOffer}
      <section class="dz-card danger">
        <h2>Remove profile</h2>
        <dl class="dz-facts">
          ${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
        </dl>

        <button class="btn outline sm dz-start" id="dzStart" type="button">Remove my profile</button>

        <div class="dz-confirm" id="dzConfirmStep" hidden>
          <label class="field">
            <span>Type <strong>${PHRASE}</strong> to confirm</span>
            <input id="dzConfirm" autocomplete="off" placeholder="${PHRASE}" />
          </label>
          <div class="save-row">
            <button class="btn danger" id="dzBtn" type="button" disabled>Remove my profile</button>
            <button class="btn ghost sm" id="dzCancel" type="button">Cancel</button>
            <span class="save-msg" id="dzMsg"></span>
          </div>
        </div>
      </section>`;
  }

  // Call after the profile view is in the DOM. opts.onPause: run when the maid
  // takes the "pause instead" offer (e.g. jump to the pause control).
  function bind(userId, opts) {
    const input = document.getElementById('dzConfirm');
    const btn = document.getElementById('dzBtn');
    const msg = document.getElementById('dzMsg');
    const start = document.getElementById('dzStart');
    const step = document.getElementById('dzConfirmStep');
    const cancel = document.getElementById('dzCancel');
    if (!input || !btn) return;

    // #pauseBtn is wired by the maid portal, which owns the pause API call.

    // Reveal the confirm step only when asked for, and put the cursor in it.
    start?.addEventListener('click', () => {
      step.hidden = false;
      start.hidden = true;
      input.focus();
    });
    cancel?.addEventListener('click', () => {
      step.hidden = true;
      start.hidden = false;
      input.value = '';
      btn.disabled = true;
      if (msg) { msg.textContent = ''; msg.className = 'save-msg'; }
    });

    input.addEventListener('input', () => {
      btn.disabled = input.value.trim().toUpperCase() !== PHRASE;
    });

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Removing…';
      if (msg) msg.textContent = '';
      try {
        const res = await fetch('/api/profile/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not remove your profile.');
        Session.clear();
        location.href = '/?removed=1';
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Remove my profile';
        if (msg) {
          msg.textContent = err.message;
          msg.className = 'save-msg err';
        }
      }
    });
  }

  return { html, bind };
})();
