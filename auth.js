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
  maid: 'List your services and get exclusive local enquiries. Free until your 5th match.',
  customer: 'Search local cleaners and see rates up front. Always free.',
};

roleLabel.textContent = LABEL[role];
blurb.textContent = BLURBS[role];

function render() {
  const signup = mode === 'signup';
  document.querySelectorAll('[data-signup-only]').forEach((el) => {
    el.style.display = signup ? '' : 'none';
  });
  submitBtn.textContent = signup ? 'Create account' : 'Log in';
  switchText.textContent = signup ? 'Already registered?' : 'New to Match Maid?';
  switchBtn.textContent = signup ? 'Log in instead' : 'Create an account';
  form.password.autocomplete = signup ? 'new-password' : 'current-password';
  msg.textContent = '';
  msg.className = 'auth-msg';
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
  if (mode === 'signup') body.fullName = form.fullName.value;

  try {
    const res = await fetch(mode === 'signup' ? '/api/register' : '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || 'Something went wrong.';
      msg.classList.add('error');
      return;
    }
    Session.set(data.user);
    msg.textContent = `Welcome, ${data.user.fullName}! Taking you to your ${
      data.user.role === 'cleaner' ? 'maid portal' : 'customer portal'
    }…`;
    msg.classList.add('ok');
    setTimeout(() => {
      location.href = Session.homeFor(data.user.role);
    }, 700);
  } catch {
    msg.textContent = 'Could not reach the server. Is it running?';
    msg.classList.add('error');
  }
});

render();
