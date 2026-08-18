-- Two fixes to new-message email notifications.
--
-- 1. Backfill read_at on everything sent before read-marking existed.
--
-- read_at was in the schema from 001 but nothing wrote it until 2026-08-17
-- 22:13 UTC. Null therefore means "we never looked", not "unread" - and the
-- notifier reads null as unread, so every conversation started before that
-- carries a permanent backlog that suppresses its notifications for good. One
-- real case: a cleaner replied two hours after an enquiry, provably having read
-- it, and it still counted as unread four days later.
--
-- Backfilled to sent_at rather than now(), so the timestamps stay plausible.
update messages
   set read_at = sent_at
 where read_at is null
   and sent_at < timestamptz '2026-08-17 22:13:00+00';

-- 2. Remember when we last emailed about a conversation.
--
-- Suppressing on unread alone means a cleaner who misses the first email never
-- hears about the thread again, however many times the customer follows up.
-- With this, a burst stays quiet but a follow-up the next day gets through.
alter table conversations add column if not exists last_notified_at timestamptz;
