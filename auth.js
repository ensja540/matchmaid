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

// A cleaner's share link carries their code: /login?role=maid&mode=signup&ref=XXXXXX
const refFromLink = (params.get('ref') || '').trim().toUpperCase();

function render() {
  const signup = mode === 'signup';
  // Make first-party identity explicit: this is Match Maid's own login, not a
  // page collecting credentials for any third party. Clear for users, and a
  // signal to Safe Browsing's social-engineering classifier.
  roleLabel.textContent = signup ? 'Create your Match Maid account' : 'Log in to Match Maid';
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
