// Login / signup for a single, fixed role (no toggle). The role comes from the
// page's ?role= query and does not change here; each side has its own page.
// Which country's marketplace a new account joins, taken from the link that
// brought them here (/login?country=AU on the Australian pages). Anything
// unrecognised falls back to New Zealand rather than guessing.
const SIGNUP_COUNTRY =
  new URLSearchParams(location.search).get('country') === 'AU' ? 'AU' : 'NZ';

const params = new URLSearchParams(location.search);
const role = params.get('role') === 'maid' ? 'maid' : 'customer';
let mode = params.get('mode') === 'signup' ? 'signup' : 'login';

// Theme the page accent to match the role (maid = copper, customer = green).
document.body.classList.add(role === 'maid' ? 'role-maid' : 'role-customer');

const form = document.getElementById('authForm');
const msg = document.getElementById('msg');
const submitBtn = document.getElementById('submitBtn');
const switchBtn = document.getElementById('switchMode');
const switchText = document.getElementById('switchText');
const roleLabel = document.getElementById('roleLabel');
const blurb = document.getElementById('roleBlurb');

const BLURBS = {
  maid: 'List your services and get exclusive local enquiries. Try it now for free while we build out our user base.',
  customer: 'Search local cleaners and see rates up front. Always free.',
};

blurb.textContent = BLURBS[role];

// Landed on the wrong side? Cross to the other role's page without losing your
// place in login vs signup. The maid page offers "need a clean"; vice versa.
const OTHER = { maid: 'customer', customer: 'maid' };
const ROLE_SWITCH = {
  maid: { text: 'Actually need a clean?', link: 'Find a cleaner instead' },
  customer: { text: 'Here to clean, not hire?', link: 'List your services instead' },
};
const roleSwitchText = document.getElementById('roleSwitchText');
const roleSwitchLink = document.getElementById('roleSwitchLink');
roleSwitchText.textContent = ROLE_SWITCH[role].text;
roleSwitchLink.textContent = ROLE_SWITCH[role].link;

// A cleaner's share link carries their code. The same code works on both
// sides - /login?role=maid... invites another cleaner, /login?role=customer...
// (and the /b/<CODE> quick-book link) brings them a customer - so what a code
// earns is decided by the role on the link, not by the code itself.
const refFromLink = (params.get('ref') || '').trim().toUpperCase();
// A quick-book visitor may have picked the code up on /browse several clicks
// ago, so fall back to what that page stashed for the session.
function storedRef() {
  try { return sessionStorage.getItem('mm_ref') || ''; } catch { return ''; }
}

function render() {
  const signup = mode === 'signup';
  // Make first-party identity explicit: this is Match Maid's own login, not a
  // page collecting credentials for any third party. Clear for users, and a
  // signal to Safe Browsing's social-engineering classifier.
  roleLabel.textContent = signup ? 'Create your Match Maid account' : 'Log in to Match Maid';
  document.querySelectorAll('[data-signup-only]').forEach((el) => {
    el.style.display = signup ? '' : 'none';
  });
  document.querySelectorAll('[data-login-only]').forEach((el) => {
    el.style.display = signup ? 'none' : '';
  });
  // The code field is offered on both sides now: a cleaner's code invites other
  // cleaners and brings them customers, so a customer may well have one.
  document.querySelectorAll('[data-maid-only]').forEach((el) => {
    if (role !== 'maid') el.style.display = 'none';
  });
  const carried = refFromLink || storedRef();
  if (signup && carried && form.referralCode && !form.referralCode.value) {
    form.referralCode.value = carried;
  }
  submitBtn.textContent = signup ? 'Create account' : 'Log in';
  // Carry login/signup across the switch so a wrong-role signup stays a signup.
  roleSwitchLink.href = `/login?role=${OTHER[role]}${signup ? '&mode=signup' : ''}`;
  switchText.textContent = signup ? 'Already registered?' : 'New to Match Maid?';
  switchBtn.textContent = signup ? 'Log in instead' : 'Create an account';
  form.password.autocomplete = signup ? 'new-password' : 'current-password';
  msg.textContent = '';
  msg.className = 'auth-msg';
  clearReactivate();
}

