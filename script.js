// Landing-page behaviour: footer year, nav shrink, subtle reveals.
document.getElementById('year').textContent = new Date().getFullYear();

// Shrink / solidify the nav after ~150px of scroll.
const header = document.getElementById('siteHeader');
if (header) {
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 150);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Fade-in reveals as sections enter the viewport (once each).
const revealables = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window && revealables.length) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
  );
  revealables.forEach((el) => io.observe(el));
} else {
  // No observer support: just show everything.
  revealables.forEach((el) => el.classList.add('in'));
}
