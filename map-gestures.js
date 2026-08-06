// Two-finger zoom, but only while the pointer is actually over the map.
//
// Both maps ship with scrollWheelZoom off, for a good reason: a map that eats
// the page scroll as you pass over it is one of the most hated things on the
// web, and both of these sit mid-form where you scroll past them constantly.
//
// Scoping it to hover is the usual compromise, and it is what people mean by
// "two fingers should zoom": the wheel only zooms while the cursor is on the
// map, so scrolling the page never gets hijacked from a distance. A trackpad
// pinch arrives as a ctrl+wheel event and is handled by the same Leaflet
// handler, so pinch works too. Touchscreen pinch is Leaflet's touchZoom, which
// is on by default and untouched by any of this.
window.mmHoverZoom = function (map, container) {
  if (!map || !container || !map.scrollWheelZoom) return;
  const arm = () => map.scrollWheelZoom.enable();
  const disarm = () => map.scrollWheelZoom.disable();

  container.addEventListener('pointerenter', arm);
  container.addEventListener('pointerleave', disarm);
  // Belt and braces: a pointer that leaves via a route that skips pointerleave
  // (tab switch, the window losing focus mid-hover) must not leave the wheel
  // armed, or the next scroll from anywhere zooms the map instead of the page.
  window.addEventListener('blur', disarm);
  document.addEventListener('visibilitychange', () => { if (document.hidden) disarm(); });
  map.on('unload', disarm);
};
