// Match Maid mock server: serves the static landing page and a small API
// backed by the real Postgres database (maid/customer signup + login, and
// the core cleaner search).
// deploy: v29 — official enquiry modal (structured first contact) (2026-07-03).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from './db.js';

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

// "maid" is the customer-facing word for a cleaner; the DB uses 'cleaner'.
const ROLE_MAP = { maid: 'cleaner', customer: 'client' };

// Shared slot model (must match the front end).
// Days: 0=Mon … 6=Sun. Three slots per day.
const SLOT_START = { morning: '08:00', afternoon: '12:00', evening: '17:00' };
const SLOT_END = { morning: '12:00', afternoon: '17:00', evening: '21:00' };
const START_TO_SLOT = { '08:00': 'morning', '12:00': 'afternoon', '17:00': 'evening' };

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
              cp.avg_rating, cp.review_count,
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
      avgRating: Number(cp.avg_rating) || 0,
      reviews: cp.review_count || 0,
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
    const { userId, businessName, bio, years, rate, rateMin, rateMax, services, areas, badges, listingStatus } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const cleanerId = await cleanerIdForUser(userId);
    if (!cleanerId) return res.status(404).json({ error: 'No cleaner profile for that user.' });

    // Maids now set a single hourly rate; we mirror it into min/max/mid so the
    // match + display keep working (and legacy min/max are still accepted).
    const single = rate != null && rate !== '' ? Number(rate) : null;
    const min = single != null ? single : rateMin != null && rateMin !== '' ? Number(rateMin) : null;
    const max = single != null ? single : rateMax != null && rateMax !== '' ? Number(rateMax) : null;
    const mid = single != null ? single : min != null && max != null ? (min + max) / 2 : min ?? max ?? null;

    // Note: verified badges are NOT set here — they're earned by submitting a
    // document (see /api/verification) and being approved, not self-claimed.
    await query(
      `update cleaner_profiles set
         business_name = $2, bio = $3, years_experience = $4,
         hourly_rate_min = $5, hourly_rate_max = $6, hourly_rate = $7,
         listing_status = coalesce($8, listing_status), updated_at = now()
       where id = $1`,
      [
        cleanerId, businessName ?? null, bio ?? null, Number.isFinite(+years) ? +years : null,
        min, max, mid, listingStatus ?? null,
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
    const { userId, fullName, email, phone, suburb, address, notes, bedrooms, bathrooms, homeType, stairs, pets, storeys, photo } = req.body ?? {};
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
         profile_photo_url = coalesce($12, profile_photo_url)
       where user_id = $1`,
      [userId, sub.rows[0]?.id ?? null, address ?? null, notes ?? null, phone ?? null,
       bedrooms ?? null, bathrooms ?? null, homeType ?? null, !!stairs, !!pets, storeys ?? null, photo || null]
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

// --- Cleaner directory (for the messages picker) ---------------------------
app.get('/api/directory', async (_req, res) => {
  try {
    const { rows } = await query(
      `select cp.id, coalesce(cp.business_name, u.full_name) as name,
              cp.hourly_rate_min, cp.hourly_rate_max, cp.avg_rating, cp.review_count,
              cp.id_verified, cp.police_verified, cp.insurance_verified,
              coalesce(array_agg(distinct s.name) filter (where s.name is not null), array[]::text[]) as areas
         from cleaner_profiles cp
         join users u on u.id = cp.user_id
         left join cleaner_service_areas csa on csa.cleaner_id = cp.id
         left join suburbs s on s.id = csa.suburb_id
        where cp.listing_status = 'active'
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
              cp.hourly_rate_min, cp.hourly_rate_max, cp.avg_rating, cp.review_count,
              cp.id_verified, cp.police_verified, cp.insurance_verified, cp.profile_photo_url
         from cleaner_profiles cp join users u on u.id = cp.user_id
        where cp.id = $1`,
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
      photo: cp.profile_photo_url || '',
      services: svc.rows.map((r) => r.name),
      areas: areas.rows.map((r) => r.name),
      availability: av.rows.map((r) => ({ day: r.day_of_week, slot: START_TO_SLOT[r.start] })).filter((x) => x.slot),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load profile.' });
  }
});

// --- Enquiries + messaging (real, cross-device) ----------------------------
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
              case when nullif(cpf.business_name, '') is not null
                   then split_part(cu.full_name, ' ', 1) || ' from ' || cpf.business_name
                   else cu.full_name end as cleaner_name,
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
    res.json(rows.map((r) => ({
      id: r.id,
      with: r.cleaner_user_id === userId ? r.client_name : r.cleaner_name,
      cleanerId: r.cleaner_id,
      lastBody: r.last_body || 'New conversation',
      lastAt: r.last_at || '',
    })));
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
      `select sender_user_id, body, to_char(sent_at, 'Dy HH24:MI') as at
         from messages where conversation_id = $1 order by sent_at`,
      [conversationId]
    );
    res.json({ messages: rows.map((m) => ({ from: m.sender_user_id === userId ? 'me' : 'them', body: m.body, at: m.at })) });
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

// Cleaner accepts / declines / responds to an enquiry.
app.post('/api/enquiry-status', async (req, res) => {
  try {
    const { enquiryId, userId, status } = req.body ?? {};
    const allowed = ['new', 'responded', 'accepted', 'declined', 'closed'];
    if (!enquiryId || !userId || !allowed.includes(status))
      return res.status(400).json({ error: 'enquiryId, userId and a valid status are required.' });
    const auth = await query(
      `select 1 from enquiries e join cleaner_profiles cpf on cpf.id = e.cleaner_id
        where e.id = $1 and cpf.user_id = $2`,
      [enquiryId, userId]
    );
    if (!auth.rows.length) return res.status(403).json({ error: 'Not your enquiry.' });
    await query(
      `update enquiries set status = $2::enquiry_status,
              responded_at = case when $2::enquiry_status <> 'new' then now() else responded_at end
        where id = $1`,
      [enquiryId, status]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update enquiry.' });
  }
});

// --- Relevance match ------------------------------------------------------
// Rank active cleaners in a suburb by how well they fit the customer's
// preferences: service coverage, availability overlap, a fair price within the
// budget/rate ranges, and rating. Suburb is the only hard filter (plus any
// requested verification badges). Best-first, relevance falls away gradually.
app.post('/api/match', async (req, res) => {
  try {
    const { suburb, suburbs, services, budgetMin, budgetMax, verif, durationHours, slots } = req.body ?? {};
    // Accept a single suburb or a list (a whole-city search sends all its suburbs).
    const subList = Array.isArray(suburbs) && suburbs.length ? suburbs : suburb ? [suburb] : [];
    if (!subList.length) return res.status(400).json({ error: 'A suburb is required.' });

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
      join suburbs s                 on s.id = csa.suburb_id and s.name = any($1)
      left join cleaner_services cs  on cs.cleaner_id = cp.id
      left join service_types st     on st.id = cs.service_type_id
      left join availability_rules ar
        on ar.cleaner_id = cp.id
       and (ar.day_of_week, ar.start_time) in (
           select d, t from unnest($2::int[], $3::time[]) as x(d, t)
       )
      where cp.listing_status = 'active'
      group by cp.id, u.id`;

    const { rows } = await query(sql, [subList, days, starts]);

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
