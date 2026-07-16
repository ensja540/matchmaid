// Tiny client-side "session" for the mock: the logged-in user is kept in
// localStorage. A real app would use secure server-side sessions/cookies.
const KEY = 'matchmaid_user';

const Session = {
  get() {
    try {
      const user = JSON.parse(localStorage.getItem(KEY));
      // A real session is an object with an id and a role. Anything else — the
      // legacy { id: 'demo' } stub, or a half-written session from a signup that
      // needed email confirmation (no user returned) — is not a login: purge it
      // so the visitor is cleanly logged out the next time any page loads.
      if (!user || typeof user !== 'object' || !user.id || !user.role || user.id === 'demo') {
        localStorage.removeItem(KEY);
        return null;
      }
      return user;
    } catch {
      localStorage.removeItem(KEY);
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

  // In-page CTAs ("Log in", "Find a cleaner", "Create account") point at /login.
  // Once you're logged in those are wrong — send them to your portal, and rename
  // the plain "Log in" ones so nothing on the page still invites you to log in.
  const portalHref = Session.homeFor(user.role);
  const portalLabel = user.role === 'cleaner' ? 'Maid portal' : 'Customer portal';
  document.querySelectorAll('main a[href*="/login"]').forEach((el) => {
    const wasLogin = /log\s?in/i.test(el.textContent);
    el.href = portalHref;
    if (wasLogin) el.textContent = portalLabel;
  });

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
  portal.className = 'btn sm solid';
  portal.href = Session.homeFor(user.role);
  portal.textContent = user.role === 'cleaner' ? 'Maid portal' : 'Customer portal';
  bar.appendChild(out);
  bar.appendChild(portal);
}
if (document.readyState !== 'loading') reflectAuthNav();
else document.addEventListener('DOMContentLoaded', reflectAuthNav);
