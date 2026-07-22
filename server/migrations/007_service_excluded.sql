-- Suburbs inside a cleaner's circle that they've crossed off by hand.
--
-- Kept separately rather than just leaving them out of cleaner_service_areas:
-- the areas are recomputed from the circle on every save, so an exclusion baked
-- into them would come straight back the next time the radius moved. This is
-- the record of an explicit "not there" that has to outlive the geometry.
alter table cleaner_profiles
  add column if not exists service_excluded jsonb not null default '[]'::jsonb;
