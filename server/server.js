// Match Maid mock server: serves the static landing page and a small API
// backed by the real Postgres database (maid/customer signup + login, and
// the core cleaner search).
// deploy: v44 site feedback widget -> /admin (2026-07-08).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import {
  emailEnabled, makeCode, sendVerificationEmail, sendEnquiryEmail,
  sendVerificationDecisionEmail, sendVerificationPendingEmail,
  sendNudgeEmail, sendPreLaunchUpdateEmail, sendNewMessageEmail,
} from './email.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..'); // project root holds index.html etc.

const app = express();
app.use(express.json({ limit: '8mb' })); // room for base64 photos + ID documents

// The suburb-page hub. Registered ahead of express.static on purpose: static
// sees a directory and 301s /cleaners -> /cleaners/, which is a second URL for
// one page (and, before the hub existed, a redirect straight into a 404 - which
// is what Search Console started reporting). Serving it here keeps /cleaners a
// plain 200, the same shape as /browse and /for-maids.
app.get('/cleaners', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(join(publicDir, 'cleaners', 'index.html'));
});
// `extensions: ['html']` lets /customer serve customer.html — clean URLs.
// `no-cache` = always revalidate, so browsers/Cloudflare never serve a stale
// page or script (this is what caused "only works on hard refresh").
app.use(
  express.static(publicDir, {
    extensions: ['html'],
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

// Deliberately touches nothing — no DB, no auth — so the keep-alive ping that
// stops Render's free tier idling out is as cheap as a request can be.
app.get('/healthz', (_req, res) => res.type('text').send('ok'));

// --- Geo gate on signup ----------------------------------------------------
// Match Maid only operates in New Zealand, so accounts are only created from NZ
// IPs. Cloudflare sits in front of Render and stamps every request with the
// two-letter country in CF-IPCountry (needs "IP Geolocation" enabled in the
// Cloudflare dashboard under Network).
//
// Deliberately FAILS OPEN. If the header is missing - geolocation switched off,
// or someone reaching the Render origin directly rather than through Cloudflare
// - we let the signup through rather than locking every real user out. This is
// a spam speed bump, not a security control: any VPN defeats it in one click.
// Set GEO_BLOCK=off to disable (useful for testing from overseas).
const GEO_ALLOWED = new Set(['NZ']);
function geoBlockReason(req) {
  if (String(process.env.GEO_BLOCK || '').toLowerCase() === 'off') return null;
  const cc = String(req.headers['cf-ipcountry'] || '').toUpperCase();
  if (!cc) return null; // no Cloudflare header -> cannot tell -> allow
  if (cc === 'XX' || cc === 'T1') return null; // unknown / Tor -> allow
  if (GEO_ALLOWED.has(cc)) return null;
  return 'Match Maid is only available in New Zealand. If you are in NZ and seeing this, turn off your VPN and try again.';
}

// "maid" is the customer-facing word for a cleaner; the DB uses 'cleaner'.
const ROLE_MAP = { maid: 'cleaner', customer: 'client' };
// How each side is named to the person reading the error.
const SIDE_NAME = { cleaner: 'maid', client: 'hirer' };

// The clean types a customer picks exactly one of. Everything else in the
// catalogue is a flat-priced "extra". Must match DEMO.baseServiceSlugs.
const BASE_SERVICE_SLUGS = ['regular', 'deep', 'end-of-tenancy'];

// Capacity throttle: once a cleaner has this many active (accepted, not yet
// completed) jobs, they're treated as "at capacity" and drop below cleaners
// with spare capacity in search — so no single listing can hoard every request.
// A finite individual has a real ceiling; this makes everyone behave like one.
const CAPACITY_LIMIT = Number(process.env.CAPACITY_LIMIT) || 10;

// --- Referrals --------------------------------------------------------------
// A cleaner earns $10 of credit toward future payments for every cleaner they
// refer who goes on to become FULLY verified (ID + police + insurance). The
// referral row is created at signup; the credit is stamped on at verification.
const REFERRAL_CREDIT_CENTS = 1000;
// Ambiguous characters (0/O, 1/I/L) removed so a code survives being read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeReferralCode = () =>
  Array.from(randomBytes(6), (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');

async function ensureReferralCode(cleanerId) {
  const { rows } = await query('select referral_code from cleaner_profiles where id = $1', [cleanerId]);
  if (rows[0]?.referral_code) return rows[0].referral_code;
  for (let i = 0; i < 10; i++) {
    const code = makeReferralCode();
    try {
      await query('update cleaner_profiles set referral_code = $2 where id = $1', [cleanerId, code]);
      return code;
    } catch (err) {
      if (err.code !== '23505') throw err; // collision — retry
    }
  }
  return null;
}

// Record who referred a brand-new cleaner. Silently does nothing on an unknown
// or self-referring code: a typo must never cost someone their signup.
async function linkReferral(newCleanerId, code) {
  const clean = String(code).trim().toUpperCase();
  if (!clean) return;
  const { rows } = await query('select id from cleaner_profiles where referral_code = $1', [clean]);
  const referrer = rows[0]?.id;
  if (!referrer || referrer === newCleanerId) return;
  try {
    await query(
      'insert into referrals (referrer_cleaner_id, referred_cleaner_id) values ($1, $2)',
      [referrer, newCleanerId]
    );
  } catch (err) {
    if (err.code !== '23505') throw err; // already referred — leave the first one
  }
}

// Idempotent: the credit is only stamped when credited_at is still null, so
// nothing can pay twice however often this runs.
//
// The credit is earned when the person you referred has held a PAID plan for at
// least a month - not when they verify their ID, which is what it used to be.
//
// The distinction that matters: a paid month is revenue, an ID check is not. The
// old rule paid out on a signal anyone could produce in five minutes, which is
// fine as a growth hack and wrong as a commission.
//
// "A paid contract for a minimum period of one month" is read strictly:
//   - a real tier, not 'none'
//   - status 'active' or 'past_due' (past_due is a failed charge on a live
//     contract, not a cancellation - they are still on the hook for the month)
//   - trialing does NOT count; a trial is not a paid contract
//   - the paid period must have STARTED at least a month ago, and if they have
//     since cancelled, the cancellation must be at least a month after it began.
//     Signing up and cancelling inside the month earns nothing.
const REFERRAL_QUALIFY_SQL = `
  exists (
    select 1 from subscriptions sub
     where sub.cleaner_id = r.referred_cleaner_id
       and sub.tier <> 'none'
       and sub.status in ('active','past_due')
       and coalesce(sub.current_period_start, sub.created_at) <= now() - interval '1 month'
       and (sub.cancelled_at is null
            or sub.cancelled_at >= coalesce(sub.current_period_start, sub.created_at) + interval '1 month')
  )`;

// Award any referral this cleaner has earned. Safe to call repeatedly - the
// `credited_at is null` guard means a credit is only ever stamped once.
async function awardReferralIfQualified(cleanerId) {
  await query(
    `update referrals r set credit_cents = $2, credited_at = now()
      where r.referred_cleaner_id = $1 and r.credited_at is null and ${REFERRAL_QUALIFY_SQL}`,
    [cleanerId, REFERRAL_CREDIT_CENTS]
  );
}

// Sweep every uncredited referral. Nothing in the app creates a subscription
// yet, so today this awards nothing and that is correct - it starts paying out
// by itself the moment paid plans are real, rather than needing to be
// remembered and wired up then.
async function sweepReferralCredits() {
  const { rowCount } = await query(
    `update referrals r set credit_cents = $1, credited_at = now()
      where r.credited_at is null and ${REFERRAL_QUALIFY_SQL}`,
    [REFERRAL_CREDIT_CENTS]
  );
  return rowCount;
}

// A removed account keeps every row it owns — enquiries, threads, reviews all
// stay put for the other party — but cannot be used until the owner reactivates.
// users.status is the single source of truth; the public directory filters on it.
const REMOVED = 'removed';
// Closing an account starts a cooling-off period before it can come back.
const REACTIVATE_COOLDOWN_MONTHS = 2;
function reactivateReadyDate(removedAt) {
  const d = new Date(removedAt);
  d.setMonth(d.getMonth() + REACTIVATE_COOLDOWN_MONTHS);
  return d;
}

// Call only once credentials are verified, so we never leak account state to a
// stranger. Returns an error body to send, or null to let the sign-in proceed.
async function gateRemoved(user, reactivate) {
  if (user.status !== REMOVED) return null;
  // The cooling-off period applies to cleaners only — customers can close and
  // rejoin freely. removed_at can be null for accounts closed before this
  // shipped, which also keeps the old immediate-reactivation behaviour.
  const { rows } = await query('select removed_at from users where id = $1', [user.id]);
  const removedAt = rows[0]?.removed_at ? new Date(rows[0].removed_at) : null;
  if (user.role === 'cleaner' && removedAt) {
    const readyAt = reactivateReadyDate(removedAt);
    if (Date.now() < readyAt.getTime()) {
      return {
        error: `This account was closed and is in a ${REACTIVATE_COOLDOWN_MONTHS}-month cooling-off period. You can reactivate it from ${readyAt.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
        cooldown: true,
        reactivateAfter: readyAt.toISOString(),
      };
    }
  }
  if (!reactivate)
    return {
      error: 'This profile was removed. Reactivate it to get your account and data back.',
      deactivated: true,
    };
  await query("update users set status = 'active', removed_at = null, updated_at = now() where id = $1", [user.id]);
  user.status = 'active';
  return null;
}

// First-touch attribution off the signup call. Client-supplied, so it is
// clamped rather than trusted: five short strings, lowercased where they are
// grouped on. Missing or unusable -> all nulls, which the dashboard reports as
// "unknown". Never defaulted to 'direct': an untagged campaign would then be
// silently credited to a channel it had nothing to do with.
function cleanAttribution(a) {
  const NONE = { source: null, medium: null, campaign: null, referrer: null, landing: null };
  if (!a || typeof a !== 'object') return NONE;
  const str = (v, max, lower) => {
    if (typeof v !== 'string') return null;
    const s = v.trim().slice(0, max);
    if (!s) return null;
    return lower ? s.toLowerCase() : s;
  };
  const source = str(a.source, 80, true);
  if (!source) return NONE; // medium/campaign are meaningless without it
  return {
    source,
    medium: str(a.medium, 80, true),
    campaign: str(a.campaign, 120, true),
    referrer: str(a.referrer, 300, false),
    landing: str(a.landing, 200, false),
  };
}

// Shared slot model (must match the front end).
// Days: 0=Mon … 6=Sun. Three slots per day.
const SLOT_START = { morning: '08:00', afternoon: '12:00', evening: '17:00' };
const SLOT_END = { morning: '12:00', afternoon: '17:00', evening: '21:00' };
const START_TO_SLOT = { '08:00': 'morning', '12:00': 'afternoon', '17:00': 'evening' };

// --- Auth: register ---------------------------------------------------------
app.post('/api/register', async (req, res) => {
  try {
    const geo = geoBlockReason(req);
    if (geo) return res.status(403).json({ error: geo });

    const { role, fullName, email, password, referralCode, attribution } = req.body ?? {};
    const dbRole = ROLE_MAP[role];
    if (!dbRole) return res.status(400).json({ error: 'Choose maid or customer.' });
    if (!fullName || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are all required.' });

    const password_hash = await bcrypt.hash(password, 10);

    // Email confirmation is a hard gate — but only when email actually works.
    // With no provider configured the code could never arrive, so we skip the
    // gate entirely and sign them straight in (the pre-email behaviour).
    const gateOn = emailEnabled();
    const code = gateOn ? makeCode() : null;
    const acq = cleanAttribution(attribution);
    const { rows } = await query(
      `insert into users (email, role, full_name, password_hash, email_verified, verify_code, verify_expires,
                          acq_source, acq_medium, acq_campaign, acq_referrer, acq_landing)
       values ($1, $2, $3, $4, $5, $6, ${gateOn ? "now() + interval '15 minutes'" : 'null'}, $7, $8, $9, $10, $11)
       returning id, role, full_name, email`,
      [email.toLowerCase().trim(), dbRole, fullName.trim(), password_hash, !gateOn, code,
       acq.source, acq.medium, acq.campaign, acq.referrer, acq.landing]
    );
    const user = rows[0];

    // Give them the matching empty profile so the rest of the app is coherent.
    if (dbRole === 'cleaner') {
      const cp = await query('insert into cleaner_profiles (user_id) values ($1) returning id', [user.id]);
      const cleanerId = cp.rows[0].id;
      await ensureReferralCode(cleanerId);
      // A bad or unknown code must never block a signup — it just earns nobody.
      if (referralCode) await linkReferral(cleanerId, referralCode);
    } else {
      await query('insert into client_profiles (user_id) values ($1)', [user.id]);
    }

    if (gateOn) {
      // Only hold the account for a code if the email actually went out. If the
      // send fails (e.g. the Resend domain isn't verified yet), don't strand
      // them at a code screen with no code — confirm and sign them straight in.
      const sent = await sendVerificationEmail({ to: user.email, name: user.full_name, code });
      if (sent && sent.ok) {
        return res.status(201).json({ needsVerification: true, userId: user.id, email: user.email });
      }
      await query(
        'update users set email_verified = true, verify_code = null, verify_expires = null where id = $1',
        [user.id]
      );
      return res.status(201).json({ user: publicUser({ ...user, email_verified: true }) });
    }
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    // Unique is on (email, role), so this only fires for the side they asked
    // for. The same address is still free to register on the other side.
    if (err.code === '23505')
      return res.status(409).json({
        error: `That email already has a ${SIDE_NAME[ROLE_MAP[req.body?.role]] || 'Match Maid'} account. Log in instead.`,
      });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

// --- Auth: confirm email with a code ---------------------------------------
// Issue a fresh code + expiry to a user and email it. Shared by resend and by
// login when it meets an unverified account.
async function issueVerificationCode(user) {
  const code = makeCode();
  await query(
    "update users set verify_code = $2, verify_expires = now() + interval '15 minutes', updated_at = now() where id = $1",
    [user.id, code]
  );
  return sendVerificationEmail({ to: user.email, name: user.full_name, code });
}

app.post('/api/verify-email', async (req, res) => {
  try {
    const { userId, code } = req.body ?? {};
    if (!userId || !code) return res.status(400).json({ error: 'Enter the code we emailed you.' });
    const { rows } = await query(
      'select id, role, full_name, email, email_verified, verify_code, verify_expires from users where id = $1',
      [userId]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (user.email_verified) return res.json({ user: publicUser(user) }); // already done — let them in
    if (!user.verify_code || !user.verify_expires || new Date(user.verify_expires) < new Date())
      return res.status(400).json({ error: 'That code has expired. Send a new one.', expired: true });
    if (String(code).trim() !== String(user.verify_code))
      return res.status(400).json({ error: "That code doesn't match. Check it and try again." });

    await query(
      'update users set email_verified = true, verify_code = null, verify_expires = null, updated_at = now() where id = $1',
      [user.id]
    );
    await ensureProfile(user.id, user.role);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not confirm your email. Try again.' });
  }
});

app.post('/api/resend-code', async (req, res) => {
  try {
    const { userId } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const { rows } = await query('select id, full_name, email, email_verified from users where id = $1', [userId]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (user.email_verified) return res.json({ ok: true, alreadyVerified: true });
    await issueVerificationCode(user);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not resend the code. Try again.' });
  }
});

// --- Auth: login ------------------------------------------------------------
// The two sides are separate accounts. An account is an (email, role) pair, so
// we authenticate on email + role + password: a maid login never reaches the
// hirer portal, even from the same address. The same person may hold both, but
// they are two accounts with two passwords and two sets of data.
//
// A safety net for rows predating the split; registration already makes the
// profile. It only ever provisions the account's OWN side.
async function ensureProfile(userId, dbRole) {
  const table = dbRole === 'cleaner' ? 'cleaner_profiles' : 'client_profiles';
  const { rows } = await query(`select 1 from ${table} where user_id = $1`, [userId]);
  if (!rows.length) await query(`insert into ${table} (user_id) values ($1)`, [userId]);
}

app.post('/api/login', async (req, res) => {
  try {
    const { role, email, password, reactivate } = req.body ?? {};
    const dbRole = ROLE_MAP[role];
    if (!dbRole) return res.status(400).json({ error: 'Choose maid or customer.' });
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const { rows } = await query(
      'select id, role, full_name, email, password_hash, status, email_verified from users where email = $1 and role = $2',
      [email.toLowerCase().trim(), dbRole]
    );
    const user = rows[0];
    const ok = user && user.password_hash && (await bcrypt.compare(password, user.password_hash));
    // Deliberately the same message whether the address is unknown, the password
    // is wrong, or the account exists only on the other side: naming which would
    // tell a stranger that this person cleans for a living.
    if (!ok) return res.status(401).json({ error: 'Wrong email or password.' });

    const gate = await gateRemoved(user, reactivate);
    if (gate) return res.status(403).json(gate);

    // An account that signed up but never confirmed its email can't log in until
    // it does. Reissue a fresh code and hand the client the verify step — but
    // only if the code actually sends. If it can't (unverified domain), confirm
    // the account rather than lock the owner out of their own login.
    if (emailEnabled() && !user.email_verified) {
      const sent = await issueVerificationCode(user);
      if (sent && sent.ok) {
        return res.status(403).json({ needsVerification: true, userId: user.id, email: user.email });
      }
      await query(
        'update users set email_verified = true, verify_code = null, verify_expires = null where id = $1',
        [user.id]
      );
    }

    await ensureProfile(user.id, user.role);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

// --- Auth: Sign in with Google ---------------------------------------------
// The client sends the Google ID-token ("credential"); we verify it with
// Google's tokeninfo endpoint, then find-or-create the user by email AND role.
// Matching on email alone would hand a maid's account to whoever signed in from
// the hirer page with the same address.
// Requires GOOGLE_CLIENT_ID in the environment to be enforced (recommended).
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, role, reactivate, attribution } = req.body ?? {};
    const dbRole = ROLE_MAP[role] || 'client';
    if (!credential) return res.status(400).json({ error: 'Missing Google credential.' });

    const info = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential)
    ).then((r) => (r.ok ? r.json() : null));

    if (!info || !info.email || info.email_verified !== 'true')
      return res.status(401).json({ error: 'Google sign-in could not be verified.' });
    if (process.env.GOOGLE_CLIENT_ID && info.aud !== process.env.GOOGLE_CLIENT_ID)
      return res.status(401).json({ error: 'This Google sign-in is not configured for Match Maid.' });

    const email = String(info.email).toLowerCase().trim();
    let { rows } = await query(
      'select id, role, full_name, email, status from users where email = $1 and role = $2',
      [email, dbRole]
    );
    let user = rows[0];
    if (!user) {
      // Creating an account, so the NZ-only gate applies. Existing users fall
      // through to the else branch and can still sign in from anywhere - we
      // only block new signups, not travelling customers.
      const geo = geoBlockReason(req);
      if (geo) return res.status(403).json({ error: geo });
      // No account on THIS side yet. One on the other side is irrelevant: the
      // unique index is on (email, role), so this insert stands on its own.
      // No password login for Google accounts — store an unusable random hash.
      const hash = await bcrypt.hash('google-' + credential.slice(0, 24) + Date.now(), 10);
      // Google already verified this address, so the account is confirmed on
      // creation — no code step for Google sign-ups.
      // Only on creation: an existing user keeps whatever first touch they were
      // recorded with, so signing in again never rewrites their origin.
      const gacq = cleanAttribution(attribution);
      ({ rows } = await query(
        `insert into users (email, role, full_name, password_hash, email_verified,
                            acq_source, acq_medium, acq_campaign, acq_referrer, acq_landing)
         values ($1, $2, $3, $4, true, $5, $6, $7, $8, $9) returning id, role, full_name, email`,
        [email, dbRole, info.name || email.split('@')[0], hash,
         gacq.source, gacq.medium, gacq.campaign, gacq.referrer, gacq.landing]
      ));
      user = rows[0];
    } else {
      const gate = await gateRemoved(user, reactivate);
      if (gate) return res.status(403).json(gate);
    }
    await ensureProfile(user.id, user.role);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Google sign-in failed. Please try again.' });
  }
});

// A cleaner's referral code, credit balance, and who they've brought in.
app.get('/api/referrals', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const cleanerId = await cleanerIdForUser(userId);
    if (!cleanerId) return res.status(404).json({ error: 'No cleaner profile for that user.' });

    const code = await ensureReferralCode(cleanerId);
    const { rows } = await query(
      `select r.credited_at, r.credit_cents,
              coalesce(nullif(cp.business_name, ''), u.full_name) as name,
              cp.id_verified as id_verified
         from referrals r
         join cleaner_profiles cp on cp.id = r.referred_cleaner_id
         join users u on u.id = cp.user_id
        where r.referrer_cleaner_id = $1
        order by r.created_at desc`,
      [cleanerId]
    );

    const creditCents = rows.reduce((a, r) => a + (r.credit_cents || 0), 0);
    res.json({
      code,
      creditCents,
      creditDollars: creditCents / 100,
      perReferralDollars: REFERRAL_CREDIT_CENTS / 100,
      earned: rows.filter((r) => r.credited_at).length,
      pending: rows.filter((r) => !r.credited_at).length,
      referrals: rows.map((r) => ({
        name: r.name,
        idVerified: !!r.id_verified,
        credited: !!r.credited_at,
        creditDollars: (r.credit_cents || 0) / 100,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load your referrals.' });
  }
});

// --- Account: pause / resume listing ----------------------------------------
// Pausing hides a cleaner from browse, search and match without touching their
// account, threads or reviews. listing_status already has a 'paused' value and
// every public query filters on 'active', so this is the whole mechanism.
// Resuming puts them back to 'active'; a cleaner who never published stays draft.
app.post('/api/profile/pause', async (req, res) => {
  try {
    const { userId, paused } = req.body ?? {};
    if (!userId || typeof paused !== 'boolean')
      return res.status(400).json({ error: 'userId and paused (true/false) are required.' });
    const cleanerId = await cleanerIdForUser(userId);
    if (!cleanerId) return res.status(404).json({ error: 'No cleaner profile for that user.' });

    const { rows } = await query(
      `update cleaner_profiles
          set listing_status = $2::listing_status, updated_at = now()
        where id = $1
      returning listing_status`,
      [cleanerId, paused ? 'paused' : 'active']
    );
    res.json({ ok: true, listingStatus: rows[0].listing_status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update your listing.' });
  }
});

// --- Account: remove profile (soft) -----------------------------------------
// Never a hard delete: enquiries, conversations, messages, bookings and reviews
// all reference the profile, and the other party should keep their history.
// Flipping users.status pulls the listing out of the directory immediately;
// signing back in with { reactivate: true } restores the account untouched.
app.post('/api/profile/remove', async (req, res) => {
  try {
    const { userId } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const { rowCount } = await query(
      `update users set status = $2, removed_at = now(), updated_at = now() where id = $1 and status <> $2`,
      [userId, REMOVED]
    );
    if (!rowCount) return res.status(404).json({ error: 'No active account for that user.' });
    // Tell the client when they'll be able to reactivate, so the confirmation
    // message can be specific.
    res.json({ ok: true, reactivateAfter: reactivateReadyDate(new Date()).toISOString(), cooldownMonths: REACTIVATE_COOLDOWN_MONTHS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not remove the profile.' });
  }
});

// --- Directory data (used later by the search screen) -----------------------
// Region comes back too: nationwide, suburb names repeat (Richmond, Bishopdale
// and Hillsborough all exist in more than one region), so the picker groups by
// region and callers should send the id rather than the bare name.
app.get('/api/suburbs', async (_req, res) => {
  // lat/lng ride along so the radius picker can show "covers 34 suburbs" as the
  // circle is dragged, without a round trip per pixel. The server recomputes the
  // same set on save - this copy is only for display.
  const { rows } = await query(
    'select id, name, region, territorial_authority, lat, lng from suburbs order by region, name'
  );
  res.json(rows.map((r) => ({ ...r, lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng) })));
});

// Suburbs whose centre falls inside a circle. Haversine in SQL: 1,688 rows is
// far too few to justify PostGIS.
const RADIUS_SQL = `6371 * acos(least(1,
  cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2))
  + sin(radians($1)) * sin(radians(lat))))`;
async function suburbsWithin(lat, lng, km, excluded = []) {
  const { rows } = await query(
    `select id from suburbs where lat is not null and ${RADIUS_SQL} <= $3`,
    [lat, lng, km]
  );
  const off = new Set(excluded.map(Number));
  return rows.map((r) => r.id).filter((id) => !off.has(id));
}

// Resolve a suburb to its id. Prefer an explicit id from the client: with the
// nationwide list a bare name is ambiguous (four Richmonds), and the old
// `where name = $1 limit 1` would silently attach someone to another region's
// suburb of the same name. Name lookup stays as a fallback for older callers.
async function resolveSuburbId(suburbId, name) {
  const id = Number(suburbId);
  if (Number.isInteger(id) && id > 0) {
    const byId = await query('select id from suburbs where id = $1', [id]);
    if (byId.rows[0]) return byId.rows[0].id;
  }
  if (!name) return null;
  const byName = await query('select id from suburbs where name = $1 order by id limit 1', [name]);
  return byName.rows[0]?.id ?? null;
}

app.get('/api/services', async (_req, res) => {
  const { rows } = await query('select id, name, slug from service_types order by name');
  res.json(rows);
});

// Core search, driven by queries/search_cleaners.sql (named params swapped for $1/$2).
app.get('/api/cleaners', async (req, res) => {
  try {
    const { suburb, service } = req.query;
    if (!suburb || !service)
      return res.status(400).json({ error: 'Pick a suburb and a service.' });

    let sql = await readFile(join(here, 'queries', 'search_cleaners.sql'), 'utf8');
    sql = sql.replace(/:suburb/g, '$1').replace(/:service/g, '$2').replace(/:capacity/g, '$3');
    const { rows } = await query(sql, [suburb, service, CAPACITY_LIMIT]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed.' });
  }
});

// The hourly rates of every active cleaner covering a suburb + service, so the
// search slider can show where the actual supply of cleaners sits on the price
// scale. Just the numbers — the client buckets them into a histogram.
app.get('/api/cleaner-rates', async (req, res) => {
  try {
    const { suburb, suburbs, service } = req.query;
    // Accept a single suburb or a comma-separated list (a whole-city search).
    const subList = suburbs
      ? String(suburbs).split(',').map((s) => s.trim()).filter(Boolean)
      : suburb ? [suburb] : [];
    if (!subList.length || !service) return res.status(400).json({ error: 'Pick a suburb and a service.' });
    const { rows } = await query(
      // distinct on the cleaner: covering several of the listed suburbs must not
      // count their rate more than once in the histogram.
      `select distinct cp.id, cp.hourly_rate as rate
         from cleaner_profiles cp
         join cleaner_service_areas csa on csa.cleaner_id = cp.id
         join suburbs s on s.id = csa.suburb_id
         join cleaner_services cs on cs.cleaner_id = cp.id
         join service_types st on st.id = cs.service_type_id
        where cp.listing_status = 'active'
          and s.name = any($1) and st.slug = $2 and cp.hourly_rate is not null`,
      [subList, service]
    );
    res.json({ rates: rows.map((r) => Number(r.rate)).filter((n) => Number.isFinite(n)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load rates.' });
  }
});

// --- Cleaner availability -------------------------------------------------
// The maid's weekly grid of AM/Lunch/PM slots, stored in availability_rules.
async function cleanerIdForUser(userId) {
  const { rows } = await query('select id from cleaner_profiles where user_id = $1', [userId]);
  return rows[0]?.id ?? null;
}

app.get('/api/availability', async (req, res) => {
  try {
    const cleanerId = await cleanerIdForUser(req.query.userId);
    if (!cleanerId) return res.status(404).json({ error: 'No cleaner profile for that user.' });
    const { rows } = await query(
      `select day_of_week, to_char(start_time,'HH24:MI') as start
         from availability_rules where cleaner_id = $1`,
      [cleanerId]
    );
    const slots = rows
      .map((r) => ({ day: r.day_of_week, slot: START_TO_SLOT[r.start] }))
      .filter((s) => s.slot);
    res.json({ slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load availability.' });
  }
});

app.put('/api/availability', async (req, res) => {
  try {
    const { userId, slots } = req.body ?? {};
    if (!userId || !Array.isArray(slots))
      return res.status(400).json({ error: 'userId and slots[] are required.' });
    const cleanerId = await cleanerIdForUser(userId);
    if (!cleanerId) return res.status(404).json({ error: 'No cleaner profile for that user.' });

    // Replace the whole grid each save: simplest and matches the UI.
    await query('delete from availability_rules where cleaner_id = $1', [cleanerId]);
    let saved = 0;
    for (const s of slots) {
      const start = SLOT_START[s?.slot];
      if (start == null || s.day == null || s.day < 0 || s.day > 6) continue;
      await query(
        `insert into availability_rules (cleaner_id, day_of_week, start_time, end_time)
         values ($1, $2, $3, $4)`,
        [cleanerId, s.day, start, SLOT_END[s.slot]]
      );
      saved++;
    }
    res.json({ ok: true, saved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save availability.' });
  }
});

// --- Cleaner profile (load + save for real) --------------------------------
app.get('/api/profile', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const { rows } = await query(
      `select cp.id, cp.business_name, cp.bio, cp.years_experience, cp.listing_status,
              cp.hourly_rate, cp.hourly_rate_min, cp.hourly_rate_max,
              cp.avg_rating, cp.review_count, cp.addons,
              cp.id_verified, cp.police_verified, cp.insurance_verified,
              cp.brings_products, cp.profile_photo_url, cp.service_surcharges,
              cp.residential_address, cp.clean_rates,
              cp.service_lat, cp.service_lng, cp.service_radius_km, cp.service_excluded,
              u.full_name, u.email
         from cleaner_profiles cp join users u on u.id = cp.user_id
        where cp.user_id = $1`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'No cleaner profile for that user.' });
    const cp = rows[0];
    const svc = await query(
      `select st.slug from cleaner_services cs join service_types st on st.id = cs.service_type_id where cs.cleaner_id = $1`,
      [cp.id]
    );
    // Ids as well as names: the maid's own editor sends ids back, so a suburb
    // whose name exists in several regions (Richmond, Bishopdale) resolves to
    // the exact one they picked rather than the first row that matches by name.
    const areas = await query(
      `select s.id, s.name, s.region from cleaner_service_areas csa join suburbs s on s.id = csa.suburb_id where csa.cleaner_id = $1`,
      [cp.id]
    );
    res.json({
      businessName: cp.business_name,
      bio: cp.bio,
      years: cp.years_experience,
      listingStatus: cp.listing_status,
      rateMin: cp.hourly_rate_min != null ? Number(cp.hourly_rate_min) : null,
      rateMax: cp.hourly_rate_max != null ? Number(cp.hourly_rate_max) : null,
      avgRating: Number(cp.avg_rating) || 0,
      reviews: cp.review_count || 0,
      badges: { id: cp.id_verified, police: cp.police_verified, insurance: cp.insurance_verified },
      bringsProducts: !!cp.brings_products,
      photo: cp.profile_photo_url || '',
      serviceSurcharges: Array.isArray(cp.service_surcharges) ? cp.service_surcharges : [],
      services: svc.rows.map((r) => r.slug),
      addons: Array.isArray(cp.addons) ? cp.addons : [],
      areas: areas.rows.map((r) => ({ id: r.id, name: r.name, region: r.region })),
      fullName: cp.full_name,
      email: cp.email,
      residentialAddress: cp.residential_address || '',
      cleanRates: cp.clean_rates && typeof cp.clean_rates === 'object' ? cp.clean_rates : {},
      // The service-area circle, so the map reopens where they left it.
      serviceCenter: cp.service_lat != null ? { lat: Number(cp.service_lat), lng: Number(cp.service_lng) } : null,
      serviceRadiusKm: cp.service_radius_km != null ? Number(cp.service_radius_km) : null,
      serviceExcluded: Array.isArray(cp.service_excluded) ? cp.service_excluded : [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load profile.' });
  }
});

app.put('/api/profile', async (req, res) => {
  try {
    const { userId, businessName, bio, years, rate, rateMin, rateMax, services, addons, areas, badges, listingStatus, bringsProducts, photo, serviceSurcharges, cleanRates, bondGuaranteed, endOfLease, productsOption, payments, residentialAddress, fullName, serviceCenter, serviceRadiusKm, serviceExcluded } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const cleanerId = await cleanerIdForUser(userId);
    if (!cleanerId) return res.status(404).json({ error: 'No cleaner profile for that user.' });

    // The service-area circle. Validated here rather than trusted: a bad centre
    // or a 5,000km radius would quietly put the cleaner in every search in the
    // country. NZ's bounding box, and a radius capped at a plausible commute.
    let circle = null;
    if (serviceCenter && Number.isFinite(+serviceCenter.lat) && Number.isFinite(+serviceCenter.lng) && Number.isFinite(+serviceRadiusKm)) {
      const lat = +serviceCenter.lat, lng = +serviceCenter.lng;
      const km = Math.min(200, Math.max(1, +serviceRadiusKm));
      if (lat <= -33 && lat >= -48 && lng >= 165 && lng <= 180) circle = { lat, lng, km };
    }
    // Sent a circle that didn't validate? Stop here. Falling through would apply
    // the `areas` list the browser derived from that same bad circle, which is
    // how a stray drag turns into "all my suburbs vanished".
    if (serviceCenter && !circle) {
      return res.status(400).json({ error: 'That service area is outside New Zealand.' });
    }
    // Suburbs crossed off inside that circle. Capped: this is a hand-made list,
    // and anything longer is a bug or someone poking the endpoint.
    const excluded = Array.isArray(serviceExcluded)
      ? [...new Set(serviceExcluded.map(Number).filter(Number.isInteger))].slice(0, 500)
      : null;

    // Per-clean-type fee model: regular and deep, both hourly. End-of-lease and
    // its bond-back guarantee are capabilities of the deep clean, stored as
    // booleans in the same JSON (not fees), so they never pollute the rate band.
    let cleanRatesClean = null;
    const hourlyFeeVals = [];
    if (cleanRates && typeof cleanRates === 'object') {
      cleanRatesClean = {};
      for (const slug of BASE_SERVICE_SLUGS) {
        const v = Math.max(0, Math.round(Number(cleanRates[slug]) || 0));
        if (v > 0) { cleanRatesClean[slug] = v; hourlyFeeVals.push(v); }
      }
      if (endOfLease) cleanRatesClean.endOfLease = true;
      if (endOfLease && bondGuaranteed) cleanRatesClean.bondGuaranteed = true;
      if (['own', 'supplied', 'either'].includes(productsOption)) cleanRatesClean.productsOption = productsOption;
      if (Array.isArray(payments)) cleanRatesClean.payments = payments.filter((p) => ['bank', 'cash'].includes(p));
    }
    const feeVals = hourlyFeeVals;

    // Priced extras: keep only well-formed { slug, price } rows with a sane price.
    const cleanAddons = Array.isArray(addons)
      ? addons
          .filter((a) => a && typeof a.slug === 'string' && a.slug)
          .map((a) => ({ slug: a.slug, price: Math.max(0, Math.round(Number(a.price) || 0)) }))
          .slice(0, 30)
      : null;

    // Per-hour surcharge on specialist cleans. Only the base clean types can
    // carry one, and a zero is the same as not charging — drop it rather than
    // storing a noisy "+$0/hr" the customer would see.
    const cleanSurcharges = Array.isArray(serviceSurcharges)
      ? serviceSurcharges
          .filter((s) => s && BASE_SERVICE_SLUGS.includes(s.slug))
          .map((s) => ({ slug: s.slug, extra: Math.max(0, Math.round(Number(s.extra) || 0)) }))
          .filter((s) => s.extra > 0)
          .slice(0, BASE_SERVICE_SLUGS.length)
      : null;

    // The per-type fees define the headline rate band (min/max/mid) so search,
    // match and display keep working off the existing columns. Falls back to the
    // legacy single-rate / min-max inputs when no fees are sent.
    const single = rate != null && rate !== '' ? Number(rate) : null;
    let min, max, mid;
    if (feeVals.length) {
      min = Math.min(...feeVals);
      max = Math.max(...feeVals);
      mid = cleanRatesClean.regular != null ? cleanRatesClean.regular : Math.round((min + max) / 2);
    } else {
      min = single != null ? single : rateMin != null && rateMin !== '' ? Number(rateMin) : null;
      max = single != null ? single : rateMax != null && rateMax !== '' ? Number(rateMax) : null;
      mid = single != null ? single : min != null && max != null ? (min + max) / 2 : min ?? max ?? null;
    }

    // Note: verified badges are NOT set here — they're earned by submitting a
    // document (see /api/verification) and being approved, not self-claimed.
    // coalesce the rate: a partial save that doesn't resend it must not wipe it.
    await query(
      `update cleaner_profiles set
         business_name = $2, bio = $3, years_experience = $4,
         hourly_rate_min = coalesce($5, hourly_rate_min),
         hourly_rate_max = coalesce($6, hourly_rate_max),
         hourly_rate     = coalesce($7, hourly_rate),
         listing_status = coalesce($8, listing_status),
         addons = coalesce($9, addons),
         brings_products = coalesce($10, brings_products),
         profile_photo_url = case when $11::text is null then profile_photo_url
                                  when $11 = '' then null else $11 end,
         service_surcharges = coalesce($12, service_surcharges),
         residential_address = coalesce($13, residential_address),
         clean_rates = coalesce($14, clean_rates),
         service_lat = coalesce($15, service_lat),
         service_lng = coalesce($16, service_lng),
         service_radius_km = coalesce($17, service_radius_km),
         service_excluded = coalesce($18, service_excluded), updated_at = now()
       where id = $1`,
      [
        cleanerId, businessName ?? null, bio ?? null, Number.isFinite(+years) ? +years : null,
        min, max, mid, listingStatus ?? null,
        cleanAddons != null ? JSON.stringify(cleanAddons) : null,
        typeof bringsProducts === 'boolean' ? bringsProducts : null,
        photo === undefined ? null : photo, // '' clears the photo; null leaves it
        cleanSurcharges != null ? JSON.stringify(cleanSurcharges) : null,
        typeof residentialAddress === 'string' ? residentialAddress.slice(0, 300) : null,
        cleanRatesClean != null ? JSON.stringify(cleanRatesClean) : null,
        circle?.lat ?? null, circle?.lng ?? null, circle?.km ?? null,
        excluded != null ? JSON.stringify(excluded) : null,
      ]
    );

    // The legal name lives on the account (users.full_name); let the maid confirm
    // or correct it here so it matches their verification documents.
    if (typeof fullName === 'string' && fullName.trim()) {
      await query('update users set full_name = $2, updated_at = now() where id = $1', [userId, fullName.trim().slice(0, 120)]);
    }

    if (Array.isArray(services)) {
      await query('delete from cleaner_services where cleaner_id = $1', [cleanerId]);
      for (const slug of services) {
        await query(
          `insert into cleaner_services (cleaner_id, service_type_id)
           select $1, id from service_types where slug = $2 on conflict do nothing`,
          [cleanerId, slug]
        );
      }
    }
    // A circle defines the areas: resolve it here rather than trusting the list
    // the browser worked out, so the saved suburbs always match the saved circle.
    if (circle) {
      const ids = await suburbsWithin(circle.lat, circle.lng, circle.km, excluded ?? []);
      await query('delete from cleaner_service_areas where cleaner_id = $1', [cleanerId]);
      if (ids.length) {
        await query(
          `insert into cleaner_service_areas (cleaner_id, suburb_id)
           select $1, unnest($2::int[]) on conflict do nothing`,
          [cleanerId, ids]
        );
      }
    } else if (Array.isArray(areas)) {
      await query('delete from cleaner_service_areas where cleaner_id = $1', [cleanerId]);
      // Areas may arrive as ids (current client) or names (older callers).
      for (const area of areas) {
        const areaId = await resolveSuburbId(
          typeof area === 'object' ? area?.id : area,
          typeof area === 'object' ? area?.name : area
        );
        if (!areaId) continue;
        await query(
          `insert into cleaner_service_areas (cleaner_id, suburb_id)
           values ($1, $2) on conflict do nothing`,
          [cleanerId, areaId]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save profile.' });
  }
});

// --- Client profile (customer basics + home details) -----------------------
async function clientIdForUser(userId) {
  const { rows } = await query('select id from client_profiles where user_id = $1', [userId]);
  return rows[0]?.id ?? null;
}
async function ensureClientProfile(userId) {
  let id = await clientIdForUser(userId);
  if (!id) {
    const { rows } = await query('insert into client_profiles (user_id) values ($1) returning id', [userId]);
    id = rows[0].id;
  }
  return id;
}

app.get('/api/client-profile', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const { rows } = await query(
      `select u.full_name, u.email, cp.phone, cp.address_line, cp.notes,
              cp.bedrooms, cp.bathrooms, cp.home_type, cp.has_stairs, cp.has_pets, cp.storeys, cp.profile_photo_url,
              cp.needs_products,
              s.name as suburb, s.id as suburb_id, s.region as suburb_region
         from users u
         left join client_profiles cp on cp.user_id = u.id
         left join suburbs s on s.id = cp.default_suburb_id
        where u.id = $1`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'No such user.' });
    const r = rows[0];
    res.json({
      fullName: r.full_name,
      email: r.email,
      phone: r.phone || '',
      suburb: r.suburb || '',
      suburbId: r.suburb_id ?? null,
      suburbRegion: r.suburb_region || '',
      address: r.address_line || '',
      notes: r.notes || '',
      bedrooms: r.bedrooms || '3',
      bathrooms: r.bathrooms || '1',
      homeType: r.home_type || 'House',
      stairs: !!r.has_stairs,
      pets: !!r.has_pets,
      needsProducts: !!r.needs_products,
      storeys: r.storeys || 'Single storey',
      photo: r.profile_photo_url || '',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load profile.' });
  }
});

app.put('/api/client-profile', async (req, res) => {
  try {
    const { userId, fullName, email, phone, suburb, suburbId, address, notes, bedrooms, bathrooms, homeType, stairs, pets, needsProducts, storeys, photo } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    await ensureClientProfile(userId);
    await query(
      `update users set full_name = coalesce($2, full_name),
              email = coalesce($3, email), updated_at = now() where id = $1`,
      [userId, fullName ?? null, email ? email.toLowerCase().trim() : null]
    );
    const subId = await resolveSuburbId(suburbId, suburb);
    const sub = { rows: subId ? [{ id: subId }] : [] };
    await query(
      `update client_profiles set
         default_suburb_id = coalesce($2, default_suburb_id),
         address_line = $3, notes = $4, phone = $5,
         bedrooms = $6, bathrooms = $7, home_type = $8, has_stairs = $9,
         has_pets = $10, storeys = $11,
         profile_photo_url = case when $12::text is null then profile_photo_url
                                  when $12 = '' then null else $12 end,
         needs_products = $13
       where user_id = $1`,
      [userId, sub.rows[0]?.id ?? null, address ?? null, notes ?? null, phone ?? null,
       bedrooms ?? null, bathrooms ?? null, homeType ?? null, !!stairs, !!pets, storeys ?? null,
       photo === undefined ? null : photo,
       !!needsProducts]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save profile.' });
  }
});

// --- Verification: submit an identity/police/insurance document -------------
const VERIF_TYPES = ['id', 'police', 'insurance'];
const VERIF_COL = { id: 'id_verified', police: 'police_verified', insurance: 'insurance_verified' };

app.get('/api/verifications', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const cleanerId = await cleanerIdForUser(userId);
    if (!cleanerId) return res.status(404).json({ error: 'No cleaner profile for that user.' });
    const prof = await query(
      'select id_verified, police_verified, insurance_verified from cleaner_profiles where id = $1',
      [cleanerId]
    );
    const subRows = await query(
      `select distinct on (type) type, status, extracted_text, selfie_url is not null as has_selfie
         from verifications where cleaner_id = $1 order by type, created_at desc`,
      [cleanerId]
    );
    const submitted = Object.fromEntries(subRows.rows.map((r) => [r.type, r.status]));
    const ocr = Object.fromEntries(subRows.rows.map((r) => [r.type, r.extracted_text]));
    const selfies = Object.fromEntries(subRows.rows.map((r) => [r.type, r.has_selfie]));
    const p = prof.rows[0] || {};
    const status = {};
    const read = {};
    for (const t of VERIF_TYPES) {
      if (p[VERIF_COL[t]]) status[t] = 'verified';
      else if (submitted[t] === 'pending') status[t] = 'pending';
      else if (submitted[t] === 'failed') status[t] = 'failed';
      else status[t] = 'none';
      if (ocr[t]) read[t] = String(ocr[t]).slice(0, 160);
    }
    // hasSelfie lets the maid portal show the ID check as half-done: document
    // in, selfie still missing.
    res.json({ ...status, read, hasSelfie: !!selfies.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load verifications.' });
  }
});

app.post('/api/verification', async (req, res) => {
  try {
    const { userId, type, documentDataUrl, selfieDataUrl, extractedText } = req.body ?? {};
    if (!userId || !VERIF_TYPES.includes(type)) return res.status(400).json({ error: 'userId and a valid type are required.' });
    // The document and the selfie arrive as separate uploads, so either one on
    // its own is a valid submission - we just need at least one of them.
    if (!documentDataUrl && !selfieDataUrl) return res.status(400).json({ error: 'Please attach a document.' });
    if (selfieDataUrl && type !== 'id') return res.status(400).json({ error: 'A selfie only applies to ID verification.' });
    const cleanerId = await cleanerIdForUser(userId);
    if (!cleanerId) return res.status(404).json({ error: 'No cleaner profile for that user.' });
    // OCR text is scanned in the maid's browser (keeps this endpoint — and the
    // server — safe from malformed-image decode crashes) and stored to aid review.
    const text = typeof extractedText === 'string' ? extractedText.replace(/[ \t]+\n/g, '\n').trim().slice(0, 2000) || null : null;

    // Carry forward whichever half is not being replaced. Without this, the
    // delete-and-reinsert below would silently drop the selfie every time the
    // document was re-uploaded, and vice versa.
    const prev = await query(
      'select document_url, selfie_url, extracted_text from verifications where cleaner_id = $1 and type = $2 order by created_at desc limit 1',
      [cleanerId, type]
    );
    const kept = prev.rows[0] || {};
    const doc = documentDataUrl || kept.document_url || null;
    const selfie = type === 'id' ? (selfieDataUrl || kept.selfie_url || null) : null;
    if (!doc) return res.status(400).json({ error: 'Please attach your ID document as well.' });

    // ID proves identity only if a document AND a selfie can be compared. Until
    // both are in it is not review-ready: it stays out of the admin queue (which
    // takes only complete submissions) and the admin is not pinged.
    const reviewReady = type !== 'id' || !!selfie;

    // One active submission per type: clear old, insert fresh as pending.
    await query('delete from verifications where cleaner_id = $1 and type = $2', [cleanerId, type]);
    await query(
      `insert into verifications (cleaner_id, type, status, document_url, selfie_url, provider, extracted_text)
       values ($1, $2, 'pending', $3, $4, 'self-upload', $5)`,
      [cleanerId, type, doc, selfie, text || kept.extracted_text || null]
    );
    // Nudge the admin only once the submission is complete, so an ID that is
    // still missing its selfie does not ping a review that can't happen yet.
    // Fire-and-forget - never fails the upload.
    if (reviewReady) {
      const who = await query(
        'select u.email, u.full_name from cleaner_profiles cp join users u on u.id = cp.user_id where cp.id = $1',
        [cleanerId]
      );
      sendVerificationPendingEmail({
        to: ADMIN_EMAIL,
        cleanerName: who.rows[0]?.full_name || '',
        cleanerEmail: who.rows[0]?.email || '',
        type,
        hasSelfie: !!selfie,
      }).catch((e) => console.error('[email] verification pending:', e));
    }

    res.json({
      ok: true,
      status: 'pending',
      read: text ? text.slice(0, 160) : '',
      hasSelfie: !!selfie,
      // Tells the maid the ID check is not finished until both are in.
      needsSelfie: type === 'id' && !selfie,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit document.' });
  }
});

// --- Admin: review uploaded verification documents --------------------------
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'ensor.jack@gmail.com').toLowerCase();

// The admin's own accounts are test data, not market signal. Left in they
// overstate every number on the dashboard - and materially, at this size: the
// admin's cleaner listing is active, ID-verified and covers 12 suburbs, so it
// was one of only three verified cleaners and a visible blob on the heatmap.
//
// A literal rather than a bound parameter because these fragments are spliced
// into queries whose placeholder numbering varies; the quote-doubling keeps it
// safe even though the value comes from our own env.
const ADMIN_EMAIL_SQL = `'${ADMIN_EMAIL.replace(/'/g, "''")}'`;
// For a query that already has the users table in scope.
const notAdmin = (alias = 'u') => `lower(${alias}.email) <> ${ADMIN_EMAIL_SQL}`;
// For one that only has cleaner_profiles - the row carries no email of its own.
const cpNotAdmin = (alias = 'cp') =>
  `not exists (select 1 from users au where au.id = ${alias}.user_id and lower(au.email) = ${ADMIN_EMAIL_SQL})`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function isAdmin(userId) {
  // Check the shape first. Postgres rejects anything that is not a uuid, so a
  // stray "undefined" in the query string used to throw and surface as a 500
  // (on every admin route) when the honest answer is simply "not authorised".
  if (!userId || !UUID_RE.test(String(userId))) return false;
  const { rows } = await query('select email from users where id = $1', [userId]);
  return !!rows[0] && String(rows[0].email).toLowerCase() === ADMIN_EMAIL;
}

// --- Feedback / suggestions (from the site-wide widget) --------------------
app.post('/api/feedback', async (req, res) => {
  try {
    const { userId, email, page, message } = req.body ?? {};
    const text = String(message || '').trim();
    if (!text) return res.status(400).json({ error: 'A message is required.' });
    await query(
      `insert into feedback (user_id, email, page, message)
       values ($1, $2, $3, $4)`,
      [userId || null, (email || '').slice(0, 200) || null, (page || '').slice(0, 300) || null, text.slice(0, 4000)]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send your feedback. Please try again.' });
  }
});

// Signup counts per day, split by side. Days with no signups still come back
// (generate_series) so the chart shows real gaps rather than closing them up.
//
// Bucketed by NZ local date, not UTC: an 11pm Auckland signup belongs to that
// day, and plain ::date on a timestamptz would push it into tomorrow.
app.get('/api/admin/stats', async (req, res) => {
  try {
    if (!(await isAdmin(req.query.userId))) return res.status(403).json({ error: 'Not authorized.' });
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));

    const series = await query(
      `with span as (
         select generate_series(
           (now() at time zone 'Pacific/Auckland')::date - ($1::int - 1),
           (now() at time zone 'Pacific/Auckland')::date,
           interval '1 day'
         )::date as d
       )
       -- to_char, not the bare date: node-pg turns a DATE into a JS Date at
       -- local midnight, which JSON then shifts a day either way.
       select to_char(span.d, 'YYYY-MM-DD') as date,
              count(u.id) filter (where u.role = 'client')::int  as customers,
              count(u.id) filter (where u.role = 'cleaner')::int as cleaners
         from span
         left join users u
           on (u.created_at at time zone 'Pacific/Auckland')::date = span.d
          and u.role in ('client','cleaner')
          and ${notAdmin()}
        group by span.d
        order by span.d`,
      [days]
    );

    // All-time totals, and how many of those are still active.
    const totals = await query(
      `select u.role,
              count(*)::int as total,
              count(*) filter (where u.status = 'active')::int as active
         from users u where u.role in ('client','cleaner') and ${notAdmin()} group by u.role`
    );
    const byRole = Object.fromEntries(totals.rows.map((r) => [r.role, r]));

    // Where the people who signed up in this window are based, ranked by town.
    // Signup itself carries no location - it comes from the profile set later:
    // a client's saved suburb, a cleaner's base address. Both are resolved
    // THROUGH the suburbs table to a territorial_authority, so the two sides
    // share one vocabulary - otherwise a cleaner's "Christchurch" and a client's
    // "Christchurch City" would rank as two different towns.
    //
    // Clients carry a suburb id directly. Cleaners store their base as the
    // "Suburb, Town" string homeAddress() built (or a lone "Town"), so match the
    // suburb-name part back to a row, preferring the one whose own town matches.
    // The trailing " City"/" District" is dropped for a friendlier label.
    const recent = `(u.created_at at time zone 'Pacific/Auckland')::date
                    > (now() at time zone 'Pacific/Auckland')::date - $1::int
                    and ${notAdmin()}`;
    const topTowns = await query(
      `with signups as (
         select 'client' as role, s.territorial_authority as ta
           from users u
           join client_profiles cp on cp.user_id = u.id
           join suburbs s on s.id = cp.default_suburb_id
          where u.role = 'client' and ${recent}
         union all
         select 'cleaner' as role, s.ta
           from users u
           join cleaner_profiles cp on cp.user_id = u.id
           join lateral (
             -- Match the suburb-name part; fall back to the town part against the
             -- territorial authority, so a lone-town base ("Christchurch", which
             -- is no suburb's name) still resolves to its TA ("Christchurch City").
             select sub.territorial_authority as ta
               from suburbs sub
              where lower(sub.name) = lower(trim(split_part(cp.residential_address, ',', 1)))
                 or lower(regexp_replace(sub.territorial_authority, '\\s+(City|District)$', '')) =
                    lower(trim(regexp_replace(cp.residential_address, '^.*,\\s*', '')))
              order by (lower(sub.name) = lower(trim(split_part(cp.residential_address, ',', 1)))) desc
              limit 1
           ) s on true
          where u.role = 'cleaner' and coalesce(cp.residential_address, '') <> '' and ${recent}
       )
       select regexp_replace(ta, '\\s+(City|District)$', '') as town,
              count(*) filter (where role = 'client')::int  as customers,
              count(*) filter (where role = 'cleaner')::int as cleaners,
              count(*)::int as total
         from signups
        where ta is not null and ta <> ''
        group by 1
        order by total desc, town
        limit 12`,
      [days]
    );

    // Advanced marketplace health, all in one round trip. A two-sided market
    // lives or dies on the balance between supply (cleaners, listed and
    // verified, and how much ground they cover) and demand (customers and the
    // enquiries they send), so the numbers are grouped that way.
    const adv = (await query(
      `select
         (select count(*) filter (where cp.listing_status = 'active') from cleaner_profiles cp where ${cpNotAdmin()})::int as active_listings,
         (select count(*) filter (where cp.id_verified) from cleaner_profiles cp where ${cpNotAdmin()})::int         as verified_id,
         (select count(*) filter (where cp.police_verified) from cleaner_profiles cp where ${cpNotAdmin()})::int      as verified_police,
         (select count(*) filter (where cp.insurance_verified) from cleaner_profiles cp where ${cpNotAdmin()})::int   as verified_insurance,
         (select count(distinct csa.suburb_id)
            from cleaner_service_areas csa
            join cleaner_profiles cp on cp.id = csa.cleaner_id
           where cp.listing_status = 'active' and ${cpNotAdmin()})::int as suburbs_covered,
         (select count(*) from enquiries)::int                                            as enquiries_total,
         (select count(*) filter (where responded_at is not null) from enquiries)::int    as enquiries_responded,
         (select count(*) from enquiries where created_at > now() - ($1 || ' days')::interval)::int as enquiries_window,
         (select count(*) from bookings)::int                                             as bookings_total,
         (select count(*) filter (where status = 'published') from reviews)::int          as reviews_total,
         (select round(avg(overall), 2) from reviews where status = 'published')          as avg_rating,
         (select count(*) filter (where u.created_at > now() - interval '7 days')
            from users u where u.role in ('client','cleaner') and ${notAdmin()})::int as signups_this_week,
         (select count(*) filter (where u.created_at <= now() - interval '7 days'
                               and u.created_at >  now() - interval '14 days')
            from users u where u.role in ('client','cleaner') and ${notAdmin()})::int as signups_prev_week`,
      [String(days)]
    )).rows[0];

    // Onboarding funnel, both sides. Every stage repeats all the conditions of
    // the stages above it, so the counts can only fall - a funnel whose steps
    // are independent filters can rise between stages, which reads as nonsense.
    //
    // Removed accounts are excluded: someone who deleted their account is not a
    // drop-off at the stage they happened to reach, and leaving them in makes
    // every conversion below look worse than it is. That makes the top of the
    // funnel smaller than the "all time" tile, so the count is returned too and
    // the dashboard says so rather than looking like an off-by-one.
    const funnelRow = (await query(
      `select
         count(*) filter (where u.role = 'cleaner')::int as c_signed,
         count(*) filter (where u.role = 'cleaner' and u.email_verified)::int as c_confirmed,
         count(*) filter (where u.role = 'cleaner' and u.email_verified
                            and cp.hourly_rate_min is not null)::int as c_priced,
         count(*) filter (where u.role = 'cleaner' and u.email_verified
                            and cp.hourly_rate_min is not null
                            and cp.listing_status = 'active')::int as c_listed,
         count(*) filter (where u.role = 'cleaner' and u.email_verified
                            and cp.hourly_rate_min is not null
                            and cp.listing_status = 'active' and cp.id_verified)::int as c_verified,
         count(*) filter (where u.role = 'client')::int as k_signed,
         count(*) filter (where u.role = 'client' and u.email_verified)::int as k_confirmed,
         count(*) filter (where u.role = 'client' and u.email_verified
                            and lp.default_suburb_id is not null)::int as k_located,
         count(*) filter (where u.role = 'client' and u.email_verified
                            and lp.default_suburb_id is not null
                            and exists (select 1 from enquiries e where e.client_id = lp.id))::int as k_enquired
         from users u
         left join cleaner_profiles cp on cp.user_id = u.id
         left join client_profiles  lp on lp.user_id = u.id
        where u.role in ('client','cleaner') and u.removed_at is null and ${notAdmin()}`
    )).rows[0];

    // Where signups came from, over the same window as everything else.
    //
    // Attribution only started being recorded when the acq_* columns shipped, so
    // anyone older has NULL. They are grouped as 'unknown' and kept visible
    // rather than dropped: hiding them would make the attributed slice look like
    // the whole picture, and early on it is the smaller half.
    const sources = await query(
      `select coalesce(u.acq_source, 'unknown') as source,
              coalesce(u.acq_medium, '')        as medium,
              count(*) filter (where u.role = 'cleaner')::int as cleaners,
              count(*) filter (where u.role = 'client')::int  as customers,
              count(*)::int as total
         from users u
        where u.role in ('client','cleaner') and u.removed_at is null and ${recent}
        group by 1, 2
        order by total desc, source
        limit 20`,
      [days]
    );

    const removedRow = (await query(
      `select count(*) filter (where u.role = 'cleaner')::int as cleaners,
              count(*) filter (where u.role = 'client')::int  as customers
         from users u where u.role in ('client','cleaner') and u.removed_at is not null and ${notAdmin()}`
    )).rows[0];

    const totalCleaners = byRole.cleaner?.total ?? 0;
    const totalCustomers = byRole.client?.total ?? 0;
    const respRate = adv.enquiries_total ? Math.round((adv.enquiries_responded / adv.enquiries_total) * 100) : null;
    const wow = adv.signups_prev_week
      ? Math.round(((adv.signups_this_week - adv.signups_prev_week) / adv.signups_prev_week) * 100)
      : null;

    res.json({
      days,
      series: series.rows,
      totals: {
        customers: totalCustomers,
        cleaners: totalCleaners,
        customersActive: byRole.client?.active ?? 0,
        cleanersActive: byRole.cleaner?.active ?? 0,
      },
      topTowns: topTowns.rows,
      // Stage labels live here, next to the SQL that defines them, so the
      // dashboard can't drift from what is actually being counted.
      funnel: {
        cleaners: [
          { label: 'Account created', value: funnelRow.c_signed },
          { label: 'Email confirmed', value: funnelRow.c_confirmed },
          { label: 'Set a rate', value: funnelRow.c_priced },
          { label: 'Profile complete, live in search', value: funnelRow.c_listed },
          { label: 'ID verified', value: funnelRow.c_verified },
        ],
        customers: [
          { label: 'Account created', value: funnelRow.k_signed },
          { label: 'Email confirmed', value: funnelRow.k_confirmed },
          { label: 'Saved their suburb', value: funnelRow.k_located },
          { label: 'Sent an enquiry', value: funnelRow.k_enquired },
        ],
        removedCleaners: removedRow.cleaners,
        removedCustomers: removedRow.customers,
      },
      sources: sources.rows,
      advanced: {
        activeListings: adv.active_listings,
        verifiedId: adv.verified_id,
        verifiedPolice: adv.verified_police,
        verifiedInsurance: adv.verified_insurance,
        suburbsCovered: adv.suburbs_covered,
        enquiriesTotal: adv.enquiries_total,
        enquiriesWindow: adv.enquiries_window,
        enquiryResponseRate: respRate,     // % of enquiries a cleaner has replied to
        bookings: adv.bookings_total,
        reviews: adv.reviews_total,
        avgRating: adv.avg_rating != null ? Number(adv.avg_rating) : null,
        // Customers per active listing - the supply/demand balance at a glance.
        customersPerListing: adv.active_listings ? Math.round((totalCustomers / adv.active_listings) * 10) / 10 : null,
        signupsThisWeek: adv.signups_this_week,
        signupsPrevWeek: adv.signups_prev_week,
        signupsWowPct: wow,               // week-on-week growth, null if no prior week
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

// How many active cleaners can service each suburb, for the coverage map.
//
// Framed as a radius around each city centre rather than the territorial
// authority. Christchurch City as a council excludes Rangiora, Rolleston,
// Lincoln and Kaiapoi, which are separate one-suburb TAs but plainly part of
// the market a Christchurch cleaner works - drawing the boundary at the council
// line would show those as absent rather than uncovered.
// A view with no radius covers the whole country. That is the one that answers
// "where are we not?", which is a different question from "how deep are we in
// the two cities we launched in" - and the answer is mostly "everywhere", so it
// is worth being able to see at a glance.
const COVERAGE_CITIES = [
  { key: 'chch', name: 'Christchurch', lat: -43.5321, lng: 172.6362, radiusKm: 35 },
  { key: 'akl', name: 'Auckland', lat: -36.8485, lng: 174.7633, radiusKm: 45 },
  { key: 'nz', name: 'All of NZ', lat: -41.0, lng: 173.5, radiusKm: null, zoom: 5 },
];
app.get('/api/admin/coverage', async (req, res) => {
  try {
    if (!(await isAdmin(req.query.userId))) return res.status(403).json({ error: 'Not authorized.' });
    const withinKm = `6371 * acos(least(1,
      cos(radians($1)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians($2))
      + sin(radians($1)) * sin(radians(s.lat))))`;
    const cities = [];
    for (const c of COVERAGE_CITIES) {
      const national = c.radiusKm == null;
      const { rows } = await query(
        `select s.id, s.name, s.territorial_authority as town, s.region, s.lat, s.lng,
                coalesce(a.n, 0)::int as cleaners
           from suburbs s
           left join lateral (
             select count(distinct csa.cleaner_id)::int as n
               from cleaner_service_areas csa
               join cleaner_profiles cp on cp.id = csa.cleaner_id
              where csa.suburb_id = s.id and cp.listing_status = 'active'
                and ${cpNotAdmin()}
           ) a on true
          where s.lat is not null${national ? '' : ` and ${withinKm} <= $3`}
          order by coalesce(a.n, 0) desc, s.name`,
        national ? [] : [c.lat, c.lng, c.radiusKm]
      );
      const suburbs = rows.map((r) => ({
        id: r.id, name: r.name, town: r.town, region: r.region,
        lat: Number(r.lat), lng: Number(r.lng), cleaners: r.cleaners,
      }));
      const counts = suburbs.map((s) => s.cleaners);
      // Nationally, "86 of 1688 suburbs" is a number nobody can hold. The
      // regions with any coverage at all is the readable version of the same
      // fact, and it is what says how far from nationwide we actually are.
      const byRegion = new Map();
      for (const s of suburbs) {
        const cur = byRegion.get(s.region) || { region: s.region, total: 0, covered: 0 };
        cur.total++;
        if (s.cleaners > 0) cur.covered++;
        byRegion.set(s.region, cur);
      }
      const regions = [...byRegion.values()].sort((a, b) => b.covered - a.covered || a.region.localeCompare(b.region));
      cities.push({
        key: c.key, name: c.name, center: { lat: c.lat, lng: c.lng }, radiusKm: c.radiusKm,
        zoom: c.zoom || null,
        national,
        suburbs,
        regions,
        stats: {
          total: suburbs.length,
          covered: counts.filter((n) => n > 0).length,
          uncovered: counts.filter((n) => n === 0).length,
          max: counts.length ? Math.max(...counts) : 0,
          regionsCovered: regions.filter((r) => r.covered > 0).length,
          regionsTotal: regions.length,
        },
      });
    }
    res.json({ cities });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load coverage.' });
  }
});

// Everyone who has registered. A roster, not a metric - so unlike the stats
// endpoints this deliberately DOES include the admin's own accounts (flagged as
// such) and removed accounts: a list of who signed up that quietly omits people
// is worse than no list, because you cannot tell it is doing it.
app.get('/api/admin/users', async (req, res) => {
  try {
    if (!(await isAdmin(req.query.userId))) return res.status(403).json({ error: 'Not authorized.' });
    const { rows } = await query(
      `select u.id, u.email, u.full_name, u.role, u.created_at, u.email_verified,
              u.status, u.removed_at, u.acq_source, u.acq_medium,
              cp.business_name, cp.listing_status, cp.hourly_rate_min,
              cp.id_verified, cp.police_verified, cp.insurance_verified,
              (select count(*) from availability_rules ar where ar.cleaner_id = cp.id)::int as slots,
              (select count(*) from cleaner_service_areas csa where csa.cleaner_id = cp.id)::int as areas,
              s.name as suburb,
              (select count(*) from enquiries e where e.client_id = lp.id)::int as enquiries
         from users u
         left join cleaner_profiles cp on cp.user_id = u.id
         left join client_profiles  lp on lp.user_id = u.id
         left join suburbs s on s.id = lp.default_suburb_id
        where u.role in ('client','cleaner')
        order by u.created_at desc`
    );
    res.json({
      adminEmail: ADMIN_EMAIL,
      users: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.full_name || '',
        business: r.business_name || '',
        role: r.role,
        joined: r.created_at,
        verified: r.email_verified,
        removed: !!r.removed_at,
        status: r.status,
        source: r.acq_source || null,
        medium: r.acq_medium || null,
        // Cleaner-side completeness, so the roster doubles as a to-do list.
        listing: r.listing_status || null,
        hasRate: r.hourly_rate_min != null,
        slots: r.slots ?? 0,
        areas: r.areas ?? 0,
        badges: { id: !!r.id_verified, police: !!r.police_verified, insurance: !!r.insurance_verified },
        // Customer-side.
        suburb: r.suburb || null,
        enquiries: r.enquiries ?? 0,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load the register.' });
  }
});

app.get('/api/admin/feedback', async (req, res) => {
  try {
    if (!(await isAdmin(req.query.userId))) return res.status(403).json({ error: 'Not authorized.' });
    const { rows } = await query(
      `select f.id, f.message, f.page, f.created_at,
              coalesce(u.email, f.email) as email, u.full_name, u.role
         from feedback f left join users u on u.id = f.user_id
        order by f.created_at desc limit 200`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load feedback.' });
  }
});

app.get('/api/admin/verifications', async (req, res) => {
  try {
    if (!(await isAdmin(req.query.userId))) return res.status(403).json({ error: 'Not authorized.' });
    const { rows } = await query(
      `select v.id, v.type, v.status, v.document_url, v.selfie_url, v.extracted_text,
              to_char(v.created_at, 'DD Mon YYYY, HH24:MI') as when,
              to_char(u.created_at, 'DD Mon YYYY') as joined,
              coalesce(cpf.business_name, u.full_name) as cleaner,
              u.full_name, u.email, u.phone,
              cpf.business_name, cpf.years_experience, cpf.residential_address,
              cpf.hourly_rate_min, cpf.hourly_rate_max,
              (select coalesce(array_agg(distinct s.name) filter (where s.name is not null), array[]::text[])
                 from cleaner_service_areas csa join suburbs s on s.id = csa.suburb_id
                where csa.cleaner_id = cpf.id) as areas
         from verifications v
         join cleaner_profiles cpf on cpf.id = v.cleaner_id
         join users u on u.id = cpf.user_id
        -- An ID needs both a document and a selfie to prove identity; one without
        -- a selfie is not review-ready, so keep it out of the queue entirely.
        where v.status = 'pending'
          and (v.type <> 'id' or v.selfie_url is not null)
        order by v.created_at`
    );
    res.json(rows.map((r) => ({
      id: r.id, type: r.type, documentUrl: r.document_url, selfieUrl: r.selfie_url || null,
      extractedText: r.extracted_text || '',
      when: r.when, cleaner: r.cleaner, email: r.email,
      // Basic identity details so the reviewer can check the document against
      // who the cleaner says they are.
      fullName: r.full_name || '', businessName: r.business_name || '',
      phone: r.phone || '', joined: r.joined || '',
      residentialAddress: r.residential_address || '',
      years: r.years_experience != null ? r.years_experience : null,
      rateMin: r.hourly_rate_min != null ? Number(r.hourly_rate_min) : null,
      rateMax: r.hourly_rate_max != null ? Number(r.hourly_rate_max) : null,
      areas: Array.isArray(r.areas) ? r.areas : [],
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load review queue.' });
  }
});

app.post('/api/admin/verification-decision', async (req, res) => {
  try {
    const { userId, id, decision } = req.body ?? {};
    if (!(await isAdmin(userId))) return res.status(403).json({ error: 'Not authorized.' });
    if (!id || !['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'id and a valid decision are required.' });
    const v = await query('select cleaner_id, type, selfie_url from verifications where id = $1', [id]);
    if (!v.rows.length) return res.status(404).json({ error: 'No such verification.' });
    const { cleaner_id, type, selfie_url } = v.rows[0];
    // Never verify an ID on a document alone - physical identity needs the selfie
    // to check the face against. Belt-and-braces: the queue already hides these.
    if (decision === 'approve' && type === 'id' && !selfie_url) {
      return res.status(400).json({ error: 'This ID has no selfie, so identity can’t be confirmed. Ask the cleaner to add one.' });
    }
    if (decision === 'approve') {
      await query("update verifications set status = 'verified', verified_at = now() where id = $1", [id]);
      const col = VERIF_COL[type];
      if (col) await query(`update cleaner_profiles set ${col} = true where id = $1`, [cleaner_id]);
      // Verification no longer earns a referral credit - a paid month does (see
      // awardReferralIfQualified). Still worth checking here: this is a moment
      // we know something changed about the cleaner, and the call is a no-op
      // unless they genuinely qualify.
      await awardReferralIfQualified(cleaner_id);
    } else {
      await query("update verifications set status = 'failed' where id = $1", [id]);
    }

    // Tell the cleaner either way. Fire-and-forget: a failed send must never
    // undo a decision that is already recorded.
    const who = await query(
      'select u.email, u.full_name from cleaner_profiles cp join users u on u.id = cp.user_id where cp.id = $1',
      [cleaner_id]
    );
    const c = who.rows[0];
    if (c?.email) {
      sendVerificationDecisionEmail({
        to: c.email,
        name: c.full_name,
        type,
        approved: decision === 'approve',
      }).catch((e) => console.error('[email] verification decision:', e));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not record the decision.' });
  }
});

// --- Admin: moderate customer reviews --------------------------------------
// Every review, newest first, whatever its status, so a hidden one can be
// restored. Names on both sides so the admin can see who said what about whom.
app.get('/api/admin/reviews', async (req, res) => {
  try {
    if (!(await isAdmin(req.query.userId))) return res.status(403).json({ error: 'Not authorized.' });
    const { rows } = await query(
      `select r.id, r.overall, r.quality, r.value_for_money, r.timeliness,
              r.punctuality, r.communication, r.would_use_again, r.comment, r.status,
              to_char(r.created_at, 'DD Mon YYYY, HH24:MI') as when,
              coalesce(cpf.business_name, cu.full_name) as cleaner,
              clu.full_name as client
         from reviews r
         join cleaner_profiles cpf on cpf.id = r.cleaner_id
         join users cu on cu.id = cpf.user_id
         join client_profiles clp on clp.id = r.client_id
         join users clu on clu.id = clp.user_id
        order by r.created_at desc limit 300`
    );
    res.json(rows.map((r) => ({
      id: r.id, overall: Number(r.overall), status: r.status,
      quality: Number(r.quality), value: Number(r.value_for_money),
      timeliness: Number(r.timeliness), punctuality: Number(r.punctuality),
      communication: Number(r.communication), wouldUseAgain: r.would_use_again,
      comment: r.comment || '', when: r.when, cleaner: r.cleaner, client: r.client,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load reviews.' });
  }
});

// Hiding sets 'removed' so the review drops off the cleaner's profile and out
// of their rating; restoring returns it to 'published'. Either way the
// cleaner's headline average is recomputed from what remains published.
app.post('/api/admin/review-moderate', async (req, res) => {
  try {
    const { userId, id, action } = req.body ?? {};
    if (!(await isAdmin(userId))) return res.status(403).json({ error: 'Not authorized.' });
    if (!id || !['hide', 'restore'].includes(action))
      return res.status(400).json({ error: 'id and a valid action are required.' });
    const status = action === 'hide' ? 'removed' : 'published';
    const upd = await query('update reviews set status = $2 where id = $1 returning cleaner_id', [id, status]);
    if (!upd.rows.length) return res.status(404).json({ error: 'No such review.' });
    await refreshCleanerRating(upd.rows[0].cleaner_id);
    res.json({ ok: true, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update the review.' });
  }
});

// --- Cleaner directory (for the messages picker) ---------------------------
app.get('/api/directory', async (_req, res) => {
  try {
    const { rows } = await query(
      `select cp.id, coalesce(cp.business_name, u.full_name) as name,
              cp.hourly_rate_min, cp.hourly_rate_max, cp.avg_rating, cp.review_count,
              cp.id_verified, cp.police_verified, cp.insurance_verified, cp.brings_products,
              coalesce(array_agg(distinct s.name) filter (where s.name is not null), array[]::text[]) as areas
         from cleaner_profiles cp
         join users u on u.id = cp.user_id
         left join cleaner_service_areas csa on csa.cleaner_id = cp.id
         left join suburbs s on s.id = csa.suburb_id
        where cp.listing_status = 'active' and u.status = 'active'
        group by cp.id, u.id
        order by cp.avg_rating desc`
    );
    res.json(rows.map((r) => ({
      id: r.id,
      name: r.name,
      rateMin: r.hourly_rate_min != null ? Number(r.hourly_rate_min) : null,
      rateMax: r.hourly_rate_max != null ? Number(r.hourly_rate_max) : null,
      rating: Number(r.avg_rating) || 0,
      reviews: r.review_count,
      badges: { id: r.id_verified, police: r.police_verified, insurance: r.insurance_verified },
      bringsProducts: !!r.brings_products,
      areas: r.areas,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load directory.' });
  }
});

// Public cleaner profile (opened by clicking a cleaner's name in results).
app.get('/api/cleaner-profile', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id is required.' });
    const { rows } = await query(
      `select cp.id, coalesce(cp.business_name, u.full_name) as name, cp.bio, cp.years_experience,
              nullif(cp.business_name, '') is not null as is_business,
              cp.hourly_rate_min, cp.hourly_rate_max, cp.avg_rating, cp.review_count, cp.addons,
              cp.id_verified, cp.police_verified, cp.insurance_verified, cp.brings_products,
              cp.clean_rates, cp.profile_photo_url
         from cleaner_profiles cp join users u on u.id = cp.user_id
        where cp.id = $1 and u.status = 'active'`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No such cleaner.' });
    const cp = rows[0];
    const svc = await query(
      `select st.name from cleaner_services cs join service_types st on st.id = cs.service_type_id where cs.cleaner_id = $1`,
      [id]
    );
    const areas = await query(
      `select s.name from cleaner_service_areas csa join suburbs s on s.id = csa.suburb_id where csa.cleaner_id = $1`,
      [id]
    );
    const av = await query(
      `select day_of_week, to_char(start_time,'HH24:MI') as start from availability_rules where cleaner_id = $1`,
      [id]
    );
    res.json({
      id: cp.id,
      name: cp.name,
      isBusiness: !!cp.is_business,
      bio: cp.bio || '',
      years: cp.years_experience,
      rateMin: cp.hourly_rate_min != null ? Number(cp.hourly_rate_min) : null,
      rateMax: cp.hourly_rate_max != null ? Number(cp.hourly_rate_max) : null,
      rating: Number(cp.avg_rating) || 0,
      reviews: cp.review_count,
      badges: { id: cp.id_verified, police: cp.police_verified, insurance: cp.insurance_verified },
      bringsProducts: !!cp.brings_products,
      // The actual per-clean-type hourly fees, replacing the dead
      // service_surcharges the profile card used to list as "specialist cleans".
      // endOfLease rides in the same JSON as a capability, not a fee.
      cleanFees: (() => {
        const cr = cp.clean_rates && typeof cp.clean_rates === 'object' ? cp.clean_rates : {};
        return ['regular', 'deep', 'end-of-tenancy']
          .map((slug) => ({ slug, price: Number(cr[slug]) }))
          .filter((f) => Number.isFinite(f.price) && f.price > 0);
      })(),
      endOfLease: !!(cp.clean_rates && cp.clean_rates.endOfLease),
      breakdown: await reviewBreakdown(cp.id),
      photo: cp.profile_photo_url || '',
      services: svc.rows.map((r) => r.name),
      addons: Array.isArray(cp.addons) ? cp.addons : [],
      areas: areas.rows.map((r) => r.name),
      availability: av.rows.map((r) => ({ day: r.day_of_week, slot: START_TO_SLOT[r.start] })).filter((x) => x.slot),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load profile.' });
  }
});

// --- Starred cleaners (a customer's saved / previous cleaners) --------------
app.get('/api/favourites', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const { rows } = await query(
      `select cp.id, coalesce(cp.business_name, u.full_name) as name,
              cp.hourly_rate_min, cp.hourly_rate_max, cp.avg_rating, cp.review_count,
              cp.id_verified, cp.police_verified, cp.insurance_verified, cp.profile_photo_url
         from client_favourites f
         join cleaner_profiles cp on cp.id = f.cleaner_id
         join users u on u.id = cp.user_id
        where f.client_user_id = $1 and u.status = 'active'
        order by f.created_at desc`,
      [userId]
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        rateMin: r.hourly_rate_min != null ? Number(r.hourly_rate_min) : null,
        rateMax: r.hourly_rate_max != null ? Number(r.hourly_rate_max) : null,
        rating: Number(r.avg_rating) || 0,
        reviews: r.review_count,
        badges: { id: r.id_verified, police: r.police_verified, insurance: r.insurance_verified },
        photo: r.profile_photo_url || '',
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load starred cleaners.' });
  }
});

app.post('/api/favourites', async (req, res) => {
  try {
    const { userId, cleanerId, starred } = req.body ?? {};
    if (!userId || !cleanerId) return res.status(400).json({ error: 'userId and cleanerId are required.' });
    if (starred === false) {
      await query('delete from client_favourites where client_user_id = $1 and cleaner_id = $2', [userId, cleanerId]);
    } else {
      await query(
        `insert into client_favourites (client_user_id, cleaner_id) values ($1, $2)
         on conflict (client_user_id, cleaner_id) do nothing`,
        [userId, cleanerId]
      );
    }
    res.json({ ok: true, starred: starred !== false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update your starred cleaners.' });
  }
});

// --- Enquiries + messaging (real, cross-device) ----------------------------
// Email the cleaner that a new enquiry arrived. Looks up the cleaner's address
// and the customer's name; a friendly service label and suburb dress it up.
async function notifyCleanerOfEnquiry({ cleanerId, clientUserId, serviceSlug, suburb, message }) {
  const cleaner = await query(
    `select u.email, coalesce(nullif(cp.business_name, ''), u.full_name) as name
       from cleaner_profiles cp join users u on u.id = cp.user_id where cp.id = $1`,
    [cleanerId]
  );
  const to = cleaner.rows[0]?.email;
  if (!to) return;
  const client = await query('select full_name from users where id = $1', [clientUserId]);
  const svc = serviceSlug ? await query('select name from service_types where slug = $1', [serviceSlug]) : { rows: [] };
  await sendEnquiryEmail({
    to,
    cleanerName: cleaner.rows[0].name,
    clientName: client.rows[0]?.full_name || 'A customer',
    service: svc.rows[0]?.name || '',
    suburb: suburb || '',
    message: message || '',
  });
}

// Messaging is open to every logged-in customer. It was admin-only while the
// cleaner network was being built; that phase is over.
//
// Open by DEFAULT rather than by environment variable: holding it open from a
// dashboard setting means the live behaviour of the product is invisible in the
// codebase, and one wrong env edit silently closes the marketplace.
// MESSAGING_OPEN=off remains as a kill switch for deliberately closing it,
// rather than as the thing that holds it open.
//
// Note this is a UI gate, not a security boundary: /api/contact has never been
// restricted, and a determined visitor could always have called it directly.
// What it governs is whether the button is offered, not who the server trusts.
async function canMessage(userId) {
  if (String(process.env.MESSAGING_OPEN || '').toLowerCase() === 'off') return isAdmin(userId);
  return !!userId;
}
app.get('/api/can-message', async (req, res) => {
  try {
    res.json({ allowed: await canMessage(req.query.userId) });
  } catch {
    res.json({ allowed: false });
  }
});

// Both sides of a conversation, with the names and addresses an email needs.
async function conversationParties(conversationId) {
  const { rows } = await query(
    `select cu.id  as client_user_id,  cu.email as client_email,  cu.full_name as client_name,
            mu.id  as cleaner_user_id, mu.email as cleaner_email,
            coalesce(nullif(cp.business_name, ''), mu.full_name) as cleaner_name
       from conversations c
       join client_profiles  lp on lp.id = c.client_id
       join users            cu on cu.id = lp.user_id
       join cleaner_profiles cp on cp.id = c.cleaner_id
       join users            mu on mu.id = cp.user_id
      where c.id = $1`,
    [conversationId]
  );
  return rows[0] || null;
}

// Email whoever did NOT send this message that it arrived.
//
// Only while there is nothing else waiting for them. A live back-and-forth
// would otherwise put an email in the inbox for every line, which is how a
// useful notification becomes one people filter away. So: one email, then
// silence until they open the thread (which marks it read), then the next
// message notifies again.
//
// Fire-and-forget everywhere it is called - a mail hiccup must never fail the
// message itself, which is already safely in the database by then.
async function notifyNewMessage({ conversationId, senderUserId, kind }) {
  if (kind && kind !== 'text') return; // system prompts speak for themselves
  const p = await conversationParties(conversationId);
  if (!p) return;

  const toCleaner = String(senderUserId) === String(p.client_user_id);
  const recipientId = toCleaner ? p.cleaner_user_id : p.client_user_id;
  const to = toCleaner ? p.cleaner_email : p.client_email;
  if (!to || String(recipientId) === String(senderUserId)) return;

  const { rows } = await query(
    `select count(*)::int as n from messages
      where conversation_id = $1 and sender_user_id <> $2
        and read_at is null and coalesce(kind, 'text') = 'text'`,
    [conversationId, recipientId]
  );
  if ((rows[0]?.n ?? 0) !== 1) return; // already told them; nothing new to say

  const { rows: last } = await query(
    `select body from messages
      where conversation_id = $1 and sender_user_id = $2 and coalesce(kind,'text') = 'text'
      order by sent_at desc limit 1`,
    [conversationId, senderUserId]
  );

  await sendNewMessageEmail({
    to,
    toName: toCleaner ? p.cleaner_name : p.client_name,
    fromName: toCleaner ? p.client_name : p.cleaner_name,
    body: last[0]?.body || '',
    portal: toCleaner ? '/maid' : '/customer',
  });
}

// Contact a cleaner: reuse the existing thread with them, or create an enquiry
// + conversation, then (optionally) post the first message.
app.post('/api/contact', async (req, res) => {
  try {
    const { clientUserId, cleanerId, message, serviceSlug, suburb } = req.body ?? {};
    if (!clientUserId || !cleanerId) return res.status(400).json({ error: 'clientUserId and cleanerId are required.' });
    const clientId = await ensureClientProfile(clientUserId);

    const existing = await query(
      'select id from conversations where client_id = $1 and cleaner_id = $2 order by created_at limit 1',
      [clientId, cleanerId]
    );
    let conversationId = existing.rows[0]?.id;
    const isNewConversation = !conversationId;
    if (!conversationId) {
      const svc = serviceSlug ? await query('select id from service_types where slug = $1', [serviceSlug]) : { rows: [] };
      const subId = await resolveSuburbId(req.body?.suburbId, suburb);
      const sub = { rows: subId ? [{ id: subId }] : [] };
      const enq = await query(
        `insert into enquiries (client_id, cleaner_id, service_type_id, suburb_id, message)
         values ($1, $2, $3, $4, $5) returning id`,
        [clientId, cleanerId, svc.rows[0]?.id ?? null, sub.rows[0]?.id ?? null, message ?? null]
      );
      const conv = await query(
        `insert into conversations (enquiry_id, client_id, cleaner_id, last_message_at)
         values ($1, $2, $3, now()) returning id`,
        [enq.rows[0].id, clientId, cleanerId]
      );
      conversationId = conv.rows[0].id;

      // Let the cleaner know a new enquiry landed. Fire-and-forget: an email
      // hiccup must never fail the enquiry itself.
      notifyCleanerOfEnquiry({ cleanerId, clientUserId, serviceSlug, suburb, message }).catch(() => {});
    }
    if (message) {
      await query('insert into messages (conversation_id, sender_user_id, body) values ($1, $2, $3)',
        [conversationId, clientUserId, message]);
      await query('update conversations set last_message_at = now() where id = $1', [conversationId]);
      // A brand-new enquiry already sent the cleaner an email above; this covers
      // messaging someone you have contacted before, which sent nothing at all.
      if (!isNewConversation) {
        notifyNewMessage({ conversationId, senderUserId: clientUserId }).catch((e) => console.error('[email] new message:', e));
      }
    }
    res.json({ conversationId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not start the conversation.' });
  }
});

app.get('/api/conversations', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const { rows } = await query(
      `select c.id, c.enquiry_id, c.cleaner_id, c.client_id, c.last_message_at,
              cpf.user_id as cleaner_user_id, clpf.user_id as client_user_id,
              cu.full_name as cleaner_person, nullif(cpf.business_name, '') as cleaner_business,
              clu.full_name as client_name,
              (select body from messages m where m.conversation_id = c.id order by sent_at desc limit 1) as last_body,
              (select to_char(sent_at, 'Dy HH24:MI') from messages m where m.conversation_id = c.id order by sent_at desc limit 1) as last_at
         from conversations c
         join cleaner_profiles cpf on cpf.id = c.cleaner_id
         join users cu on cu.id = cpf.user_id
         join client_profiles clpf on clpf.id = c.client_id
         join users clu on clu.id = clpf.user_id
        where cpf.user_id = $1 or clpf.user_id = $1
        order by c.last_message_at desc nulls last`,
      [userId]
    );
    res.json(rows.map((r) => {
      const viewerIsCleaner = r.cleaner_user_id === userId;
      return {
        id: r.id,
        // Person's name on top; their business (if any) shown underneath.
        with: viewerIsCleaner ? r.client_name : r.cleaner_person,
        withBusiness: viewerIsCleaner ? '' : r.cleaner_business || '',
        cleanerId: r.cleaner_id,
        // The house profile is keyed on the enquiry, so Messages needs it to
        // open the same modal the Enquiries tab already has.
        enquiryId: r.enquiry_id,
        lastBody: r.last_body || 'New conversation',
        lastAt: r.last_at || '',
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load conversations.' });
  }
});

async function isParticipant(conversationId, userId) {
  const { rows } = await query(
    `select 1 from conversations c
       join cleaner_profiles cpf on cpf.id = c.cleaner_id
       join client_profiles clpf on clpf.id = c.client_id
      where c.id = $1 and (cpf.user_id = $2 or clpf.user_id = $2)`,
    [conversationId, userId]
  );
  return rows.length > 0;
}

app.get('/api/messages', async (req, res) => {
  try {
    const { conversationId, userId } = req.query;
    if (!conversationId || !userId) return res.status(400).json({ error: 'conversationId and userId are required.' });
    if (!(await isParticipant(conversationId, userId))) return res.status(403).json({ error: 'Not your conversation.' });
    const { rows } = await query(
      `select sender_user_id, body, kind, to_char(sent_at, 'Dy HH24:MI') as at
         from messages where conversation_id = $1 order by sent_at`,
      [conversationId]
    );
    // Opening the thread is reading it. read_at was in the schema and never
    // written, which left it useless - and it is what stops the new-message
    // email firing on every line of a live back-and-forth (see
    // notifyNewMessage): one email while there is something unread, then
    // nothing more until they have actually looked.
    query(
      `update messages set read_at = now()
        where conversation_id = $1 and sender_user_id <> $2 and read_at is null`,
      [conversationId, userId]
    ).catch((e) => console.error('[messages] mark read:', e));

    res.json({
      messages: rows.map((m) => ({
        from: m.sender_user_id === userId ? 'me' : 'them',
        body: m.body,
        kind: m.kind || 'text',
        at: m.at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load messages.' });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { conversationId, senderUserId, body } = req.body ?? {};
    if (!conversationId || !senderUserId || !body) return res.status(400).json({ error: 'conversationId, senderUserId and body are required.' });
    if (!(await isParticipant(conversationId, senderUserId))) return res.status(403).json({ error: 'Not your conversation.' });
    await query('insert into messages (conversation_id, sender_user_id, body) values ($1, $2, $3)', [conversationId, senderUserId, body]);
    await query('update conversations set last_message_at = now() where id = $1', [conversationId]);
    notifyNewMessage({ conversationId, senderUserId }).catch((e) => console.error('[email] new message:', e));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send message.' });
  }
});

app.get('/api/enquiries', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const { rows } = await query(
      `select e.id, e.status, e.message, to_char(e.created_at, 'Dy DD Mon') as when,
              to_char(e.scheduled_on, 'Dy DD Mon') as scheduled_when,
              st.name as service, s.name as suburb,
              clu.full_name as client_name,
              coalesce(cpf.business_name, cu.full_name) as cleaner_name,
              cpf.user_id as cleaner_user_id,
              conv.id as conversation_id
         from enquiries e
         join cleaner_profiles cpf on cpf.id = e.cleaner_id
         join users cu on cu.id = cpf.user_id
         join client_profiles clpf on clpf.id = e.client_id
         join users clu on clu.id = clpf.user_id
         left join service_types st on st.id = e.service_type_id
         left join suburbs s on s.id = e.suburb_id
         left join conversations conv on conv.enquiry_id = e.id
        where cpf.user_id = $1 or clpf.user_id = $1
        order by e.created_at desc`,
      [userId]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      status: r.status,
      message: r.message || '',
      when: r.when,
      scheduledWhen: r.scheduled_when || '',
      service: r.service || 'Cleaning',
      suburb: r.suburb || '',
      role: r.cleaner_user_id === userId ? 'cleaner' : 'client',
      customer: r.client_name,
      cleaner: r.cleaner_name,
      conversationId: r.conversation_id,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load enquiries.' });
  }
});

// Cleaner views the profile of a client who enquired — so they can vet them.
app.get('/api/client-view', async (req, res) => {
  try {
    const { enquiryId, userId } = req.query;
    if (!enquiryId || !userId) return res.status(400).json({ error: 'enquiryId and userId are required.' });
    const { rows } = await query(
      `select u.full_name, u.email, cp.phone, cp.address_line, cp.notes,
              cp.bedrooms, cp.bathrooms, cp.home_type, cp.has_stairs, cp.has_pets, cp.storeys, cp.profile_photo_url,
              s.name as suburb, cpf.user_id as cleaner_user_id
         from enquiries e
         join client_profiles cp on cp.id = e.client_id
         join users u on u.id = cp.user_id
         join cleaner_profiles cpf on cpf.id = e.cleaner_id
         left join suburbs s on s.id = cp.default_suburb_id
        where e.id = $1`,
      [enquiryId]
    );
    if (!rows.length) return res.status(404).json({ error: 'No such enquiry.' });
    const r = rows[0];
    if (r.cleaner_user_id !== userId) return res.status(403).json({ error: 'Not your enquiry.' });
    res.json({
      fullName: r.full_name,
      email: r.email,
      phone: r.phone || '',
      suburb: r.suburb || '',
      address: r.address_line || '',
      notes: r.notes || '',
      bedrooms: r.bedrooms || '',
      bathrooms: r.bathrooms || '',
      homeType: r.home_type || '',
      stairs: !!r.has_stairs,
      pets: !!r.has_pets,
      storeys: r.storeys || '',
      photo: r.profile_photo_url || '',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load client profile.' });
  }
});

// A calendar date, 'YYYY-MM-DD'. The round-trip through Date catches the days
// that don't exist ('2026-02-31' would otherwise slide through as 2 March).
function parseCleanDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  const DAY = 86_400_000;
  const now = Date.now();
  // A day's grace for timezones: the server runs in UTC, the cleaner is in NZ.
  if (d.getTime() < now - DAY) return null;
  if (d.getTime() > now + 365 * DAY) return null;
  return value;
}

// Cleaner accepts / declines / responds to an enquiry.
app.post('/api/enquiry-status', async (req, res) => {
  try {
    const { enquiryId, userId, status, scheduledOn } = req.body ?? {};
    const allowed = ['new', 'responded', 'accepted', 'declined', 'closed', 'completed'];
    if (!enquiryId || !userId || !allowed.includes(status))
      return res.status(400).json({ error: 'enquiryId, userId and a valid status are required.' });

    // Accepting fixes the date of the clean, and that date is what later fires
    // the review prompt. An accept without one would leave the enquiry with no
    // trigger at all, so it is refused rather than quietly stored as null.
    let scheduled = null;
    if (status === 'accepted') {
      scheduled = parseCleanDate(scheduledOn);
      if (!scheduled) return res.status(400).json({ error: 'Pick the date of the clean to accept.' });
    }

    const auth = await query(
      `select 1 from enquiries e join cleaner_profiles cpf on cpf.id = e.cleaner_id
        where e.id = $1 and cpf.user_id = $2`,
      [enquiryId, userId]
    );
    if (!auth.rows.length) return res.status(403).json({ error: 'Not your enquiry.' });
    await query(
      `update enquiries set status = $2::enquiry_status,
              scheduled_on = coalesce($3::date, scheduled_on),
              responded_at = case when $2::enquiry_status <> 'new' then now() else responded_at end
        where id = $1`,
      [enquiryId, status, scheduled]
    );

    // The cleaner can still end a clean early by hand; the daily task does it
    // for everyone who doesn't. Both land in the same place.
    if (status === 'completed') await postReviewRequest(enquiryId);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update enquiry.' });
  }
});

// --- Reviews ---------------------------------------------------------------
// Five categories, each out of 5 to one decimal. Their mean is the overall
// rating. "Would use again" is a yes/no deliberately kept out of that mean and
// reported separately as a percentage.
const REVIEW_DIMS = ['quality', 'value', 'timeliness', 'punctuality', 'communication'];
const DIM_COL = {
  quality: 'quality',
  value: 'value_for_money',
  timeliness: 'timeliness',
  punctuality: 'punctuality',
  communication: 'communication',
};

// Posts the system message the customer taps to review. Idempotent: marking a
// clean complete twice must not spam the thread.
async function postReviewRequest(enquiryId) {
  const { rows } = await query(
    `select c.id, cpf.user_id as cleaner_user_id
       from conversations c join cleaner_profiles cpf on cpf.id = c.cleaner_id
      where c.enquiry_id = $1`,
    [enquiryId]
  );
  if (!rows.length) return;
  const { id: convId, cleaner_user_id } = rows[0];
  const dupe = await query("select 1 from messages where conversation_id = $1 and kind = 'review_request'", [convId]);
  if (dupe.rows.length) return;
  await query(
    `insert into messages (conversation_id, sender_user_id, body, kind)
     values ($1, $2, $3, 'review_request')`,
    [convId, cleaner_user_id, 'Your clean is complete. How did it go? Tap here to leave a review.']
  );
  await query('update conversations set last_message_at = now() where id = $1', [convId]);
}

// --- Scheduled tasks -------------------------------------------------------
// Driven by .github/workflows/review-prompts.yml, never by a browser. Compared
// in constant time so the secret can't be recovered a character at a time.
function cronAuthorised(req) {
  const expected = Buffer.from(process.env.CRON_SECRET);
  const given = Buffer.from(req.get('x-cron-secret') || '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Posts the review prompt for every accepted clean whose date has arrived.
//
// `scheduled_on <= current_date` combined with the workflow's 07:00 UTC
// schedule lands the prompt on the evening of the clean itself, New Zealand
// time, while the customer still remembers how it went. Moving that cron
// earlier in the UTC day would fire it before the cleaner has been.
app.post('/api/tasks/post-review-prompts', async (req, res) => {
  if (!process.env.CRON_SECRET)
    return res.status(503).json({ error: 'CRON_SECRET is not set on this server.' });
  if (!cronAuthorised(req)) return res.status(403).json({ error: 'Forbidden.' });
  try {
    const { rows } = await query(
      `select e.id from enquiries e
         join conversations c on c.enquiry_id = e.id
        where e.status = 'accepted'
          and e.scheduled_on is not null
          and e.scheduled_on <= current_date
          and not exists (
            select 1 from messages m
             where m.conversation_id = c.id and m.kind = 'review_request')`
    );
    for (const { id } of rows) {
      await query("update enquiries set status = 'completed' where id = $1", [id]);
      await postReviewRequest(id);
    }
    console.log(`review prompts: posted ${rows.length}`);
    res.json({ prompted: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not post review prompts.' });
  }
});

// Credits any referral whose referred cleaner has now held a paid plan for a
// month. Qualifying happens by the passage of time rather than by an event, so
// something has to come and look - a subscription that quietly ticks past a
// month raises nothing to hook onto.
app.post('/api/tasks/referral-credits', async (req, res) => {
  if (!process.env.CRON_SECRET)
    return res.status(503).json({ error: 'CRON_SECRET is not set on this server.' });
  if (!cronAuthorised(req)) return res.status(403).json({ error: 'Forbidden.' });
  try {
    const credited = await sweepReferralCredits();
    console.log(`referral credits: awarded ${credited}`);
    res.json({ credited, creditCents: REFERRAL_CREDIT_CENTS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not sweep referral credits.' });
  }
});

// --- Nudges: finish your profile, and the pre-launch update -----------------
//
// DRY RUN BY DEFAULT. Nothing is sent unless the caller passes send=1, and
// nothing is recorded unless it actually sent. Emailing real people is not
// undoable, so the default had to be the harmless one - a plain call returns
// exactly who WOULD be mailed and why, which is also what makes it reviewable
// before it ever goes near an inbox.
//
// Each (user, kind) can only ever be sent once - the unique index on nudges
// enforces it even if this endpoint is called twice concurrently.
//
// A grace period keeps this from landing on someone mid-signup: NUDGE_MIN_AGE
// after they created the account, so anyone still working through the wizard is
// left alone.
const NUDGE_MIN_AGE_HOURS = 48;

// Quiet period after ANY nudge or campaign mail. The per-kind unique index stops
// the same message twice; this stops two *different* messages landing on the
// same person back to back - which is what a broadcast run does to whoever was
// nudged that morning. Two emails in one day from a service you signed up to and
// haven't used yet is how you get marked as spam.
//
// It is a cooldown, not an exclusion: they become eligible again once the window
// passes, so a one-off broadcast will simply skip them unless it is re-run later.
// Suppressed people are counted in the report rather than silently dropped.
const NUDGE_COOLDOWN_DAYS = 14;
const RECENTLY_MAILED = `exists (
  select 1 from nudges n2
   where n2.user_id = u.id
     and n2.sent_at > now() - interval '${NUDGE_COOLDOWN_DAYS} days')`;

// Unsubscribe links are signed rather than stored: an HMAC of the user id under
// CRON_SECRET. No column to keep in sync, and a link can't be guessed or
// enumerated from a user id.
function unsubToken(userId) {
  return createHmac('sha256', process.env.CRON_SECRET || '').update(String(userId)).digest('hex').slice(0, 32);
}
function unsubUrlFor(userId) {
  const base = process.env.APP_URL || 'https://matchmaid.co.nz';
  return `${base}/api/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubToken(userId)}`;
}

app.get('/api/unsubscribe', async (req, res) => {
  const { u, t } = req.query;
  const page = (msg) =>
    res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Match Maid</title>
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:12vh auto;padding:0 24px;color:#123b4a">
        <div style="font-size:20px;font-weight:700;margin-bottom:20px">Match&nbsp;Maid</div>
        <p style="font-size:16px;line-height:1.6">${msg}</p>
        <p style="font-size:14px"><a href="/" style="color:#0e9384">Back to matchmaid.co.nz</a></p>
      </div>`);
  if (!process.env.CRON_SECRET) return res.status(503).type('html').send('Unsubscribe is not configured.');
  if (!u || !t) return page('That unsubscribe link is incomplete.');
  const expected = Buffer.from(unsubToken(u));
  const given = Buffer.from(String(t));
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return page('That unsubscribe link is not valid. If you keep getting mail you did not ask for, reply to any of it and we will sort it out.');
  try {
    await query('update users set nudge_opt_out = true where id = $1', [u]);
    return page("You're unsubscribed from Match Maid updates and reminders. You'll still get essential account email - things like a confirmation code, or an enquiry someone has sent you.");
  } catch {
    return res.status(500).type('html').send('Could not process that just now.');
  }
});

// Who is eligible for each nudge. Every segment excludes anyone already sent
// that kind, anyone opted out, removed accounts, and anyone too new.
const NUDGE_SEGMENTS = {
  cleaner_no_rate: `
    select u.id, u.email, u.full_name, u.role from users u
      join cleaner_profiles cp on cp.user_id = u.id
     where u.role = 'cleaner' and u.email_verified and cp.hourly_rate_min is null`,
  // Ordered before the ID nudge on purpose: an unmatched listing is a worse
  // problem than an unbadged one, and the 14-day cooldown means whichever fires
  // first is the only one they hear for a fortnight.
  cleaner_no_availability: `
    select u.id, u.email, u.full_name, u.role from users u
      join cleaner_profiles cp on cp.user_id = u.id
     where u.role = 'cleaner' and u.email_verified
       and cp.listing_status = 'active'
       and not exists (select 1 from availability_rules ar where ar.cleaner_id = cp.id)`,
  cleaner_no_id: `
    select u.id, u.email, u.full_name, u.role from users u
      join cleaner_profiles cp on cp.user_id = u.id
     where u.role = 'cleaner' and u.email_verified
       and cp.listing_status = 'active' and not cp.id_verified`,
  customer_no_suburb: `
    select u.id, u.email, u.full_name, u.role from users u
      join client_profiles lp on lp.user_id = u.id
     where u.role = 'client' and u.email_verified and lp.default_suburb_id is null`,
};

// Returns { ready, cooling } - cooling are people who match the segment but were
// mailed too recently, kept visible so the report never reads as "nobody left"
// when it means "not yet".
async function nudgeCandidates(kind) {
  const base = NUDGE_SEGMENTS[kind];
  if (!base) return { ready: [], cooling: [] };
  const { rows } = await query(
    `${base.replace('select u.id, u.email, u.full_name, u.role',
                    `select u.id, u.email, u.full_name, u.role, ${RECENTLY_MAILED} as cooling`)}
       and u.removed_at is null and u.status = 'active' and not u.nudge_opt_out
       and u.created_at < now() - interval '${NUDGE_MIN_AGE_HOURS} hours'
       and not exists (select 1 from nudges n where n.user_id = u.id and n.kind = $1)
     order by u.created_at`,
    [kind]
  );
  return { ready: rows.filter((r) => !r.cooling), cooling: rows.filter((r) => r.cooling) };
}

app.post('/api/tasks/nudges', async (req, res) => {
  if (!process.env.CRON_SECRET)
    return res.status(503).json({ error: 'CRON_SECRET is not set on this server.' });
  if (!cronAuthorised(req)) return res.status(403).json({ error: 'Forbidden.' });

  const send = String(req.query.send || '') === '1';
  // With no RESEND_API_KEY every send is a logged no-op that still looks like a
  // success. Claiming the nudge rows against that would mark all these people
  // as "already nudged" for good, and they could never be nudged again - a
  // silent, unrecoverable burn. Refuse instead.
  if (send && !emailEnabled())
    return res.status(503).json({ error: 'Email is not configured (RESEND_API_KEY unset) - refusing to send, since it would mark everyone as nudged without sending anything. Dry run works without it.' });
  const only = String(req.query.kind || '').trim();
  const kinds = only ? [only].filter((k) => NUDGE_SEGMENTS[k]) : Object.keys(NUDGE_SEGMENTS);
  if (only && !kinds.length) return res.status(400).json({ error: `Unknown nudge kind "${only}".` });

  try {
    const report = {};
    let sent = 0;
    for (const kind of kinds) {
      const { ready: people, cooling } = await nudgeCandidates(kind);
      report[kind] = {
        eligible: people.length,
        emails: people.map((p) => p.email),
        // Visible, not silently dropped: these are due, just not yet.
        coolingOff: cooling.length,
        coolingEmails: cooling.map((p) => p.email),
      };
      if (!send) continue;
      let ok = 0;
      for (const p of people) {
        // Claim it FIRST. If the send then fails we have burnt one attempt,
        // which is the right way round: a double-send is worse than a miss,
        // and the admin can see it never went out.
        try {
          await query('insert into nudges (user_id, kind) values ($1, $2)', [p.id, kind]);
        } catch { continue; } // already sent by a concurrent run
        const r = await sendNudgeEmail({
          to: p.email, name: p.full_name, kind, unsubUrl: unsubUrlFor(p.id),
        });
        // Belt and braces behind the emailEnabled() guard above: if a send is
        // skipped rather than attempted, give the claim back so this person can
        // still be nudged once email works.
        if (r && r.skipped) { await query('delete from nudges where user_id = $1 and kind = $2', [p.id, kind]); continue; }
        if (r && r.ok) ok++;
      }
      report[kind].sent = ok;
      sent += ok;
    }
    console.log(`nudges: ${send ? `sent ${sent}` : 'dry run'} ${JSON.stringify(report)}`);
    res.json({ dryRun: !send, emailConfigured: emailEnabled(), sent, report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not run nudges.' });
  }
});

// The pre-launch update. A one-off broadcast rather than a funnel nudge, so it
// is its own kind and its own call - and the same dry-run rule applies.
app.post('/api/tasks/prelaunch-update', async (req, res) => {
  if (!process.env.CRON_SECRET)
    return res.status(503).json({ error: 'CRON_SECRET is not set on this server.' });
  if (!cronAuthorised(req)) return res.status(403).json({ error: 'Forbidden.' });
  const send = String(req.query.send || '') === '1';
  if (send && !emailEnabled())
    return res.status(503).json({ error: 'Email is not configured (RESEND_API_KEY unset) - refusing to send, since it would mark everyone as already-updated without sending anything. Dry run works without it.' });
  // Dated, so a later update is a different kind and goes to everyone again
  // rather than being silently swallowed as "already sent".
  const kind = String(req.query.tag || 'prelaunch_2026_08').trim().slice(0, 60);
  try {
    const all = await query(
      `select u.id, u.email, u.full_name, u.role, cp.referral_code, ${RECENTLY_MAILED} as cooling
         from users u
         left join cleaner_profiles cp on cp.user_id = u.id
        where u.role in ('client','cleaner')
          and u.email_verified and u.removed_at is null and u.status = 'active'
          and not u.nudge_opt_out
          and not exists (select 1 from nudges n where n.user_id = u.id and n.kind = $1)
        order by u.role, u.created_at`,
      [kind]
    );
    const rows = all.rows.filter((r) => !r.cooling);
    const cooling = all.rows.filter((r) => r.cooling);
    const report = { kind, eligible: rows.length, cleaners: rows.filter((r) => r.role === 'cleaner').length,
      customers: rows.filter((r) => r.role === 'client').length, emails: rows.map((r) => r.email),
      coolingOff: cooling.length, coolingEmails: cooling.map((r) => r.email) };
    let sent = 0;
    if (send) {
      const base = process.env.APP_URL || 'https://matchmaid.co.nz';
      for (const p of rows) {
        try {
          await query('insert into nudges (user_id, kind) values ($1, $2)', [p.id, kind]);
        } catch { continue; }
        const r = await sendPreLaunchUpdateEmail({
          to: p.email, name: p.full_name, role: p.role,
          referralLink: p.referral_code
            ? `${base}/login?role=maid&mode=signup&ref=${encodeURIComponent(p.referral_code)}`
            : `${base}/for-maids`,
          creditDollars: REFERRAL_CREDIT_CENTS / 100,
          unsubUrl: unsubUrlFor(p.id),
        });
        if (r && r.skipped) { await query('delete from nudges where user_id = $1 and kind = $2', [p.id, kind]); continue; }
        if (r && r.ok) sent++;
      }
    }
    console.log(`prelaunch update: ${send ? `sent ${sent}` : 'dry run'} of ${rows.length}`);
    res.json({ dryRun: !send, emailConfigured: emailEnabled(), sent, report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not run the pre-launch update.' });
  }
});

// Cleans this customer has been asked to review and hasn't. The chat thread is
// where the prompt is posted, but chat is where people arrange a clean, not
// where they go after one — so the dashboard surfaces it on their next visit.
app.get('/api/pending-reviews', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const { rows } = await query(
      `select c.id as conversation_id,
              coalesce(cpf.business_name, cu.full_name) as cleaner_name
         from conversations c
         join client_profiles clp on clp.id = c.client_id
         join cleaner_profiles cpf on cpf.id = c.cleaner_id
         join users cu on cu.id = cpf.user_id
        where clp.user_id = $1
          and exists (
            select 1 from messages m
             where m.conversation_id = c.id and m.kind = 'review_request')
          and not exists (select 1 from reviews r where r.conversation_id = c.id)
        order by c.last_message_at desc`,
      [userId]
    );
    res.json(rows.map((r) => ({ conversationId: r.conversation_id, cleaner: r.cleaner_name })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load pending reviews.' });
  }
});

// Recompute the cleaner's headline numbers from their published reviews.
async function refreshCleanerRating(cleanerId) {
  await query(
    `update cleaner_profiles cp set
       avg_rating   = coalesce((select avg(overall) from reviews r where r.cleaner_id = cp.id and r.status = 'published'), 0),
       review_count = (select count(*) from reviews r where r.cleaner_id = cp.id and r.status = 'published'),
       updated_at   = now()
     where cp.id = $1`,
    [cleanerId]
  );
}

// The reviewer must be the client on that conversation.
async function clientOnConversation(conversationId, userId) {
  const { rows } = await query(
    `select c.id, c.cleaner_id, c.client_id
       from conversations c join client_profiles clp on clp.id = c.client_id
      where c.id = $1 and clp.user_id = $2`,
    [conversationId, userId]
  );
  return rows[0] ?? null;
}

app.get('/api/review', async (req, res) => {
  try {
    const { conversationId, userId } = req.query;
    if (!conversationId || !userId) return res.status(400).json({ error: 'conversationId and userId are required.' });
    if (!(await isParticipant(conversationId, userId))) return res.status(403).json({ error: 'Not your conversation.' });
    const { rows } = await query(
      `select quality, value_for_money, timeliness, punctuality, communication,
              would_use_again, overall, comment
         from reviews where conversation_id = $1`,
      [conversationId]
    );
    if (!rows.length) return res.json({ review: null });
    const r = rows[0];
    res.json({
      review: {
        quality: Number(r.quality),
        value: Number(r.value_for_money),
        timeliness: Number(r.timeliness),
        punctuality: Number(r.punctuality),
        communication: Number(r.communication),
        wouldUseAgain: r.would_use_again,
        overall: Number(r.overall),
        comment: r.comment || '',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load the review.' });
  }
});

app.post('/api/review', async (req, res) => {
  try {
    const { conversationId, userId, wouldUseAgain, comment } = req.body ?? {};
    if (!conversationId || !userId) return res.status(400).json({ error: 'conversationId and userId are required.' });

    const conv = await clientOnConversation(conversationId, userId);
    if (!conv) return res.status(403).json({ error: 'Only the customer on this thread can review it.' });

    // Every category is required, 1–5, rounded to one decimal.
    const scores = {};
    for (const d of REVIEW_DIMS) {
      const n = Number(req.body?.[d]);
      if (!Number.isFinite(n) || n < 1 || n > 5)
        return res.status(400).json({ error: `Please rate ${d} between 1 and 5.` });
      scores[d] = Math.round(n * 10) / 10;
    }
    if (typeof wouldUseAgain !== 'boolean')
      return res.status(400).json({ error: 'Please say whether you would use them again.' });

    const overall = REVIEW_DIMS.reduce((a, d) => a + scores[d], 0) / REVIEW_DIMS.length;
    // Legacy NOT NULL smallint column, constrained to 1..5.
    const legacy = Math.min(5, Math.max(1, Math.round(overall)));
    const text = typeof comment === 'string' ? comment.trim().slice(0, 2000) || null : null;

    await query(
      `insert into reviews (conversation_id, cleaner_id, client_id, rating, overall,
                            quality, value_for_money, timeliness, punctuality, communication,
                            would_use_again, comment)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (conversation_id) do update set
         rating = excluded.rating, overall = excluded.overall,
         quality = excluded.quality, value_for_money = excluded.value_for_money,
         timeliness = excluded.timeliness, punctuality = excluded.punctuality,
         communication = excluded.communication,
         would_use_again = excluded.would_use_again, comment = excluded.comment`,
      [conversationId, conv.cleaner_id, conv.client_id, legacy, overall.toFixed(2),
       scores.quality, scores.value, scores.timeliness, scores.punctuality, scores.communication,
       wouldUseAgain, text]
    );
    await refreshCleanerRating(conv.cleaner_id);
    res.json({ ok: true, overall: Math.round(overall * 10) / 10 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save your review.' });
  }
});

// Per-category averages for a cleaner's public profile.
async function reviewBreakdown(cleanerId) {
  const { rows } = await query(
    `select count(*)::int as n,
            avg(quality) as quality, avg(value_for_money) as value,
            avg(timeliness) as timeliness, avg(punctuality) as punctuality,
            avg(communication) as communication, avg(overall) as overall,
            avg(case when would_use_again then 1.0 else 0.0 end) as again
       from reviews where cleaner_id = $1 and status = 'published'`,
    [cleanerId]
  );
  const r = rows[0];
  if (!r || !r.n) return null;
  const num = (v) => (v == null ? 0 : Math.round(Number(v) * 10) / 10);
  return {
    count: r.n,
    quality: num(r.quality),
    value: num(r.value),
    timeliness: num(r.timeliness),
    punctuality: num(r.punctuality),
    communication: num(r.communication),
    overall: num(r.overall),
    wouldUseAgainPct: r.again == null ? null : Math.round(Number(r.again) * 100),
  };
}

// --- Relevance match ------------------------------------------------------
// Rank active cleaners in a suburb by how well they fit the customer's
// preferences: service coverage, availability overlap, a fair price within the
// budget/rate ranges, and rating. Suburb is the only hard filter (plus any
// requested verification badges). Best-first, relevance falls away gradually.
app.post('/api/match', async (req, res) => {
  try {
    const { suburb, suburbs, services, budgetMin, budgetMax, verif, durationHours, slots, products, baseService } = req.body ?? {};
    // Accept a single suburb or a list (a whole-city search sends all its suburbs).
    const subList = Array.isArray(suburbs) && suburbs.length ? suburbs : suburb ? [suburb] : [];
    if (!subList.length) return res.status(400).json({ error: 'A suburb is required.' });

    const reqServices = Array.isArray(services) ? services.filter(Boolean) : [];
    // The one clean type being booked. Callers send it explicitly; older ones
    // put it first in `services`.
    const wantedBase = BASE_SERVICE_SLUGS.includes(baseService)
      ? baseService
      : reqServices.find((s) => BASE_SERVICE_SLUGS.includes(s)) ?? null;
    const reqVerif = Array.isArray(verif) ? verif.filter(Boolean) : [];
    const sel = (Array.isArray(slots) ? slots : []).filter(
      (s) => SLOT_START[s?.slot] != null && s.day >= 0 && s.day <= 6
    );
    const days = sel.map((s) => s.day);
    const starts = sel.map((s) => SLOT_START[s.slot]);
    const bMin = Number(budgetMin) || 0;
    const bMax = Number(budgetMax) || 9999;
    const duration = Number(durationHours) || 1;

    const sql = `
      select
        cp.id,
        coalesce(cp.business_name, u.full_name) as name,
        -- Whether that name is a trading name or a person's. The card shortens a
        -- person to their first name ("Contact Ana") but must never do that to a
        -- business - "Contact Simply" is not who they are.
        nullif(cp.business_name, '') is not null as is_business,
        cp.hourly_rate, cp.hourly_rate_min, cp.hourly_rate_max, cp.clean_rates,
        cp.avg_rating, cp.review_count, cp.addons,
        cp.id_verified, cp.police_verified, cp.insurance_verified, cp.brings_products,
        cp.service_surcharges,
        (cp.featured_until is not null and cp.featured_until > now()) as is_featured,
        (
          select count(*) from enquiries e
          where e.cleaner_id = cp.id and e.status = 'accepted'
            and (e.scheduled_on is null or e.scheduled_on >= current_date)
        ) as active_load,
        coalesce(array_agg(distinct st.slug) filter (where st.slug is not null), array[]::text[]) as services,
        coalesce(
          array_agg(distinct (ar.day_of_week::text || '|' || to_char(ar.start_time,'HH24:MI')))
            filter (where ar.id is not null),
          array[]::text[]
        ) as matched
      from cleaner_profiles cp
      join users u                   on u.id = cp.user_id
      join cleaner_service_areas csa on csa.cleaner_id = cp.id
      join suburbs s                 on s.id = csa.suburb_id and s.name = any($1)
      left join cleaner_services cs  on cs.cleaner_id = cp.id
      left join service_types st     on st.id = cs.service_type_id
      left join availability_rules ar
        on ar.cleaner_id = cp.id
       and (ar.day_of_week, ar.start_time) in (
           select d, t from unnest($2::int[], $3::time[]) as x(d, t)
       )
      where cp.listing_status = 'active' and u.status = 'active'
      group by cp.id, u.id`;

    const { rows } = await query(sql, [subList, days, starts]);

    const results = rows
      .map((r) => {
        const badges = { id: r.id_verified, police: r.police_verified, insurance: r.insurance_verified };
        if (reqVerif.some((b) => !badges[b])) return null; // must hold requested verifications
        // Needing products is a hard requirement, not a ranking nudge: a cleaner
        // who doesn't bring them simply can't do the job.
        if (products && !r.brings_products) return null;

        // A cleaner "offers" both their base services and their priced extras.
        const addonSlugs = (Array.isArray(r.addons) ? r.addons : []).map((a) => a.slug);
        const offered = [...new Set([...(r.services || []).filter(Boolean), ...addonSlugs])];
        const offeredReq = reqServices.filter((s) => offered.includes(s));
        const serviceScore = reqServices.length ? offeredReq.length / reqServices.length : 0.6;

        const matched = (r.matched || [])
          .map((m) => { const [d, st] = m.split('|'); return { day: Number(d), slot: START_TO_SLOT[st] }; })
          .filter((x) => x.slot);
        const availScore = sel.length ? matched.length / sel.length : 0.6;

        // Price the clean type they actually asked for.
        //
        // hourly_rate_min/max are the band ACROSS a cleaner's clean types, so
        // showing rateMin meant a cleaner charging $45 regular and $65 deep
        // advertised "$45/hr" on a deep-clean search - $20/hr under what they
        // would charge. The per-type fee in clean_rates is the real number.
        //
        // service_surcharges is a dead field: it belonged to an older "base rate
        // plus a specialist surcharge" model, the maid profile form has not
        // written it since per-type fees landed, and adding it on top of a
        // per-type fee double-counts. One legacy row still carries deep:+10 and
        // was producing $40/hr for a cleaner whose rates are $30 and $50 -
        // neither of their actual prices. It is no longer used for pricing.
        const cleanRates = r.clean_rates && typeof r.clean_rates === 'object' ? r.clean_rates : {};
        const feeFor = (slug) => {
          if (!slug) return null;
          // End-of-lease has no fee of its own - it is a capability of the deep
          // clean, priced off the deep rate (see the maid fee form).
          const key = slug === 'end-of-tenancy' ? 'deep' : slug;
          const v = Number(cleanRates[key]);
          return Number.isFinite(v) && v > 0 ? v : null;
        };
        const rawMin = r.hourly_rate_min != null ? Number(r.hourly_rate_min) : r.hourly_rate != null ? Number(r.hourly_rate) : null;
        const rawMax = r.hourly_rate_max != null ? Number(r.hourly_rate_max) : r.hourly_rate != null ? Number(r.hourly_rate) : null;
        // The rate for the selected clean type when they offer it. When they
        // don't, there is no honest single price for it - fall back to their
        // lowest fee and flag it, so the card can say "from" rather than quote a
        // number for work this cleaner doesn't do.
        const exact = feeFor(wantedBase);
        const rateForService = exact != null ? exact : rawMin;
        const rateIsExact = exact != null;
        // Priced extras the customer actually ticked. addons is the only place a
        // per-extra price can live; it is empty for everyone today, so this
        // renders nothing until cleaners can set them again - but it is driven
        // by the data rather than assuming the list stays empty.
        const wantedExtras = reqServices.filter((s) => s !== wantedBase);
        const extraFees = (Array.isArray(r.addons) ? r.addons : [])
          .filter((a) => a && wantedExtras.includes(a.slug) && Number(a.price) > 0)
          .map((a) => ({ slug: a.slug, price: Math.round(Number(a.price)) }));
        const cMin = rateForService != null ? rateForService : rawMin;
        const cMax = rateForService != null ? rateForService : rawMax;
        let fair = null, priceScore = 0.5;
        if (cMin != null && cMax != null) {
          const lo = Math.max(cMin, bMin), hi = Math.min(cMax, bMax);
          if (lo <= hi) { fair = Math.round((lo + hi) / 2); priceScore = 1; }
          else if (cMin > bMax) { fair = cMin; priceScore = Math.max(0, 1 - (cMin - bMax) / bMax); }
          else { fair = cMax; priceScore = 1; }
        }
        const ratingScore = (Number(r.avg_rating) || 0) / 5;
        const score = Math.round(100 * (0.35 * serviceScore + 0.3 * availScore + 0.2 * priceScore + 0.15 * ratingScore));
        const atCapacity = Number(r.active_load) >= CAPACITY_LIMIT;
        return {
          id: r.id,
          name: r.name,
          isBusiness: !!r.is_business,
          atCapacity,
          rateMin: cMin, rateMax: cMax, fair,
          // Hourly fee x hours, plus any flat-priced extras they ticked.
          estCost: fair != null
            ? Math.round(fair * duration) + extraFees.reduce((t, e) => t + e.price, 0)
            : null,
          rating: Number(r.avg_rating) || 0,
          reviews: r.review_count,
          badges, featured: r.is_featured,
          bringsProducts: !!r.brings_products,
          // What this cleaner charges for the clean that was searched for, and
          // whether that is their actual fee for it or a "from" fallback.
          rateForService, rateIsExact, serviceSlug: wantedBase || null,
          extraFees,
          rateBand: rawMin != null && rawMax != null && rawMax > rawMin ? { min: rawMin, max: rawMax } : null,
          services: offered,
          addons: Array.isArray(r.addons) ? r.addons : [],
          offered: offeredReq,
          missing: reqServices.filter((s) => !offered.includes(s)),
          matched,
          score,
          tier: score >= 75 ? 'great' : score >= 50 ? 'good' : 'low',
        };
      })
      .filter(Boolean)
      // Cleaners with spare capacity come before those at capacity, so a busy
      // listing can't keep hoovering up every request — others get a turn.
      .sort((a, b) =>
        Number(a.atCapacity) - Number(b.atCapacity) ||
        b.score - a.score ||
        Number(b.featured) - Number(a.featured) ||
        b.rating - a.rating);

    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Match failed.' });
  }
});

function publicUser({ id, role, full_name, email }) {
  return { id, role, fullName: full_name, email };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Match Maid running →  http://localhost:${PORT}\n`);
});
