// Web push on the client: lock-screen alerts for new enquiries.
//
// Never prompts on page load. The portal calls MMPush.maybeAsk() after
// something meaningful (opening a conversation, going live), and even then it
// shows our own short explainer first; the browser's prompt only appears if
// they tap "Turn on alerts". Browsers remember a "Block" for good, so a cold
// browser prompt that gets declined is a channel lost - the explainer is what
// protects it.
//
// Declined ("Not now", or Block in the browser): we never ask again. The
// settings card (MMPush.cardHTML / bindCard) is where they can turn it on later.
//
// iOS only supports web push inside the installed app (iOS 16.4+, Add to Home
// Screen). In a normal Safari tab there is no PushManager at all, so instead of
// a prompt that cannot work we show the install steps.
(function () {
  const ASKED = 'mm_push_asked';      // they have seen the explainer once
  const IOS_TIP = 'mm_push_ios_tip';  // they have seen the iOS install tip once

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  const isIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const hasPush = () =>
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  // Register here as well as in install.js: the portals do not load install.js,
  // and a second register() of the same script is a no-op.
  const registration = ('serviceWorker' in navigator)
    ? navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).catch(() => null)
    : Promise.resolve(null);

  let keyPromise = null;
  function serverKey() {
    keyPromise ??= fetch('/api/push/key')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .catch(() => ({ enabled: false }));
    return keyPromise;
  }

  function b64ToBytes(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  // 'off'          - server has no VAPID keys; offer nothing
  // 'ios-install'  - iPhone/iPad in a Safari tab; needs Add to Home Screen first
  // 'unsupported'  - this browser cannot do push at all
  // 'denied'       - blocked in browser settings; only the user can undo it
  // 'granted'      - allowed (may or may not be subscribed yet)
  // 'default'      - never asked
  async function state() {
    const k = await serverKey();
    if (!k.enabled) return 'off';
    if (isIOS() && !isStandalone()) return 'ios-install';
    if (!hasPush()) return 'unsupported';
    return Notification.permission;
  }

  async function currentSubscription() {
    const reg = await registration;
    return reg ? reg.pushManager.getSubscription() : null;
  }

  async function post(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'request failed');
    return data;
  }

  // Subscribe this device and tell the server. Safe to call repeatedly.
  async function subscribe(userId) {
    const { publicKey } = await serverKey();
    const reg = await registration;
    if (!reg || !publicKey) throw new Error('unavailable');
    const opts = { userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) };
    let sub = await reg.pushManager.getSubscription();
    try {
      sub = sub || (await reg.pushManager.subscribe(opts));
    } catch (err) {
      // A subscription made under an older key blocks a new one. Drop it, retry once.
      if (sub) { await sub.unsubscribe().catch(() => {}); sub = await reg.pushManager.subscribe(opts); }
      else throw err;
    }
    return post('/api/push/subscribe', { userId, subscription: sub.toJSON() });
  }

  // On every portal load: if they already said yes, make sure the server still
  // has this device (browsers rotate subscriptions; old ones get pruned on 410).
  async function sync(userId) {
    if (!userId || (await state()) !== 'granted') return;
    try { await subscribe(userId); } catch {}
  }

  // Log out: this device stops getting this person's alerts.
  async function forget(userId) {
    try {
      const sub = await currentSubscription();
      if (!sub) return;
      if (userId) await post('/api/push/unsubscribe', { userId, endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    } catch {}
  }

  // ---- The explainer and the iOS tip --------------------------------------
  function modal(inner) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-overlay';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <button class="modal-close" type="button" aria-label="Close">&times;</button>${inner}</div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('.modal-close').addEventListener('click', () => wrap.dispatchEvent(new Event('mm-dismiss')));
    wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.dispatchEvent(new Event('mm-dismiss')); });
    wrap.addEventListener('mm-dismiss', close);
    return { el: wrap, close };
  }

  const IOS_STEPS = `
    <ol class="install-steps">
      <li>Tap the <strong>Share</strong> button in Safari's toolbar.</li>
      <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
      <li>Open Match Maid from your home screen and turn alerts on there.</li>
    </ol>`;

  function showIOSTip() {
    store.set(IOS_TIP, '1');
    const m = modal(`
      <h2 style="margin-top:0">Get enquiries on your lock screen</h2>
      <p class="muted">On iPhone, alerts only work from the Match Maid app on your home screen,
        not from a Safari tab. It takes ten seconds:</p>
      ${IOS_STEPS}
      <div class="cp-actions"><button class="btn solid full" type="button" data-ok>Got it</button></div>`);
    m.el.querySelector('[data-ok]').addEventListener('click', m.close);
  }

  function showExplainer(userId, onDone) {
    store.set(ASKED, '1');
    const m = modal(`
      <h2 style="margin-top:0">Know the moment an enquiry lands</h2>
      <p class="muted">Customers message one cleaner at a time, so a quick reply usually wins the job.
        Turn on alerts and new enquiries show up on this device's lock screen.
        You'll still get the emails as well.</p>
      <div class="cp-actions" style="display:flex;gap:0.6rem;flex-wrap:wrap">
        <button class="btn solid" type="button" data-yes>Turn on alerts</button>
        <button class="btn ghost" type="button" data-no>Not now</button>
      </div>
      <p class="save-msg" data-msg></p>`);
    m.el.querySelector('[data-no]').addEventListener('click', m.close);
    m.el.querySelector('[data-yes]').addEventListener('click', async () => {
      const msg = m.el.querySelector('[data-msg]');
      try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { m.close(); onDone?.(); return; }
        await subscribe(userId);
        msg.className = 'save-msg ok';
        msg.textContent = "Alerts are on for this device.";
        setTimeout(() => { m.close(); onDone?.(); }, 1200);
      } catch {
        msg.className = 'save-msg err';
        msg.textContent = "Couldn't turn alerts on. You can try again from your profile.";
      }
    });
  }

  // Called after a meaningful action. Shows at most one thing, at most once.
  async function maybeAsk(userId) {
    if (!userId || document.querySelector('.modal-overlay:not([hidden])')) return;
    const s = await state();
    if (s === 'ios-install' && !store.get(IOS_TIP)) return showIOSTip();
    if (s === 'default' && !store.get(ASKED)) return showExplainer(userId);
  }

  // ---- Settings card -------------------------------------------------------
  const cardHTML = () => '<div class="panel-card" id="mmPushCard" hidden></div>';

  const CHANNEL_LABELS = {
    both: 'Email and alerts (recommended)',
    push: "Alerts only - we'll still email if an alert can't reach you",
    email: 'Email only',
  };

  async function bindCard(userId) {
    const card = document.getElementById('mmPushCard');
    if (!card || !userId) return;
    const s = await state();
    if (s === 'off') return; // server not configured: say nothing at all
    let prefs = { channel: 'both', devices: 0 };
    try { prefs = await fetch(`/api/notify-prefs?userId=${encodeURIComponent(userId)}`).then((r) => r.json()); } catch {}
    const sub = s === 'granted' ? await currentSubscription().catch(() => null) : null;

    let status;
    if (s === 'ios-install') {
      status = `<p class="muted">On iPhone, alerts work from the Match Maid app on your home screen.</p>${IOS_STEPS}`;
    } else if (s === 'unsupported') {
      status = '<p class="muted">This browser can\'t show alerts. Chrome or Edge on Android or a computer can, and so can the installed app on iPhone.</p>';
    } else if (s === 'denied') {
      status = '<p class="muted">Alerts are blocked for this site in your browser settings. Allow notifications for Match Maid there, then reload this page.</p>';
    } else if (sub) {
      status = `<p><strong>On for this device.</strong> <span class="muted">${prefs.devices > 1 ? `${prefs.devices} devices get your alerts.` : ''}</span></p>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap">
          <button class="btn outline sm" type="button" data-test>Send me a test alert</button>
          <button class="btn ghost sm" type="button" data-off>Turn off on this device</button>
        </div>`;
    } else {
      status = `<p class="muted">Get new enquiries on this device's lock screen.</p>
        <button class="btn solid sm" type="button" data-on>Turn on alerts on this device</button>`;
    }

    card.innerHTML = `
      <h2>Enquiry alerts</h2>
      ${status}
      <label class="field" style="margin-top:1rem"><span>How we tell you about new enquiries and messages</span>
        <select data-channel>
          ${Object.entries(CHANNEL_LABELS).map(([v, l]) =>
            `<option value="${v}" ${prefs.channel === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
      <p class="save-msg" data-msg></p>`;
    card.hidden = false;

    const msg = card.querySelector('[data-msg]');
    const say = (text, kind) => { msg.className = `save-msg ${kind}`; msg.textContent = text; };

    card.querySelector('[data-on]')?.addEventListener('click', async () => {
      store.set(ASKED, '1');
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') await subscribe(userId);
      } catch { say("Couldn't turn alerts on. Please try again.", 'err'); return; }
      bindCard(userId);
    });
    card.querySelector('[data-off]')?.addEventListener('click', async () => {
      await forget(userId);
      bindCard(userId);
    });
    card.querySelector('[data-test]')?.addEventListener('click', async () => {
      say('Sending…', 'pending');
      try {
        const r = await post('/api/push/test', { userId });
        say(r.delivered ? 'Sent. It should appear in a few seconds.' : "That didn't reach any device. Try turning alerts off and on again.", r.delivered ? 'ok' : 'err');
      } catch (e) { say(e.message || 'Could not send a test.', 'err'); }
    });
    card.querySelector('[data-channel]').addEventListener('change', async (e) => {
      try {
        await post('/api/notify-prefs', { userId, channel: e.target.value });
        say('Saved.', 'ok');
      } catch { say('Could not save. Please try again.', 'err'); }
    });
  }

  window.MMPush = { state, maybeAsk, sync, forget, cardHTML, bindCard };
})();
