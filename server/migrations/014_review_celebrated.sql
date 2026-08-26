-- When the cleaner was shown the celebration for a review.
--
-- A perfect review is worth marking, and this is what stops it being marked
-- twice: the celebration fires for reviews where this is still null, and
-- stamping it is what retires them. Per review, not per cleaner, so the second
-- five-star review is its own moment rather than being swallowed by the first.
--
-- Nullable and unstamped for every existing row on purpose. Any perfect review
-- already in the table has never been celebrated, so the cleaner sees it the
-- next time they log in - which is the right answer, not a backfill.
alter table reviews add column if not exists celebrated_at timestamptz;

-- The lookup is always "this cleaner's uncelebrated perfect reviews", so the
-- partial index carries only the rows that can still match.
create index if not exists reviews_uncelebrated_idx
  on reviews (cleaner_id)
  where celebrated_at is null;
