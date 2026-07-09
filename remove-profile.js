// Shared "danger zone" for both portals. Removing a profile deactivates the
// account and pulls the listing out of the directory immediately. Nothing is
// deleted: the other party keeps their message threads and reviews, and signing
// back in (confirming the prompt) restores the account exactly as it was.
window.RemoveProfile = (function () {
  const PHRASE = 'REMOVE';

  // opts.billingNote: only the maid side pays, so only they see the billing line.
  function html(opts) {
    const billing = opts && opts.billingNote
      ? `<p class="danger-billing">
           If you remove your account you will still be billed until the end of the
           current billing cycle. To restore access you'll need to re-subscribe:
           billing then starts at the beginning of the next billing period, or
           straight away if it's been more than a month.
         </p>`
      : '';
    return `
      <section class="danger-zone">
        <h2>Remove profile</h2>
        <p class="muted">
          Your profile leaves Match Maid straight away and you lose access to your
          account and its data. Nothing is deleted — sign back in any time to
          restore everything.
        </p>
        ${billing}
        <label class="field">
          <span>Type <strong>${PHRASE}</strong> to confirm</span>
          <input id="dzConfirm" autocomplete="off" placeholder="${PHRASE}" />
        </label>
        <div class="save-row">
          <button class="btn danger" id="dzBtn" type="button" disabled>Remove my profile</button>
          <span class="save-msg" id="dzMsg"></span>
        </div>
      </section>`;
  }

  // Call after the profile view is in the DOM.
  function bind(userId) {
    const input = document.getElementById('dzConfirm');
    const btn = document.getElementById('dzBtn');
    const msg = document.getElementById('dzMsg');
    if (!input || !btn) return;

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
