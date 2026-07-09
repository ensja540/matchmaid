// Login / signup for a single, fixed role (no toggle). The role comes from the
// page's ?role= query and does not change here; each side has its own page.
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

const LABEL = { maid: 'Maid account', customer: 'Customer account' };
const BLURBS = {
  maid: 'List your services and get exclusive local enquiries. Try it now for free while we build out our user base.',
  customer: 'Search local cleaners and see rates up front. Always free.',
};

roleLabel.textContent = LABEL[role];
blurb.textContent = BLURBS[role];

// A cleaner's share link carries their code: /login?role=maid&mode=signup&ref=XXXXXX
const refFromLink = (params.get('ref') || '').trim().toUpperCase();

function render() {
  const signup = mode === 'signup';
  document.querySelectorAll('[data-signup-only]').forEach((el) => {
    el.style.display = signup ? '' : 'none';
  });
  // Referrals are cleaner-to-cleaner, so the code field is maid-side only.
  document.querySelectorAll('[data-maid-only]').forEach((el) => {
    if (role !== 'maid') el.style.display = 'none';
  });
  if (signup && role === 'maid' && refFromLink && form.referralCode && !form.referralCode.value) {
    form.referralCode.value = refFromLink;
  }
  submitBtn.textContent = signup ? 'Create account' : 'Log in';
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
    if (role === 'maid') body.referralCode = form.referralCode?.value.trim() || refFromLink || undefined;
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

// ---- Sign in with Google (Google Identity Services) ----
// Set window.MM_GOOGLE_CLIENT_ID in login.html to your OAuth Web Client ID to
// activate this. Until then the button shows as "coming soon".
function onGoogleCredential(resp) {
  msg.className = 'auth-msg';
  msg.textContent = 'Signing you in with Google…';
  fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: resp.credential, role, reactivate: pendingGoogleReactivate }),
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
