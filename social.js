// Facebook and Instagram links in the header, on every page that has one.
//
// Injected rather than pasted into eighteen HTML files: the two icons are a
// dozen lines of SVG each, and duplicating them means the next change to a URL
// or a label is eighteen edits with one of them missed. session.js already
// rewrites these same containers, so a JS-managed header is the existing
// pattern here rather than a new one.
//
// Icons are inline SVG in currentColor - no icon font, no external request, and
// they recolour with the header they sit in.
(function () {
  var LINKS = [
    {
      name: 'Facebook',
      href: 'https://www.facebook.com/profile.php?id=61591829660449',
      svg:
        '<path fill="currentColor" d="M13.4 21v-7.6h2.5l.4-2.9h-2.9V8.6c0-.8.2-1.4 1.4-1.4h1.6V4.6c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2H7.8v2.9h2.4V21h3.2z"/>',
    },
    {
      name: 'Instagram',
      href: 'https://www.instagram.com/matchmaidnz/',
      svg:
        '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4.8" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
        '<circle cx="12" cy="12" r="3.9" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
        '<circle cx="16.9" cy="7.1" r="1.15" fill="currentColor"/>',
    },
  ];

  function build() {
    var wrap = document.createElement('span');
    wrap.className = 'social-links';
    LINKS.forEach(function (l) {
      var a = document.createElement('a');
      a.className = 'social-link';
      a.href = l.href;
      a.target = '_blank';
      // noopener is the one that matters (the new tab must not get a handle on
      // this window); noreferrer keeps the analytics on their side honest.
      a.rel = 'noopener noreferrer';
      a.title = 'Match Maid on ' + l.name;
      // The link has no text, so it needs a name for a screen reader.
      a.setAttribute('aria-label', 'Match Maid on ' + l.name);
      a.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' + l.svg + '</svg>';
      wrap.appendChild(a);
    });
    return wrap;
  }

  function mount() {
    if (document.querySelector('.social-links')) return; // never twice
    // Pitch pages and portals put their nav in different containers; the splash
    // has neither, so it gets them under the masthead badges instead.
    var bar = document.querySelector('.pitch-top-right, .app-bar-right');
    if (bar) {
      // First child, so session.js appending "Log out" and the portal button
      // later keeps those as the rightmost - the actions people came for stay
      // where they expect them.
      bar.insertBefore(build(), bar.firstChild);
      return;
    }
    var mh = document.querySelector('.masthead .mh-inner');
    if (mh) {
      var el = build();
      el.classList.add('social-links-splash');
      mh.appendChild(el);
    }
  }

  if (document.readyState !== 'loading') mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
