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
    return role === 'cleaner' ? '/maid.html' : '/customer.html';
  },
  // Guard a page: ensure someone is logged in with the required role.
  require(role) {
    const user = Session.get();
    if (!user) {
      location.href = `/login.html?role=${role === 'cleaner' ? 'maid' : 'customer'}`;
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
