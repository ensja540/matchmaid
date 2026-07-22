-- A cleaner's service area as a circle: centre + radius, set on a map.
--
-- cleaner_service_areas stays the source of truth for matching and search - the
-- circle is resolved to suburb ids on save. Keeping the circle too means the map
-- can be reopened exactly where they left it, which a bare id list can't express.
alter table cleaner_profiles
  add column if not exists service_lat       numeric(9,6),
  add column if not exists service_lng       numeric(9,6),
  add column if not exists service_radius_km numeric(6,2);

-- Existing cleaners picked their suburbs by hand, so fit a circle to what they
-- already cover: centre on the middle of their suburbs, radius wide enough to
-- reach the furthest. Anyone with one suburb gets the 5km floor.
with centre as (
  select csa.cleaner_id, avg(s.lat)::numeric(9,6) lat, avg(s.lng)::numeric(9,6) lng
    from cleaner_service_areas csa
    join suburbs s on s.id = csa.suburb_id
   where s.lat is not null
   group by csa.cleaner_id
), fitted as (
  select c.cleaner_id, c.lat, c.lng,
         max(6371 * acos(least(1,
           cos(radians(c.lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(c.lng))
           + sin(radians(c.lat)) * sin(radians(s.lat))
         ))) radius_km
    from centre c
    join cleaner_service_areas csa on csa.cleaner_id = c.cleaner_id
    join suburbs s on s.id = csa.suburb_id and s.lat is not null
   group by c.cleaner_id, c.lat, c.lng
)
update cleaner_profiles cp
   set service_lat = f.lat,
       service_lng = f.lng,
       service_radius_km = greatest(5, ceil(f.radius_km))
  from fitted f
 where f.cleaner_id = cp.id
   and cp.service_lat is null;
