-- CORE SEARCH: active cleaners who cover a suburb and offer a service,
-- best first (featured, then highest rated, then most reviews).
-- Replace :suburb and :service with the customer's choices.

select
  cp.id,
  coalesce(cp.business_name, u.full_name)        as name,
  cp.hourly_rate,
  cp.avg_rating,
  cp.review_count,
  cp.id_verified,
  cp.police_verified,
  cp.insurance_verified,
  (cp.featured_until is not null and cp.featured_until > now()) as is_featured
from cleaner_profiles cp
join users u                  on u.id = cp.user_id
join cleaner_service_areas csa on csa.cleaner_id = cp.id
join suburbs s                on s.id = csa.suburb_id
join cleaner_services cs       on cs.cleaner_id = cp.id
join service_types st          on st.id = cs.service_type_id
where cp.listing_status = 'active'
  and u.status = 'active'   -- removed accounts keep their data but leave the directory
  and s.name  = :suburb
  and st.slug = :service
order by is_featured desc, cp.avg_rating desc, cp.review_count desc;
