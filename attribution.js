// Where a visitor came from, captured on their FIRST page view and kept until
// they sign up (which is often days later, on a different page).
//
// First-touch on purpose. Someone finds us via a flyer QR on Monday, thinks
// about it, types matchmaid.co.nz on Thursday and signs up. Last-touch calls
// that "direct" and the flyer looks worthless; first-touch credits the flyer,
// which is the thing that actually did the work. So the record is written once
// and never overwritten - see the early return in capture().
//
// localStorage, not a cookie: it is first-party, never sent to a third party,
// and holds nothing identifying - a channel name and the page they landed on.
(function () {
  var KEY = 'mm_acq';

  // Search engines and the big referrers, so "google" doesn't arrive as four
  // different hostnames. Anything unrecognised keeps its bare hostname, which
  // is more useful than bucketing it as "other".
  var SEARCH = {
    'google': 'google', 'bing': 'bing', 'duckduckgo': 'duckduckgo',
    'yahoo': 'yahoo', 'ecosia': 'ecosia', 'brave': 'brave',
  };
  var SOCIAL = {
    'facebook': 'facebook', 'fb': 'facebook', 'instagram': 'instagram',
    'linkedin': 'linkedin', 'reddit': 'reddit', 't.co': 'twitter',
    'twitter': 'twitter', 'x.com': 'twitter', 'tiktok': 'tiktok',
    'neighbourly': 'neighbourly', 'trademe': 'trademe',
  };

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
  }
  // "google.co.nz" -> "google", "m.facebook.com" -> "facebook".
  function match(host, table) {
    if (!host) return '';
    var parts = host.split('.');
    for (var i = 0; i < parts.length; i++) if (table[parts[i]]) return table[parts[i]];
    return table[host] || '';
  }

  function read(params, name) {
    var v = params.get(name);
    return v ? String(v).slice(0, 80).trim().toLowerCase() : '';
  }

  function classify() {
    var params = new URLSearchParams(location.search);
    var landing = (location.pathname || '/').slice(0, 200);

    // 1. An explicit tag always wins - it is the only thing we can trust
    //    exactly, and it is how flyers, QR codes and ads identify themselves.
    var utmSource = read(params, 'utm_source') || read(params, 'ref');
    if (utmSource) {
      return {
        source: utmSource,
        medium: read(params, 'utm_medium') || 'unknown',
        campaign: read(params, 'utm_campaign') || '',
        referrer: document.referrer.slice(0, 300),
        landing: landing,
      };
    }

    // 2. Google Ads stamps gclid even when the utm tags are missing.
    if (params.get('gclid')) {
      return { source: 'google', medium: 'cpc', campaign: '', referrer: document.referrer.slice(0, 300), landing: landing };
    }

    // 3. Otherwise infer from the referrer.
    var host = hostOf(document.referrer);
    if (!document.referrer || !host) {
      // No referrer: typed the address, a bookmark, or a client that strips it.
      // "direct" is a bucket that quietly absorbs untagged campaigns, which is
      // exactly why flyers need their own tagged URL.
      return { source: 'direct', medium: 'none', campaign: '', referrer: '', landing: landing };
    }
    if (host === location.hostname.replace(/^www\./, '')) return null; // internal nav, not an entry

    var search = match(host, SEARCH);
    if (search) return { source: search, medium: 'organic', campaign: '', referrer: document.referrer.slice(0, 300), landing: landing };
    var social = match(host, SOCIAL);
    if (social) return { source: social, medium: 'social', campaign: '', referrer: document.referrer.slice(0, 300), landing: landing };
    return { source: host, medium: 'referral', campaign: '', referrer: document.referrer.slice(0, 300), landing: landing };
  }

  function capture() {
    var existing;
    try { existing = localStorage.getItem(KEY); } catch (e) { return; }
    if (existing) return; // first touch already recorded - never overwrite
    var acq = classify();
    if (!acq) return; // internal navigation
    try { localStorage.setItem(KEY, JSON.stringify(acq)); } catch (e) {}
  }

  capture();

  // What the signup call sends. Null when we have nothing, so the server stores
  // NULL rather than a fabricated "direct".
  window.mmAttribution = function () {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };
})();
