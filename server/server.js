// Match Maid mock server: serves the static landing page and a small API
// backed by the real Postgres database (maid/customer signup + login, and
// the core cleaner search).
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
app.use(express.static(publicDir));

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
      return res.status(409).json({ error: 'That email is already registered.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

// --- Auth: login ------------------------------------------------------------
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
    if (user.role !== dbRole)
      return res.status(403).json({ error: `That account is a ${user.role}, not a ${role}.` });

    res.json({ user: publicUser(user) });
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

// --- Relevance match ------------------------------------------------------
// Rank cleaners in a suburb/service by how well they fit the customer's
// preferences. Nothing is hard-filtered out (except suburb+service, which are
// the basic must-haves): we score by availability overlap, price closeness and
// rating, then sort best-first so relevance "falls away" gradually.
app.post('/api/match', async (req, res) => {
  try {
    const { suburb, service, desiredRate, durationHours, slots } = req.body ?? {};
    if (!suburb || !service)
      return res.status(400).json({ error: 'Suburb and service are required.' });

    const sel = (Array.isArray(slots) ? slots : []).filter(
      (s) => SLOT_START[s?.slot] != null && s.day >= 0 && s.day <= 6
    );
    const days = sel.map((s) => s.day);
    const starts = sel.map((s) => SLOT_START[s.slot]);

    const sql = `
      select
        cp.id,
        coalesce(cp.business_name, u.full_name) as name,
        cp.hourly_rate,
        cp.avg_rating,
        cp.review_count,
        cp.id_verified, cp.police_verified, cp.insurance_verified,
        (cp.featured_until is not null and cp.featured_until > now()) as is_featured,
        coalesce(
          array_agg(distinct (ar.day_of_week::text || '|' || to_char(ar.start_time,'HH24:MI')))
            filter (where ar.id is not null),
          array[]::text[]
        ) as matched
      from cleaner_profiles cp
      join users u                   on u.id = cp.user_id
      join cleaner_service_areas csa on csa.cleaner_id = cp.id
      join suburbs s                 on s.id = csa.suburb_id
      join cleaner_services cs       on cs.cleaner_id = cp.id
      join service_types st          on st.id = cs.service_type_id
      left join availability_rules ar
        on ar.cleaner_id = cp.id
       and (ar.day_of_week, ar.start_time) in (
           select d, t from unnest($3::int[], $4::time[]) as x(d, t)
       )
      where cp.listing_status = 'active'
        and s.name  = $1
        and st.slug = $2
      group by cp.id, u.id`;

    const { rows } = await query(sql, [suburb, service, days, starts]);

    const desired = Number(desiredRate) || null;
    const duration = Number(durationHours) || 1;
    const reqCount = sel.length || 1;

    const results = rows
      .map((r) => {
        const matched = (r.matched || [])
          .map((m) => {
            const [d, st] = m.split('|');
            return { day: Number(d), slot: START_TO_SLOT[st] };
          })
          .filter((x) => x.slot);
        const rate = r.hourly_rate != null ? Number(r.hourly_rate) : null;

        const availScore = sel.length ? matched.length / reqCount : 0.6;
        let priceScore;
        if (rate == null || desired == null) priceScore = 0.5;
        else if (rate <= desired) priceScore = 1;
        else priceScore = Math.max(0, 1 - (rate - desired) / desired);
        const ratingScore = (Number(r.avg_rating) || 0) / 5;

        const score = Math.round(100 * (0.5 * availScore + 0.3 * priceScore + 0.2 * ratingScore));
        return {
          id: r.id,
          name: r.name,
          hourlyRate: rate,
          estCost: rate != null ? Math.round(rate * duration) : null,
          rating: Number(r.avg_rating) || 0,
          reviews: r.review_count,
          badges: { id: r.id_verified, police: r.police_verified, insurance: r.insurance_verified },
          featured: r.is_featured,
          matched,
          matchedCount: matched.length,
          requestedCount: sel.length,
          score,
          tier: score >= 75 ? 'great' : score >= 50 ? 'good' : 'low',
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(b.featured) - Number(a.featured) ||
          b.rating - a.rating
      );

    res.json({ requestedSlots: sel, results });
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
