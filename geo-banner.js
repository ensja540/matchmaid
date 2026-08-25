// Offers the visitor their own country's site, without ever taking them there.
//
// This replaced an automatic IP redirect. Redirecting on IP costs traffic three
// ways: a crawler that gets redirected never indexes the page as itself, a
// shared link sends every reader somewhere other than the page that was shared,
// and being moved somewhere you did not ask to go reads as broken. A banner
// keeps every URL reachable and shareable from anywhere and still puts the
// right country in front of the person who needs it.
//
// Deliberately quiet: one line, dismissible, and once dismissed it stays gone
// for three months. Nothing renders at all unless the server says this visitor
// is in the other country AND this page has a twin there.
(function () {
  var KEY = 'mm_geo_dismissed';
  var KEEP_DAYS = 90;

  try {
    var until = Number(localStorage.getItem(KEY) || 0);
    if (until && Date.now() < until) return;
  } catch (e) { /* private mode: just show it */ }

  // The server needs the path to work out whether this page has a twin.
  var path = location.pathname + location.search;
  if (!window.fetch) return;

  fetch('/api/geo?path=' + encodeURIComponent(path), { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.other || !d.other.url) return;
      show(d.other);
    })
    .catch(function () { /* never let this break the page */ });

  function show(other) {
    var bar = document.createElement('div');
    bar.className = 'geo-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Country');

    var text = document.createElement('span');
    text.className = 'geo-bar-text';
    text.textContent = 'Looks like you’re in ' + other.name + '.';

    var go = document.createElement('a');
    go.className = 'geo-bar-go';
    go.href = other.url;
    go.textContent = 'Go to Match Maid ' + other.name;
    // rel=alternate names the relationship for anything reading the markup;
    // the hreflang tags in <head> are what search engines actually use.
    go.setAttribute('rel', 'alternate');
    go.setAttribute('hreflang', other.country === 'AU' ? 'en-AU' : 'en-NZ');

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'geo-bar-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.innerHTML = '&times;';
    close.addEventListener('click', function () {
      bar.remove();
      try {
        localStorage.setItem(KEY, String(Date.now() + KEEP_DAYS * 86400000));
      } catch (e) { /* nothing to do */ }
    });

    bar.appendChild(text);
    bar.appendChild(go);
    bar.appendChild(close);
    // Top of the body, above the notice bar, so it is the first thing read -
    // but appended after load so it never blocks rendering.
    document.body.insertBefore(bar, document.body.firstChild);
  }
})();
