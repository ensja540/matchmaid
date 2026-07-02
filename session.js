// Tiny client-side "session" for the mock: the logged-in user is kept in
// localStorage. A real app would use secure server-side sessions/cookies.
const KEY = 'matchmaid_user';

const Session = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(KEY));
    } catch {
      return null;
    }
  },
  set(user) {
    localStorage.setItem(KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(KEY);
  },
  // Redirect a role to its portal.
  homeFor(role) {
    return role === 'cleaner' ? '/maid' : '/customer';
  },
  // Guard a page: ensure someone is logged in with the required role.
  require(role) {
    const user = Session.get();
    if (!user) {
      location.href = `/login?role=${role === 'cleaner' ? 'maid' : 'customer'}`;
      return null;
    }
    if (user.role !== role) {
      location.href = Session.homeFor(user.role);
      return null;
    }
    return user;
  },
};

window.Session = Session;

// On the public pages (browse / pitch pages), reflect the logged-in state:
// swap the "Log in / Create account" controls for a portal link + log out,
// so you stay recognisably logged in as you move around the site.
function reflectAuthNav() {
  const user = Session.get();
  if (!user) return;
  const bar = document.querySelector('.pitch-top-right');
  if (!bar) return;
  bar.querySelectorAll('a[href*="/login"], #signupHook').forEach((el) => el.remove());
  const out = document.createElement('a');
  out.className = 'ulink';
  out.href = '#';
  out.textContent = 'Log out';
  out.addEventListener('click', (e) => {
    e.preventDefault();
    Session.clear();
    location.href = '/';
  });
  const portal = document.createElement('a');
  portal.className = 'btn sm';
  portal.href = Session.homeFor(user.role);
  portal.textContent = user.role === 'cleaner' ? 'My dashboard' : 'My account';
  bar.appendChild(out);
  bar.appendChild(portal);
}
if (document.readyState !== 'loading') reflectAuthNav();
else document.addEventListener('DOMContentLoaded', reflectAuthNav);
