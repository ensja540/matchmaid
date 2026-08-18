// Non-destructive, idempotent: backfills read_at on pre-feature messages and
// adds conversations.last_notified_at.
//
//   cd server && node migrate-message-notifications.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query, pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));

const before = (await query(
  `select count(*)::int total, count(*) filter (where read_at is null)::int unread from messages`
)).rows[0];

await query(await readFile(join(here, 'migrations', '010_message_notifications.sql'), 'utf8'));

const after = (await query(
  `select count(*)::int total, count(*) filter (where read_at is null)::int unread from messages`
)).rows[0];
console.log(`messages: ${after.total} total`);
console.log(`unread: ${before.unread} -> ${after.unread} (backfilled ${before.unread - after.unread} that predate read tracking)`);

const col = (await query(
  `select count(*)::int n from information_schema.columns
    where table_name = 'conversations' and column_name = 'last_notified_at'`
)).rows[0].n;
console.log('conversations.last_notified_at present:', col === 1);

await pool.end();
