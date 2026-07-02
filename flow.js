// Dynamic "how it works" flow chart: auto-advances a highlight through the
// steps, and lets you hover a step to focus it.
(function () {
  document.querySelectorAll('[data-flow]').forEach((flow) => {
    const steps = [...flow.querySelectorAll('.flow-step')];
    if (!steps.length) return;
    let i = 0;
    let timer = null;
    const activate = (n) => {
      i = n;
      steps.forEach((s, k) => s.classList.toggle('active', k === n));
    };
    const start = () => {
      stop();
      timer = setInterval(() => activate((i + 1) % steps.length), 1900);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    steps.forEach((s, k) => {
      s.addEventListener('mouseenter', () => { stop(); activate(k); });
      s.addEventListener('mouseleave', start);
    });
    activate(0);
    start();
  });
})();