switchBtn.addEventListener('click', () => {
  mode = mode === 'login' ? 'signup' : 'login';
  render();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'auth-msg';
  msg.textContent = 'Working…';

  const body = {
    role,
    email: form.email.value,
    password: form.password.value,
  };
  if (mode === 'signup') {
    body.fullName = form.fullName.value;
    // Which marketplace this account joins. The Australian pages link here with
    // ?country=AU; anything else is New Zealand. The server checks it against
    // where the signer-up actually is before it creates anything.
    body.country = SIGNUP_COUNTRY;
    body.referralCode = form.referralCode?.value.trim() || refFromLink || storedRef() || undefined;
    // Where they first came from. Null when we never saw an entry (a returning
    // visitor whose storage was cleared) - the server then stores NULL rather
    // than crediting a channel we'd be guessing at.
    body.attribution = (window.mmAttribution && window.mmAttribution()) || undefined;
  }
  // Set by the "Reactivate" prompt below, for a removed account signing back in.
  if (pendingReactivate) body.reactivate = true;

  try {
    const res = await fetch(mode === 'signup' ? '/api/register' : '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    // A successful registration is our key conversion - count it even if email
    // confirmation is still pending, since the account was created.
    if (mode === 'signup' && (res.ok || data.needsVerification)) {
      window.mmTrack && mmTrack('sign_up', { method: role });
    }
    // Either a fresh signup (201) or a login onto an unconfirmed account (403)
    // can ask for the emailed code before we let them in.
    if (data.needsVerification) return showVerifyStep(data);
    if (!res.ok) {
      if (data.deactivated) return offerReactivate(data.error);
      msg.textContent = data.error || 'Something went wrong.';
      msg.classList.add('error');
      return;
    }
    pendingReactivate = false;
    finishAuth(data.user);
  } catch {
    msg.textContent = 'Could not reach the server. Is it running?';
    msg.classList.add('error');
  }
});

// ---- Removed accounts ------------------------------------------------------
// The server rejects a removed account with { deactivated: true } rather than
// signing it in. Nothing was deleted, so we offer to restore it: retrying the
// same credentials with reactivate:true flips the account back to active.
let pendingReactivate = false;
let pendingGoogleReactivate = false;

// onConfirm defaults to replaying the password form; the Google path passes its
// own replay so the user doesn't have to re-pick their account.
function offerReactivate(text, onConfirm) {
  msg.className = 'auth-msg error';
  msg.textContent = text || 'This profile was removed.';
  if (document.getElementById('reactivateBtn')) return;

  const wrap = document.createElement('div');
  wrap.className = 'reactivate';
  wrap.innerHTML =
    '<button type="button" class="btn outline full" id="reactivateBtn">Reactivate my profile</button>';
  msg.insertAdjacentElement('afterend', wrap);

  document.getElementById('reactivateBtn').addEventListener('click', () => {
    wrap.remove();
    if (onConfirm) return onConfirm();
    pendingReactivate = true;
    form.requestSubmit();
  });
}
function clearReactivate() {
  document.querySelector('.reactivate')?.remove();
  pendingReactivate = false;
  pendingGoogleReactivate = false;
}

// Shared success path for password + Google sign-in.
function finishAuth(user) {
  Session.set(user);
  msg.className = 'auth-msg ok';
  msg.textContent = `Welcome, ${user.fullName}! Taking you to your ${
    user.role === 'cleaner' ? 'maid portal' : 'customer portal'
  }…`;
  setTimeout(() => { location.href = Session.homeFor(user.role); }, 700);
}

// ---- Email confirmation (hard gate) ---------------------------------------
// The server sent a 6-digit code to the address and is holding the account
// until it's entered. Swap the whole card for a code step; on success we log
// them straight in.
const card = document.querySelector('.auth-card');
function showVerifyStep({ userId, email }) {
  card.innerHTML = `
    <p class="auth-role serif">Confirm your email</p>
    <p class="auth-sub">We emailed a 6-digit code to <strong>${escapeHtml(email || 'your address')}</strong>.
      Enter it below to finish. It expires in 15 minutes.</p>
    <form id="verifyForm" novalidate>
      <label class="field">
        <span>Confirmation code</span>
        <input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
               placeholder="123456" class="code-input" required />
      </label>
      <button class="btn solid lg full" type="submit" id="verifyBtn">Confirm &amp; continue</button>
      <p class="auth-msg" id="verifyMsg" role="status"></p>
    </form>
    <p class="auth-switch">
      <span>Didn't get it?</span>
      <button type="button" class="linklike" id="resendCode">Resend code</button>
    </p>
    <p class="auth-switch">
      <a class="linklike" href="/login?role=${role}">Use a different email</a>
    </p>`;

  const vForm = document.getElementById('verifyForm');
  const vMsg = document.getElementById('verifyMsg');
  const vBtn = document.getElementById('verifyBtn');
  const codeInput = vForm.code;
  codeInput.focus();

  vForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = codeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
      vMsg.className = 'auth-msg error';
      vMsg.textContent = 'Enter the 6-digit code from your email.';
      return;
    }
    vBtn.disabled = true;
    vMsg.className = 'auth-msg';
    vMsg.textContent = 'Confirming…';
    try {
      const res = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        vBtn.disabled = false;
        vMsg.className = 'auth-msg error';
        vMsg.textContent = data.error || 'Could not confirm. Try again.';
        return;
      }
      finishAuth(data.user);
    } catch {
      vBtn.disabled = false;
      vMsg.className = 'auth-msg error';
      vMsg.textContent = 'Could not reach the server.';
    }
  });

  document.getElementById('resendCode').addEventListener('click', async (e) => {
    const link = e.currentTarget;
    link.disabled = true;
    vMsg.className = 'auth-msg';
    vMsg.textContent = 'Sending a new code…';
    try {
      const res = await fetch('/api/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      vMsg.className = 'auth-msg ok';
      vMsg.textContent = res.ok ? 'Sent - check your inbox.' : (data.error || 'Could not resend.');
    } catch {
      vMsg.className = 'auth-msg error';
      vMsg.textContent = 'Could not reach the server.';
    }
    setTimeout(() => { link.disabled = false; }, 3000);
  });
}

