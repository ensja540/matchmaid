// Site-wide feedback widget: a floating button that opens a small form and
// posts to /api/feedback. If logged in we attach the user; otherwise we ask for
// an optional email. Feedback is read by the operator on the /admin dashboard.
(function () {
  if (document.getElementById('mm-feedback-btn')) return;
  var user = (window.Session && Session.get && Session.get()) || null;

  var btn = document.createElement('button');
  btn.id = 'mm-feedback-btn';
  btn.className = 'mm-fb-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Send feedback');
  btn.innerHTML = '<span aria-hidden="true">💬</span> Feedback';

  var panel = document.createElement('div');
  panel.className = 'mm-fb-panel';
  panel.hidden = true;
  panel.innerHTML =
    '<div class="mm-fb-head"><strong>Send feedback</strong><button type="button" class="mm-fb-x" aria-label="Close">×</button></div>' +
    '<p class="mm-fb-sub">Ideas, bugs, anything. It goes straight to the Match Maid team.</p>' +
    '<textarea class="mm-fb-text" rows="4" placeholder="What’s on your mind?"></textarea>' +
    (user ? '' : '<input class="mm-fb-email" type="email" placeholder="Your email (optional)" />') +
    '<button type="button" class="mm-fb-send btn solid full">Send</button>' +
    '<p class="mm-fb-msg" role="status"></p>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  function toggle(open) {
    panel.hidden = open === undefined ? !panel.hidden : !open;
    if (!panel.hidden) panel.querySelector('.mm-fb-text').focus();
  }
  btn.addEventListener('click', function () { toggle(); });
  panel.querySelector('.mm-fb-x').addEventListener('click', function () { toggle(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) toggle(false); });

  panel.querySelector('.mm-fb-send').addEventListener('click', function () {
    var text = panel.querySelector('.mm-fb-text').value.trim();
    var msgEl = panel.querySelector('.mm-fb-msg');
    if (!text) { msgEl.textContent = 'Type a message first.'; return; }
    var emailEl = panel.querySelector('.mm-fb-email');
    var body = {
      userId: user && user.id,
      email: user ? user.email : emailEl ? emailEl.value.trim() : '',
      page: location.pathname,
      message: text,
    };
    msgEl.textContent = 'Sending…';
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function () {
        panel.querySelector('.mm-fb-text').value = '';
        msgEl.textContent = 'Thanks! We got it. 🙌';
        setTimeout(function () { toggle(false); msgEl.textContent = ''; }, 1500);
      })
      .catch(function () { msgEl.textContent = 'Could not send. Please try again.'; });
  });
})();
