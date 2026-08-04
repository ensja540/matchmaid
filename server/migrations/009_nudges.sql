-- Record of every nudge email sent, so nobody is nudged twice for the same
-- thing. The uniqueness is the whole point: without it a daily cron re-sends
-- the same "finish your profile" mail every morning until the person either
-- finishes or reports us as spam.
create table if not exists nudges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null,
  sent_at    timestamptz not null default now(),
  unique (user_id, kind)
);

create index if not exists nudges_user_idx on nudges (user_id);

-- A functional unsubscribe is required of a commercial electronic message
-- under the NZ Unsolicited Electronic Messages Act 2007, and is the right
-- default regardless. Opting out stops nudges and campaign mail; it never
-- stops transactional mail (email confirmation, an enquiry someone sent you),
-- which is not what this flag governs.
alter table users add column if not exists nudge_opt_out boolean not null default false;