// ---- Forgot / reset password ------------------------------------------------
// Step 1 (Forgot password?): ask for the email, the server emails a one-use
// link. Step 2 (arriving on that link, ?reset=<token>): choose a new password,
// then they are signed straight in.
document.getElementById('forgotBtn')?.addEventListener('click', () => showForgotStep(form.email.value));

function showForgotStep(prefill) {
  card.innerHTML = `
    <p class="auth-role serif">Reset your password</p>
    <p class="auth-sub">Enter the email you signed up with and we'll send you a link to choose a new password.</p>
    <form id="forgotForm" novalidate>
      <label class="field">
        <span>Email</span>
        <input name="email" type="email" autocomplete="email" placeholder="you@example.com" required />
      </label>
      <button class="btn solid lg full" type="submit" id="forgotSubmit">Send reset link</button>
      <p class="auth-msg" id="forgotMsg" role="status"></p>
    </form>
    <p class="auth-switch">
      <a class="linklike" href="/login?role=${role}${SIGNUP_COUNTRY === 'AU' ? '&country=AU' : ''}">Back to log in</a>
    </p>`;
  const fForm = document.getElementById('forgotForm');
  const fMsg = document.getElementById('forgotMsg');
  const fBtn = document.getElementById('forgotSubmit');
  fForm.email.value = prefill || '';
  fForm.email.focus();
  fForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = fForm.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      fMsg.className = 'auth-msg error';
      fMsg.textContent = 'Enter a valid email address.';
      return;
    }
    fBtn.disabled = true;
    fMsg.className = 'auth-msg';
    fMsg.textContent = 'Sending…';
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Worded the same whether or not an account exists - see the server.
      fMsg.className = 'auth-msg ok';
      fMsg.textContent = `If there's a Match Maid account for ${email}, a reset link is on its way. Check your inbox (and spam). It expires in an hour.`;
      setTimeout(() => { fBtn.disabled = false; }, 30000);
    } catch (err) {
      fBtn.disabled = false;
      fMsg.className = 'auth-msg error';
      fMsg.textContent = err.message || 'Could not reach the server.';
    }
  });
}

