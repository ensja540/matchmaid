-- Where a signup came from, captured at registration.
--
-- FIRST-touch, not last: the flyer or the Google result that first brought
-- someone to the site is what earned the signup, even if they came back a week
-- later by typing the domain in. Last-touch would file almost everyone under
-- "direct" and make every channel look worthless.
--
-- Five separate columns rather than one label because they answer different
-- questions and only the first two are usually worth grouping by:
--   source   - who sent them ("google", "flyer", "facebook", "direct")
--   medium   - how ("organic", "cpc", "print", "referral", "none")
--   campaign - which push, when there is one ("chch-launch-aug")
--   referrer - the raw referring URL, for auditing a guess after the fact
--   landing  - the first page they hit, so an SEO suburb page can be credited
--
-- Everyone who signed up before this shipped keeps NULL. That is honest - we
-- genuinely do not know where they came from - and the dashboard reports them
-- as "unknown" rather than folding them into "direct" and inventing a number.
alter table users add column if not exists acq_source   text;
alter table users add column if not exists acq_medium   text;
alter table users add column if not exists acq_campaign text;
alter table users add column if not exists acq_referrer text;
alter table users add column if not exists acq_landing  text;

-- The dashboard groups by source (and by source+medium), filtered to a date
-- window, so that is what gets the index.
create index if not exists users_acq_source_idx on users (acq_source, created_at);
