-- The cleaner's review of the household, after a clean.
--
-- A separate table from `reviews` rather than a direction column on it,
-- because the two are not the same shape. A household is not rated on quality
-- of clean, value for money or punctuality; the only questions worth asking a
-- cleaner are how it went and whether they would go back. Forcing both into one
-- table would mean five nullable columns that only ever apply one way round.
--
-- Deliberately short: a cleaner filling this in is standing in a driveway
-- between jobs. One rating, one yes/no, and a note if they want one.
create table if not exists client_reviews (
  id uuid primary key default gen_random_uuid(),
  -- One review per clean, same as the customer side. The unique constraint is
  -- what makes "already reviewed" a database fact rather than a UI guess.
  conversation_id uuid not null unique references conversations (id) on delete cascade,
  cleaner_id uuid not null references cleaner_profiles (id) on delete cascade,
  client_id  uuid not null references client_profiles  (id) on delete cascade,
  rating numeric(2,1) not null check (rating >= 1 and rating <= 5),
  would_clean_again boolean not null,
  comment text,
  -- Same moderation vocabulary as `reviews`, so hiding one works the same way.
  status text not null default 'published',
  created_at timestamptz not null default now()
);

create index if not exists client_reviews_client_idx
  on client_reviews (client_id) where status = 'published';
create index if not exists client_reviews_cleaner_idx
  on client_reviews (cleaner_id);

-- A household's standing, cached on the profile the same way a cleaner's is,
-- so the cleaner deciding whether to accept an enquiry sees it without a join.
alter table client_profiles add column if not exists avg_rating numeric(2,1);
alter table client_profiles add column if not exists review_count integer not null default 0;