function showResetStep(token) {
  card.innerHTML = `
    <p class="auth-role serif">Choose a new password</p>
    <p class="auth-sub">At least 8 characters. You'll be signed in once it's saved.</p>
    <form id="resetForm" novalidate>
      <label class="field">
        <span>New password</span>
        <input name="password" type="password" autocomplete="new-password" placeholder="••••••••" required />
      </label>
      <label class="field">
        <span>Confirm new password</span>
        <input name="confirm" type="password" autocomplete="new-password" placeholder="••••••••" required />
      </label>
      <button class="btn solid lg full" type="submit" id="resetSubmit">Save new password</button>
      <p class="auth-msg" id="resetMsg" role="status"></p>
    </form>`;
  const rForm = document.getElementById('resetForm');
  const rMsg = document.getElementById('resetMsg');
  const rBtn = document.getElementById('resetSubmit');
  rForm.password.focus();
  const fail = (text, withLink) => {
    rBtn.disabled = false;
    rMsg.className = 'auth-msg error';
    rMsg.textContent = text;
    if (withLink && !document.getElementById('resetAgain')) {
      const p = document.createElement('p');
      p.className = 'auth-switch';
      p.innerHTML = '<button type="button" class="linklike" id="resetAgain">Send me a new link</button>';
      rForm.insertAdjacentElement('afterend', p);
      p.querySelector('button').addEventListener('click', () => showForgotStep(''));
    }
  };
  rForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = rForm.password.value;
    if (password.length < 8) return fail('Choose a password of at least 8 characters.');
    if (password !== rForm.confirm.value) return fail("Those two passwords don't match.");
    rBtn.disabled = true;
    rMsg.className = 'auth-msg';
    rMsg.textContent = 'Saving…';
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) return fail(data.error || 'Could not reset your password.', data.expired);
      // Drop the spent token from the address bar so a refresh or a shared
      // screenshot does not carry it.
      history.replaceState(null, '', location.pathname + `?role=${role}`);
      if (data.user) return finishAuth(data.user);
      rMsg.className = 'auth-msg ok';
      rMsg.innerHTML = `Password updated. <a class="linklike" href="/login?role=${role}">Log in</a>`;
    } catch {
      fail('Could not reach the server.');
    }
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---- Sign in with Google (Google Identity Services) ----
// Set window.MM_GOOGLE_CLIENT_ID in login.html to your OAuth Web Client ID to
// activate this. Until then the button shows as "coming soon".
function onGoogleCredential(resp) {
  msg.className = 'auth-msg';
  msg.textContent = 'Signing you in with Google…';
  fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Google sign-in doubles as signup for a new account, so it carries the
    // same first-touch record; the server ignores it for an existing user.
    body: JSON.stringify({
      country: SIGNUP_COUNTRY,
      credential: resp.credential, role, reactivate: pendingGoogleReactivate,
      attribution: (window.mmAttribution && window.mmAttribution()) || undefined,
    }),
  })
    .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
      if (!ok) {
        // A removed account: offer to restore it, then replay this same credential.
        if (d.deactivated) return offerReactivate(d.error, () => {
          pendingGoogleReactivate = true;
          onGoogleCredential(resp);
        });
        msg.textContent = d.error || 'Google sign-in failed.';
        msg.classList.add('error');
        return;
      }
      pendingGoogleReactivate = false;
      finishAuth(d.user);
    })
    .catch(() => { msg.textContent = 'Could not reach the server.'; msg.classList.add('error'); });
}
function initGoogle() {
  const el = document.getElementById('googleBtn');
  if (!el) return;
  const gid = window.MM_GOOGLE_CLIENT_ID || '';
  const ready = gid && !/YOUR_GOOGLE/i.test(gid) && window.google && google.accounts && google.accounts.id;
  if (!ready) {
    el.innerHTML =
      '<button type="button" class="btn outline full" disabled>Continue with Google</button>' +
      '<p class="auth-hint">Google sign-in activates once a Client ID is set.</p>';
    return;
  }
  google.accounts.id.initialize({ client_id: gid, callback: onGoogleCredential });
  google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'continue_with', width: 300 });
}
window.addEventListener('load', initGoogle);

render();
// Arrived from a reset email: go straight to choosing the new password.
const resetToken = params.get('reset');
if (resetToken) showResetStep(resetToken);
