// Google Analytics 4 - single source of truth for the Measurement ID.
// Loaded in the <head> of every page. The heavy gtag library is fetched
// asynchronously so it never blocks rendering; the small setup below runs
// synchronously so window.gtag / window.mmTrack exist before other scripts.
(function () {
  var ID = 'G-33GLL7FCY6';

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', ID);

  // Small, safe helper for one-off conversion events elsewhere in the app
  // (e.g. a completed signup). No-ops if GA is blocked, so callers never break.
  window.mmTrack = function (event, params) {
    try { window.gtag('event', event, params || {}); } catch (e) {}
  };
})();
