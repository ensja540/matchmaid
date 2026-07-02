// Match Maid mock server: serves the static landing page and a small API
// backed by the real Postgres database (maid/customer signup + login, and
// the core cleaner search).
// deploy: v7 — force redeploy so root-level static changes ship (2026-07-02).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..'); // project root holds index.html etc.

const app = express();
app.use(express.json());
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

// "maid" is the customer-facing word for a cleaner; the DB uses 'cleaner'.
const ROLE_MAP = { maid: 'cleaner', customer: 'client' };

// Shared slot model (must match the front end).
// Days: 0=Mon … 6=Sun. Three slots per day.
const SLOT_START = { am: '08:00', lunch: '12:00', pm: '14:00' };
const SLOT_END = { am: '12:00', lunch: '14:00', pm: '18:00' };
const START_TO_SLOT = { '08:00': 'am', '12:00': 'lunch', '14:00': 'pm' };

// --- Auth: register ---------------------------------------------------------
app.post('/api/register', async (req, res) => {
  try {
    const { role, fullName, email, password } = req.body ?? {};
    const dbRole = ROLE_MAP[role];
    if (!dbRole) return res.status(400).json({ error: 'Choose maid or customer.' });
    if (!fullName || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are all required.' });

    const password_hash = await bcrypt.hash(password, 10);

    const { rows } = await query(
      `insert into users (email, role, full_name, password_hash)
       values ($1, $2, $3, $4)
       returning id, role, full_name, email`,
      [email.toLowerCase().trim(), dbRole, fullName.trim(), password_hash]
    );
    const user = rows[0];

    // Give them the matching empty profile so the rest of the app is coherent.
    if (dbRole === 'cleaner') {
      await query('insert into cleaner_profiles (user_id) values ($1)', [user.id]);
    } else {
      await query('insert into client_profiles (user_id) values ($1)', [user.id]);
    }

    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({
        error: 'That email already has a Match Maid account — just log in, and you can use both the maid and hirer sides.',
      });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

// --- Auth: login ------------------------------------------------------------
// One account (one email + password) can use BOTH sides. We authenticate on
// email + password, then make sure the profile for whichever side they're
// logging into exists — so the same login reaches the maid portal and the
// hirer portal, while the two portals themselves stay separate.
async function ensureProfile(userId, dbRole) {
  const table = dbRole === 'cleaner' ? 'cleaner_profiles' : 'client_profiles';
  const { rows } = await query(`select 1 from ${table} where user_id = $1`, [userId]);
  if (!rows.length) await query(`insert into ${table} (user_id) values ($1)`, [userId]);
}

app.post('/api/login', async (req, res) => {
  try {
    const { role, email, password } = req.body ?? {};
    const dbRole = ROLE_MAP[role];
    if (!dbRole) return res.status(400).json({ error: 'Choose maid or customer.' });
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const { rows } = await query(
      'select id, role, full_name, email, password_hash from users where email = $1',
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    const ok = user && user.password_hash && (await bcrypt.compare(password, user.password_hash));
    if (!ok) return res.status(401).json({ error: 'Wrong email or password.' });

    // Provision the side they're logging into; the same account can be both.
    await ensureProfile(user.id, dbRole);
    res.json({ user: publicUser({ ...user, role: dbRole }) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
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
    sql = sql.replace(/:suburb/g, '$1').replace(/:service/g, '$2');
    const { rows } = await query(sql, [suburb, service]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed.' });
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
              cp.id_verified, cp.police_verified, cp.insurance_verified,
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
      badges: { id: cp.id_verified, police: cp.police_verified, insurance: cp.insurance_verified },
      services: svc.rows.map((r) => r.slug),
      areas: areas.rows.map((r) => r.name),
      fullName: cp.full_name,
      email: cp.email,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load profile.' });
  }
});

app.put('/api/profile', async (req, res) => {
  try {
    const { userId, businessName, bio, years, rateMin, rateMax, services, areas, badges, listingStatus } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const cleanerId = await cleanerIdForUser(userId);
    if (!cleanerId) return res.status(404).json({ error: 'No cleaner profile for that user.' });

    const min = rateMin != null && rateMin !== '' ? Number(rateMin) : null;
    const max = rateMax != null && rateMax !== '' ? Number(rateMax) : null;
    const mid = min != null && max != null ? (min + max) / 2 : min ?? max ?? null;

    await query(
      `update cleaner_profiles set
         business_name = $2, bio = $3, years_experience = $4,
         hourly_rate_min = $5, hourly_rate_max = $6, hourly_rate = $7,
         id_verified = $8, police_verified = $9, insurance_verified = $10,
         listing_status = coalesce($11, listing_status), updated_at = now()
       where id = $1`,
      [
        cleanerId, businessName ?? null, bio ?? null, Number.isFinite(+years) ? +years : null,
        min, max, mid, !!badges?.id, !!badges?.police, !!badges?.insurance, listingStatus ?? null,
      ]
    );

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

// --- Relevance match ------------------------------------------------------
// Rank active cleaners in a suburb by how well they fit the customer's
// preferences: service coverage, availability overlap, a fair price within the
// budget/rate ranges, and rating. Suburb is the only hard filter (plus any
// requested verification badges). Best-first, relevance falls away gradually.
app.post('/api/match', async (req, res) => {
  try {
    const { suburb, services, budgetMin, budgetMax, verif, durationHours, slots } = req.body ?? {};
    if (!suburb) return res.status(400).json({ error: 'A suburb is required.' });

    const reqServices = Array.isArray(services) ? services.filter(Boolean) : [];
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
        cp.avg_rating, cp.review_count,
        cp.id_verified, cp.police_verified, cp.insurance_verified,
        (cp.featured_until is not null and cp.featured_until > now()) as is_featured,
        coalesce(array_agg(distinct st.slug) filter (where st.slug is not null), array[]::text[]) as services,
        coalesce(
          array_agg(distinct (ar.day_of_week::text || '|' || to_char(ar.start_time,'HH24:MI')))
            filter (where ar.id is not null),
          array[]::text[]
        ) as matched
      from cleaner_profiles cp
      join users u                   on u.id = cp.user_id
      join cleaner_service_areas csa on csa.cleaner_id = cp.id
      join suburbs s                 on s.id = csa.suburb_id and s.name = $1
      left join cleaner_services cs  on cs.cleaner_id = cp.id
      left join service_types st     on st.id = cs.service_type_id
      left join availability_rules ar
        on ar.cleaner_id = cp.id
       and (ar.day_of_week, ar.start_time) in (
           select d, t from unnest($2::int[], $3::time[]) as x(d, t)
       )
      where cp.listing_status = 'active'
      group by cp.id, u.id`;

    const { rows } = await query(sql, [suburb, days, starts]);

    const results = rows
      .map((r) => {
        const badges = { id: r.id_verified, police: r.police_verified, insurance: r.insurance_verified };
        if (reqVerif.some((b) => !badges[b])) return null; // must hold requested verifications

        const offered = (r.services || []).filter(Boolean);
        const offeredReq = reqServices.filter((s) => offered.includes(s));
        const serviceScore = reqServices.length ? offeredReq.length / reqServices.length : 0.6;

        const matched = (r.matched || [])
          .map((m) => { const [d, st] = m.split('|'); return { day: Number(d), slot: START_TO_SLOT[st] }; })
          .filter((x) => x.slot);
        const availScore = sel.length ? matched.length / sel.length : 0.6;

        const cMin = r.hourly_rate_min != null ? Number(r.hourly_rate_min) : r.hourly_rate != null ? Number(r.hourly_rate) : null;
        const cMax = r.hourly_rate_max != null ? Number(r.hourly_rate_max) : r.hourly_rate != null ? Number(r.hourly_rate) : null;
        let fair = null, priceScore = 0.5;
        if (cMin != null && cMax != null) {
          const lo = Math.max(cMin, bMin), hi = Math.min(cMax, bMax);
          if (lo <= hi) { fair = Math.round((lo + hi) / 2); priceScore = 1; }
          else if (cMin > bMax) { fair = cMin; priceScore = Math.max(0, 1 - (cMin - bMax) / bMax); }
          else { fair = cMax; priceScore = 1; }
        }
        const ratingScore = (Number(r.avg_rating) || 0) / 5;
        const score = Math.round(100 * (0.35 * serviceScore + 0.3 * availScore + 0.2 * priceScore + 0.15 * ratingScore));
        return {
          id: r.id,
          name: r.name,
          rateMin: cMin, rateMax: cMax, fair,
          estCost: fair != null ? Math.round(fair * duration) : null,
          rating: Number(r.avg_rating) || 0,
          reviews: r.review_count,
          badges, featured: r.is_featured,
          services: offered,
          offered: offeredReq,
          missing: reqServices.filter((s) => !offered.includes(s)),
          matched,
          score,
          tier: score >= 75 ? 'great' : score >= 50 ? 'good' : 'low',
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || Number(b.featured) - Number(a.featured) || b.rating - a.rating);

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
