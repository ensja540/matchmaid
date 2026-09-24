// "Loved it? Share Match Maid" - the ask that goes to someone who has just
// rated a clean five stars.
//
// Same timing logic as the Google ask next door, and for the same reason: the
// only good moment to ask someone for a favour is straight after they have told
// you something went well. The difference is what is asked for. Google is a
// public review; this is a word to one person, which is both a smaller ask and
// the one that actually grows a two-sided marketplace.
//
// Rules, all deliberate:
//   * Five stars only. Four is "fine", and "fine" is not worth telling a friend
//     about - asking anyway is how a prompt becomes a nag.
//   * Once per person, ever. Someone who has been asked and passed is not asked
//     again.
//   * Never stacked on top of the Google ask. Two modals in a row after one
//     form is an ambush, so whichever fires first is the only one shown.
window.ShareAsk = (function () {
  var KEY = 'mm_share_asked';
  var MIN_SCORE = 5;

  function alreadyAsked() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function remember() {
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ }
  }

  function show(o) {
    var url = o.shareUrl;
    var wrap = document.createElement('div');
    wrap.className = 'modal-overlay ask-overlay';
    wrap.innerHTML =
      '<div class="modal ask-modal" role="dialog" aria-modal="true" aria-labelledby="saTitle">' +
      '  <h2 class="ask-title" id="saTitle">' + (o.title || 'Loved your experience?') + '</h2>' +
      '  <p class="ask-body">' + (o.body || '') + '</p>' +
      '  <div class="ask-actions">' +
      '    <button class="btn solid" type="button" data-sa-go>Share with a friend</button>' +
      '    <button class="btn outline" type="button" data-sa-no>Not now</button>' +
      '  </div>' +
      '  <p class="ask-note" data-sa-note hidden></p>' +
      '</div>';
    document.body.appendChild(wrap);

    var note = wrap.querySelector('[data-sa-note]');
    // Asked is asked, whichever way they leave.
    function close() { remember(); wrap.remove(); }

    wrap.querySelector('[data-sa-go]').addEventListener('click', function () {
      // The native share sheet where there is one - on a phone that is every
      // app they might send it through, and nothing we could build beats it.
      // Everywhere else, the link on the clipboard and a word saying so, rather
      // than a row of network buttons nobody asked for.
      if (navigator.share) {
        navigator.share({ title: 'Match Maid', text: o.shareText || '', url: url })
          .then(close)
          // A cancelled share sheet is not a refusal - leave the modal up so
          // they can try the other way.
          .catch(function () {});
        return;
      }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          note.hidden = false;
          note.textContent = 'Link copied - paste it wherever you like.';
          setTimeout(close, 1600);
        }).catch(function () { window.prompt('Copy this link:', url); close(); });
        return;
      }
      window.prompt('Copy this link:', url);
      close();
    });
    wrap.querySelector('[data-sa-no]').addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  }

  // score: what they just rated. opts: { shareUrl, shareText, title, body }
  // Returns true when something was shown, so a caller can chain the two asks
  // without ever showing both.
  function maybeAsk(score, opts) {
    if (!(Number(score) >= MIN_SCORE)) return false;
    if (alreadyAsked()) return false;
    var o = opts || {};
    if (!o.shareUrl) return false;
    show(o);
    return true;
  }

  return { maybeAsk: maybeAsk, MIN_SCORE: MIN_SCORE };
})();
