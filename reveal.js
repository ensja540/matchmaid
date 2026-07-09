// Scroll reveal for any element marked `.reveal`.
//
// The contract is fail-safe by design: the markup is fully visible on its own,
// and the hidden start state only exists under `.js-anim`, which this script
// adds to <html>. No script, no hiding — a broken bundle can never blank the
// page. Reduced motion and browsers without IntersectionObserver skip straight
// to the visible state.
//
// Each element reveals once and is then unobserved, so scrolling back up never
// re-hides it. A container marked `.stagger` cascades its revealed children.
//
// Note: `.js-anim` here sits on <html>, while `.howflow.js-anim` is on the
// section itself — both classes must land on the same element to match, so the
// two never collide.
(function () {
  var items = [].slice.call(document.querySelectorAll('.reveal'));
  if (!items.length) return;

  var show = function (el) { el.classList.add('in-view'); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof IntersectionObserver === 'undefined') {
    items.forEach(show);
    return;
  }

  document.documentElement.classList.add('js-anim');
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        show(en.target);
        io.unobserve(en.target);
      });
    },
    { threshold: 0.18 } // fire once the element is ~18% into view
  );
  items.forEach(function (el) { io.observe(el); });
})();
