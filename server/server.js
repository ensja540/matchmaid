// Match Maid mock server: serves the static landing page and a small API
// backed by the real Postgres database (maid/customer signup + login, and
// the core cleaner search).
// deploy: v44 site feedback widget -> /admin (2026-07-08).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { emailEnabled, makeCode, sendVerificationEmail, sendEnquiryEmail } from './email.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..'); // project root holds index.html etc.

const app = express();
app.use(express.json({ limit: '8mb' })); // room for base64 photos + ID documents
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

// Called after a verification is approved. Idempotent: the credit is only
// stamped when credited_at is still null, so re-approving can't pay twice.
// The credit lands as soon as the referred cleaner is ID-verified — the police
// check and insurance are no longer required to earn it.
async function awardReferralIfIdVerified(cleanerId) {
  const { rows } = await query(
    'select id_verified from cleaner_profiles where id = $1',
    [cleanerId]
  );
  if (!rows[0]?.id_verified) return;
  await query(
    `update referrals set credit_cents = $2, credited_at = now()
      where referred_cleaner_id = $1 and credited_at is null`,
    [cleanerId, REFERRAL_CREDIT_CENTS]
  );
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

// Shared slot model (must match the front end).
// Days: 0=Mon … 6=Sun. Three slots per day.
const SLOT_START = { morning: '08:00', afternoon: '12:00', evening: '17:00' };
const SLOT_END = { morning: '12:00', afternoon: '17:00', evening: '21:00' };
const START_TO_SLOT = { '08:00': 'morning', '12:00': 'afternoon', '17:00': 'evening' };

// --- Auth: register ---------------------------------------------------------
app.post('/api/register', async (req, res) => {
  try {
    const { role, fullName, email, password, referralCode } = req.body ?? {};
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
    const { rows } = await query(
      `insert into users (email, role, full_name, password_hash, email_verified, verify_code, verify_expires)
       values ($1, $2, $3, $4, $5, $6, ${gateOn ? "now() + interval '15 minutes'" : 'null'})
       returning id, role, full_name, email`,
      [email.toLowerCase().trim(), dbRole, fullName.trim(), password_hash, !gateOn, code]
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
    const { credential, role, reactivate } = req.body ?? {};
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
      // No account on THIS side yet. One on the other side is irrelevant: the
      // unique index is on (email, role), so this insert stands on its own.
      // No password login for Google accounts — store an unusable random hash.
      const hash = await bcrypt.hash('google-' + credential.slice(0, 24) + Date.now(), 10);
      // Google already verified this address, so the account is confirmed on
      // creation — no code step for Google sign-ups.
      ({ rows } = await query(
        `insert into users (email, role, full_name, password_hash, email_verified)
         values ($1, $2, $3, $4, true) returning id, role, full_name, email`,
        [email, dbRole, info.name || email.split('@')[0], hash]
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
app.get('/api/suburbs', async (_req, res) => {
  const { rows } = await query('select id, name from suburbs order by name');
  res.json(rows);
});

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
    const areas = await query(
      `select s.name from cleaner_service_areas csa join suburbs s on s.id = csa.suburb_id where csa.cleaner_id = $1`,
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
      areas: areas.rows.map((r) => r.name),
      fullName: cp.full_name,
      email: cp.email,
      residentialAddress: cp.residential_address || '',
      cleanRates: cp.clean_rates && typeof cp.clean_rates === 'object' ? cp.clean_rates : {},
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load profile.' });
  }
});

app.put('/api/profile', async (req, res) => {
  try {
    const { userId, businessName, bio, years, rate, rateMin, rateMax, services, addons, areas, badges, listingStatus, bringsProducts, photo, serviceSurcharges, cleanRates, bondGuaranteed, endOfLease, productsOption, payments, residentialAddress, fullName } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const cleanerId = await cleanerIdForUser(userId);
    if (!cleanerId) return res.status(404).json({ error: 'No cleaner profile for that user.' });

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
         clean_rates = coalesce($14, clean_rates), updated_at = now()
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
    if (Array.isArray(areas)) {
      await query('delete from cleaner_service_areas where cleaner_id = $1', [cleanerId]);
      for (const name of areas) {
        await query(
          `insert into cleaner_service_areas (cleaner_id, suburb_id)
           select $1, id from suburbs where name = $2 limit 1 on conflict do nothing`,
          [cleanerId, name]
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
              s.name as suburb
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
    const { userId, fullName, email, phone, suburb, address, notes, bedrooms, bathrooms, homeType, stairs, pets, needsProducts, storeys, photo } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    await ensureClientProfile(userId);
    await query(
      `update users set full_name = coalesce($2, full_name),
              email = coalesce($3, email), updated_at = now() where id = $1`,
      [userId, fullName ?? null, email ? email.toLowerCase().trim() : null]
    );
    const sub = suburb ? await query('select id from suburbs where name = $1 limit 1', [suburb]) : { rows: [] };
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
      `select distinct on (type) type, status, extracted_text from verifications where cleaner_id = $1 order by type, created_at desc`,
      [cleanerId]
    );
    const submitted = Object.fromEntries(subRows.rows.map((r) => [r.type, r.status]));
    const ocr = Object.fromEntries(subRows.rows.map((r) => [r.type, r.extracted_text]));
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
    res.json({ ...status, read });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load verifications.' });
  }
});

app.post('/api/verification', async (req, res) => {
  try {
    const { userId, type, documentDataUrl, extractedText } = req.body ?? {};
    if (!userId || !VERIF_TYPES.includes(type)) return res.status(400).json({ error: 'userId and a valid type are required.' });
    if (!documentDataUrl) return res.status(400).json({ error: 'Please attach a document.' });
    const cleanerId = await cleanerIdForUser(userId);
    if (!cleanerId) return res.status(404).json({ error: 'No cleaner profile for that user.' });
    // OCR text is scanned in the maid's browser (keeps this endpoint — and the
    // server — safe from malformed-image decode crashes) and stored to aid review.
    const text = typeof extractedText === 'string' ? extractedText.replace(/[ \t]+\n/g, '\n').trim().slice(0, 2000) || null : null;
    // One active submission per type: clear old, insert fresh as pending.
    await query('delete from verifications where cleaner_id = $1 and type = $2', [cleanerId, type]);
    await query(
      `insert into verifications (cleaner_id, type, status, document_url, provider, extracted_text)
       values ($1, $2, 'pending', $3, 'self-upload', $4)`,
      [cleanerId, type, documentDataUrl, text]
    );
    res.json({ ok: true, status: 'pending', read: text ? text.slice(0, 160) : '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit document.' });
  }
});

// --- Admin: review uploaded verification documents --------------------------
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'ensor.jack@gmail.com').toLowerCase();
async function isAdmin(userId) {
  if (!userId) return false;
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
      `select v.id, v.type, v.status, v.document_url, v.extracted_text,
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
        where v.status = 'pending'
        order by v.created_at`
    );
    res.json(rows.map((r) => ({
      id: r.id, type: r.type, documentUrl: r.document_url, extractedText: r.extracted_text || '',
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
    const v = await query('select cleaner_id, type from verifications where id = $1', [id]);
    if (!v.rows.length) return res.status(404).json({ error: 'No such verification.' });
    const { cleaner_id, type } = v.rows[0];
    if (decision === 'approve') {
      await query("update verifications set status = 'verified', verified_at = now() where id = $1", [id]);
      const col = VERIF_COL[type];
      if (col) await query(`update cleaner_profiles set ${col} = true where id = $1`, [cleaner_id]);
      // ID verification is all it takes to earn the referrer their credit.
      await awardReferralIfIdVerified(cleaner_id);
    } else {
      await query("update verifications set status = 'failed' where id = $1", [id]);
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
              cp.hourly_rate_min, cp.hourly_rate_max, cp.avg_rating, cp.review_count, cp.addons,
              cp.id_verified, cp.police_verified, cp.insurance_verified, cp.brings_products,
              cp.service_surcharges, cp.profile_photo_url
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
      bio: cp.bio || '',
      years: cp.years_experience,
      rateMin: cp.hourly_rate_min != null ? Number(cp.hourly_rate_min) : null,
      rateMax: cp.hourly_rate_max != null ? Number(cp.hourly_rate_max) : null,
      rating: Number(cp.avg_rating) || 0,
      reviews: cp.review_count,
      badges: { id: cp.id_verified, police: cp.police_verified, insurance: cp.insurance_verified },
      bringsProducts: !!cp.brings_products,
      serviceSurcharges: Array.isArray(cp.service_surcharges) ? cp.service_surcharges : [],
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
    if (!conversationId) {
      const svc = serviceSlug ? await query('select id from service_types where slug = $1', [serviceSlug]) : { rows: [] };
      const sub = suburb ? await query('select id from suburbs where name = $1 limit 1', [suburb]) : { rows: [] };
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
      `select c.id, c.cleaner_id, c.client_id, c.last_message_at,
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
        cp.hourly_rate, cp.hourly_rate_min, cp.hourly_rate_max,
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

        // A specialist clean can carry a per-hour surcharge. Fold it into the
        // rate BEFORE scoring, otherwise a cleaner with a big deep-clean
        // surcharge would rank as though they were cheap.
        const surcharges = Array.isArray(r.service_surcharges) ? r.service_surcharges : [];
        const surcharge = wantedBase
          ? Number(surcharges.find((s) => s.slug === wantedBase)?.extra) || 0
          : 0;
        const rawMin = r.hourly_rate_min != null ? Number(r.hourly_rate_min) : r.hourly_rate != null ? Number(r.hourly_rate) : null;
        const rawMax = r.hourly_rate_max != null ? Number(r.hourly_rate_max) : r.hourly_rate != null ? Number(r.hourly_rate) : null;
        const cMin = rawMin != null ? rawMin + surcharge : null;
        const cMax = rawMax != null ? rawMax + surcharge : null;
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
          atCapacity,
          rateMin: cMin, rateMax: cMax, fair,
          estCost: fair != null ? Math.round(fair * duration) : null,
          rating: Number(r.avg_rating) || 0,
          reviews: r.review_count,
          badges, featured: r.is_featured,
          bringsProducts: !!r.brings_products,
          // baseRate is the advertised hourly; surcharge is what this clean type
          // adds on top. rateMin/rateMax/fair already include it.
          baseRate: rawMin,
          surcharge,
          surchargeService: surcharge > 0 ? wantedBase : null,
          serviceSurcharges: surcharges,
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
