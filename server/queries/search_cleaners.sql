-- CORE SEARCH: active cleaners who cover a suburb and offer a service.
-- Best first: featured, then responsive-before-unresponsive, then cleaners with
-- spare capacity before those at capacity, then rating, then reviews.
-- Replace :suburb, :service and :capacity with the customer's choices / limit.
--
-- Responsiveness: a cleaner who has left an enquiry unanswered for more than
-- three days is sunk to the bottom of results. "Unanswered" means the enquiry
-- is still 'new' AND the cleaner never sent a message in its conversation, so
-- replying either way (status change or a message) clears the penalty.
--
-- Capacity: a cleaner with :capacity or more active (accepted, not-yet-completed)
-- jobs is "at capacity" and drops below cleaners with room, so no single listing
-- can hoard every request. Completing or closing jobs frees the capacity again.

select
  cp.id,
  coalesce(cp.business_name, u.full_name)        as name,
  cp.hourly_rate,
  cp.avg_rating,
  cp.review_count,
  cp.id_verified,
  cp.police_verified,
  cp.insurance_verified,
  (cp.featured_until is not null and cp.featured_until > now()) as is_featured,
  exists (
    select 1
    from enquiries e
    where e.cleaner_id = cp.id
      and e.status = 'new'
      and e.created_at < now() - interval '3 days'
      and not exists (
        select 1
        from conversations c
        join messages m on m.conversation_id = c.id
        where c.enquiry_id = e.id
          and m.sender_user_id = cp.user_id
      )
  ) as is_unresponsive,
  (
    select count(*)
    from enquiries e
    where e.cleaner_id = cp.id
      and e.status = 'accepted'
      and (e.scheduled_on is null or e.scheduled_on >= current_date)
  ) >= :capacity as is_at_capacity
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
order by is_featured desc, is_unresponsive asc, is_at_capacity asc, cp.avg_rating desc, cp.review_count desc;
