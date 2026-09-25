// Is this the same person's mailbox wearing a different hat?
//
// Used in two places, for two different jobs:
//   * the self-referral guard, which must not be defeated by a "+1"
//   * the admin's fake-referral flags, which want to say "these three referred
//     customers all look like the cleaner's own address"
//
// Deliberately conservative. Normalising is evidence about a MAILBOX, not proof
// about a person - two colleagues really can share a domain - so the referral
// guard only blocks on an exact normalised match, and everything softer than
// that is surfaced to a human rather than acted on.
const DOT_INSENSITIVE = new Set(['gmail.com', 'googlemail.com']);

// Lowercase, drop any +tag, and drop dots only where the provider ignores them.
// "Vincent+test@Gmail.com" and "vin.cent@gmail.com" are the same inbox;
// "vincent+test@outlook.com" is too, but "vin.cent@outlook.com" is NOT, which
// is why the dot rule is per-domain rather than applied to everyone.
export function normaliseEmail(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 1) return s;
  let local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (DOT_INSENSITIVE.has(domain)) local = local.split('.').join('');
  return `${local}@${domain}`;
}

// The same inbox, however it was typed.
export const sameMailbox = (a, b) => {
  const na = normaliseEmail(a);
  return !!na && na === normaliseEmail(b);
};

// How alike two addresses look, for flagging only. Returns one of:
//   'same'    - the same mailbox once normalised
//   'close'   - same domain and one local part contains the other, or they
//               differ only by trailing digits ("jack1@x", "jack2@x")
//   'domain'  - same domain, nothing else in common
//   null      - unrelated
//
// Free mail domains are excluded from the bare 'domain' verdict: half the
// country is on gmail.com, and calling that a signal would flag everybody and
// therefore nobody.
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'yahoo.com', 'yahoo.co.nz', 'icloud.com', 'me.com', 'xtra.co.nz', 'proton.me',
  'protonmail.com', 'hotmail.co.nz', 'outlook.co.nz', 'msn.com',
]);

export function emailAffinity(a, b) {
  const na = normaliseEmail(a);
  const nb = normaliseEmail(b);
  if (!na || !nb) return null;
  if (na === nb) return 'same';
  const [la, da] = na.split('@');
  const [lb, db] = nb.split('@');
  if (da !== db) return null;
  const stripDigits = (x) => x.replace(/\d+$/, '');
  if (la.includes(lb) || lb.includes(la)) return 'close';
  if (stripDigits(la) && stripDigits(la) === stripDigits(lb)) return 'close';
  return FREE_MAIL.has(da) ? null : 'domain';
}
