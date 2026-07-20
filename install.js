// Registers the service worker and drives the "Install app" button.
//
// Two very different platforms:
//  - Chrome/Edge/Android fire `beforeinstallprompt`, which we stash and replay
//    on click for a real one-tap install.
//  - iOS Safari has no programmatic install, ever. The only route is
//    Share -> Add to Home Screen, so there we show those steps instead.
//
// Markup contract: any `<button data-install-app hidden>` on the page. It stays
// hidden unless installing is actually possible, so it never promises something
// the browser cannot deliver.
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  const buttons = () => document.querySelectorAll('[data-install-app]');
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  // iPhone/iPad, including iPadOS which reports as a Mac with touch.
  const isIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let deferred = null;

  function show() {
    buttons().forEach((b) => {
      b.hidden = false;
      b.addEventListener('click', onClick);
    });
  }
  function hide() {
    buttons().forEach((b) => { b.hidden = true; });
  }

  function onClick(e) {
    const btn = e.currentTarget;
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.finally(() => {
        deferred = null;
        hide(); // one shot: the browser will not replay this prompt
      });
      return;
    }
    if (isIOS()) showIOSSheet(btn);
  }

  // iOS gets instructions, not a prompt. Built here rather than in every page's
  // markup so the pages only need the one button.
  function showIOSSheet(btn) {
    if (document.getElementById('mmInstallSheet')) return;
    const wrap = document.createElement('div');
    wrap.className = 'modal-overlay';
    wrap.id = 'mmInstallSheet';
    wrap.innerHTML = `
      <div class="modal">
        <button class="modal-close" type="button" aria-label="Close">×</button>
        <h2 style="margin-top:0">Add Match Maid to your home screen</h2>
        <p class="muted">iPhone and iPad install from the Share menu.</p>
        <ol class="install-steps">
          <li>Tap the <strong>Share</strong> button in Safari's toolbar.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>. Match Maid appears with your other apps.</li>
        </ol>
        <div class="cp-actions"><button class="btn solid full" type="button" data-sheet-ok>Got it</button></div>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('.modal-close').addEventListener('click', close);
    wrap.querySelector('[data-sheet-ok]').addEventListener('click', close);
    wrap.addEventListener('click', (ev) => { if (ev.target === wrap) close(); });
    btn?.blur();
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // suppress Chrome's own mini-infobar; we have our own button
    deferred = e;
    if (!isStandalone()) show();
  });

  window.addEventListener('appinstalled', () => { deferred = null; hide(); });

  // Already installed? Nothing to offer. Otherwise iOS never fires
  // beforeinstallprompt, so reveal the button for it on load.
  document.addEventListener('DOMContentLoaded', () => {
    if (isStandalone()) { hide(); return; }
    if (isIOS()) show();
  });
})();
