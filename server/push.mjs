// Web push (VAPID): lock-screen alerts for new enquiries and messages.
//
// Push is a BONUS channel, never the only one. Every caller sends email as
// before unless push actually reached at least one of the person's devices AND
// they have chosen "push only" - so a dead subscription, an unset key, or a
// browser that never said yes all land exactly where they did before push
// existed: in the inbox.
//
// Env (all three, or push is switched off and everything falls back to email):
//   VAPID_PUBLIC_KEY   - shared with browsers, served by /api/push/key
//   VAPID_PRIVATE_KEY  - secret, never leaves the server
//   VAPID_CONTACT      - an email the push services can reach us on
//
// The tables are created here on first use rather than by a migrate-*.mjs
// script: a notification feature that 500s because nobody ran a script is the
// exact failure the enquiry chaser hit in November 2026.
import webpush from 'web-push';
import { query } from './db.js';

const PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const CONTACT = process.env.VAPID_CONTACT || '';

let configured = false;
if (PUBLIC && PRIVATE && CONTACT) {
  try {
    webpush.setVapidDetails(CONTACT.startsWith('mailto:') ? CONTACT : `mailto:${CONTACT}`, PUBLIC, PRIVATE);
    configured = true;
  } catch (err) {
    console.error('[push] VAPID keys rejected, push disabled:', err.message);
  }
}

export const pushEnabled = () => configured;
export const vapidPublicKey = () => (configured ? PUBLIC : '');

// Who wants what. 'both' is the default and the recommendation: push is fast,
// email is the record. 'push' still emails whenever no device took the push.
export const CHANNELS = ['both', 'push', 'email'];

let schemaReady = null;
export function ensurePushSchema() {
  schemaReady ??= (async () => {
    await query(`create table if not exists push_subscriptions (
      id bigserial primary key,
      user_id uuid not null references users(id) on delete cascade,
      endpoint text not null unique,
      p256dh text not null,
      auth text not null,
      user_agent text,
      created_at timestamptz not null default now(),
      last_ok_at timestamptz,
      last_error text)`);
    await query('create index if not exists push_subscriptions_user on push_subscriptions(user_id)');
    // One row per attempt, per channel. This is what answers "did the cleaner
    // actually get told?" - before it, the first enquiry email's result was
    // thrown away and a failure was invisible.
    await query(`create table if not exists notification_log (
      id bigserial primary key,
      user_id uuid,
      channel text not null,
      kind text not null,
      conversation_id uuid,
      status text not null,
      detail text,
      created_at timestamptz not null default now())`);
    await query('create index if not exists notification_log_conv on notification_log(conversation_id)');
    await query(`alter table users add column if not exists notify_channel text not null default 'both'`);
  })().catch((err) => { schemaReady = null; throw err; });
  return schemaReady;
}

export async function logNotification({ userId, channel, kind, conversationId = null, status, detail = null }) {
  try {
    await ensurePushSchema();
    await query(
      `insert into notification_log (user_id, channel, kind, conversation_id, status, detail)
       values ($1, $2, $3, $4, $5, $6)`,
      [userId || null, channel, kind, conversationId, status, detail ? String(detail).slice(0, 500) : null]
    );
  } catch (err) {
    // Logging must never be the reason a notification did not go out.
    console.error('[notify] log failed:', err.message);
  }
}

export async function notifyChannel(userId) {
  await ensurePushSchema();
  const { rows } = await query('select notify_channel from users where id = $1', [userId]);
  const c = rows[0]?.notify_channel;
  return CHANNELS.includes(c) ? c : 'both';
}

export async function saveSubscription(userId, sub, userAgent) {
  await ensurePushSchema();
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth || !/^https:\/\//.test(endpoint)) throw new Error('bad subscription');
  // On conflict the device moves to whoever subscribed last: a shared phone
  // that logs in as someone else must stop getting the first person's alerts.
  await query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update
       set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
           user_agent = excluded.user_agent, last_error = null`,
    [userId, endpoint, p256dh, auth, userAgent ? String(userAgent).slice(0, 300) : null]
  );
}

export async function removeSubscription(userId, endpoint) {
  await ensurePushSchema();
  await query('delete from push_subscriptions where user_id = $1 and endpoint = $2', [userId, endpoint]);
}

export async function deviceCount(userId) {
  await ensurePushSchema();
  const { rows } = await query('select count(*)::int as n from push_subscriptions where user_id = $1', [userId]);
  return rows[0].n;
}

// Sends to every device the person has. Resolves { delivered, failed, removed }
// and never throws. "delivered" means the push service accepted it - the same
// meaning "sent" has for email.
//
// Payloads carry no names and no message text. The API trusts a userId from
// the request, so anyone holding a user's id could register a browser against
// it; keeping the lock screen to "new enquiry in Riccarton" means that buys
// them nothing a login does not already gate.
export async function sendPush(userId, { title, body, url, tag }, { kind, conversationId = null } = {}) {
  const result = { delivered: 0, failed: 0, removed: 0 };
  if (!configured || !userId) return result;
  let subs;
  try {
    await ensurePushSchema();
    ({ rows: subs } = await query(
      'select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1', [userId]));
  } catch (err) {
    console.error('[push] could not load subscriptions:', err.message);
    return result;
  }
  const payload = JSON.stringify({ title: title || 'Match Maid', body, url: url || '/', tag });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        // A day is long enough to reach a phone that was off overnight, short
        // enough that a stale alert does not turn up after the thread moved on.
        { TTL: 86400, urgency: 'high' }
      );
      result.delivered += 1;
      await query('update push_subscriptions set last_ok_at = now(), last_error = null where id = $1', [s.id]);
      await logNotification({ userId, channel: 'push', kind, conversationId, status: 'sent' });
    } catch (err) {
      const code = err?.statusCode;
      // 404/410: the browser has thrown this subscription away (uninstalled,
      // permission revoked, data cleared). It will never work again.
      if (code === 404 || code === 410) {
        result.removed += 1;
        await query('delete from push_subscriptions where id = $1', [s.id]).catch(() => {});
        await logNotification({ userId, channel: 'push', kind, conversationId, status: 'gone', detail: `HTTP ${code}` });
      } else {
        result.failed += 1;
        const detail = code ? `HTTP ${code} ${err.body || ''}` : String(err?.message || err);
        await query('update push_subscriptions set last_error = $2 where id = $1', [s.id, detail.slice(0, 300)]).catch(() => {});
        await logNotification({ userId, channel: 'push', kind, conversationId, status: 'failed', detail });
      }
    }
  }));
  return result;
}

// The one decision every caller needs: push per preference, then whether email
// still has to go. Email is skipped only when the person asked for push only
// AND a device actually took it.
export async function pushThenDecideEmail(userId, message, meta) {
  let channel = 'both';
  try { channel = await notifyChannel(userId); } catch {}
  const push = channel === 'email' ? { delivered: 0, failed: 0, removed: 0 } : await sendPush(userId, message, meta);
  const needEmail = channel !== 'push' || push.delivered === 0;
  return { channel, push, needEmail };
}
