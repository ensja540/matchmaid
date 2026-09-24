// Asking for a Google review, on both sides of the marketplace.
//
// Timing is the whole thing. The ask lands immediately after someone has just
// finished rating a clean well - they are already thinking about the job and
// have just told us it went fine. Asking at any other moment is an interruption;
// asking after a bad one is tone deaf and is how you get the honest answer you
// did not want on a public page.
//
// Rules, all of them deliberate:
//   * Only after a rating of 4 or better. Below that, nothing is shown.
//   * Once per person, ever. Someone who has been asked and said "not now" is
//     not asked again - a second ask is nagging, and it is the fastest way to
//     make someone resent a product they otherwise liked.
//   * Nothing at all if there is no Google Business Profile to point at.
window.GoogleAsk = (function () {
  var KEY = 'mm_google_asked';
  var MIN_SCORE = 4;

  function alreadyAsked() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function remember() {
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ }
  }

  // The URL lives on the server so it can be set once, in one place, without a
  // deploy. Empty until there is a profile - and then nothing is ever shown.
  function url() {
    if (!window.fetch) return Promise.resolve('');
    return fetch('/api/google-review-url')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return (d && d.url) || ''; })
      .catch(function () { return ''; });
  }

  function show(href, opts) {
    var o = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'modal-overlay ask-overlay';
    wrap.innerHTML =
      '<div class="modal ask-modal" role="dialog" aria-modal="true" aria-labelledby="gaTitle">' +
      '  <h2 class="ask-title" id="gaTitle">' + (o.title || 'Glad that went well.') + '</h2>' +
      '  <p class="ask-body">' + (o.body || '') + '</p>' +
      '  <div class="ask-actions">' +
      '    <a class="btn solid" target="_blank" rel="noopener" href="' + href + '">Review us on Google</a>' +
      '    <button class="btn outline" type="button" data-ga-no>Not now</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(wrap);

    // Asked is asked, whichever way they leave. Someone who closes it has
    // answered as clearly as someone who clicks through.
    function close() { remember(); wrap.remove(); }
    wrap.querySelector('[data-ga-no]').addEventListener('click', close);
    wrap.querySelector('a').addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  }

  // score: what they just rated. opts: { title, body }
  //
  // Resolves to whether anything was actually shown, so a caller can offer a
  // second ask only when this one stayed silent. It has to be a promise: the
  // Google URL is fetched, so "did it show" is not known synchronously.
  function maybeAsk(score, opts) {
    if (!(Number(score) >= MIN_SCORE)) return Promise.resolve(false);
    if (alreadyAsked()) return Promise.resolve(false);
    return url().then(function (href) {
      if (!href) return false;
      show(href, opts);
      return true;
    });
  }

  return { maybeAsk: maybeAsk, MIN_SCORE: MIN_SCORE };
})();
