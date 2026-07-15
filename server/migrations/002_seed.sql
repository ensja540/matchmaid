-- Seed data: Christchurch suburbs + satellite towns, service types,
-- and a few sample cleaners so search returns results on day one.
-- The surrounding Selwyn/Waimakariri towns sit under Christchurch City: we
-- present greater Christchurch as one area rather than separate districts.

insert into suburbs (name, region, territorial_authority) values
  ('Riccarton','Canterbury','Christchurch City'),
  ('Papanui','Canterbury','Christchurch City'),
  ('Fendalton','Canterbury','Christchurch City'),
  ('Linwood','Canterbury','Christchurch City'),
  ('Sumner','Canterbury','Christchurch City'),
  ('Halswell','Canterbury','Christchurch City'),
  ('Rolleston','Canterbury','Christchurch City'),
  ('Lincoln','Canterbury','Christchurch City'),
  ('Rangiora','Canterbury','Christchurch City'),
  ('Kaiapoi','Canterbury','Christchurch City');

insert into service_types (name, slug) values
  ('Regular house clean','regular'),
  ('Deep clean','deep'),
  ('End of tenancy','end-of-tenancy'),
  ('Oven clean','oven'),
  ('Carpet clean','carpet');

-- Sample cleaners (so the search query has something to return)
insert into users (id, email, role, full_name) values
  ('11111111-1111-1111-1111-111111111111','aroha@example.com','cleaner','Aroha Ngata'),
  ('22222222-2222-2222-2222-222222222222','sam@example.com','cleaner','Sam Te Whata'),
  ('33333333-3333-3333-3333-333333333333','mei@example.com','cleaner','Mei Chen');

insert into cleaner_profiles (id, user_id, business_name, base_suburb_id, hourly_rate, listing_status,
                              subscription_tier, avg_rating, review_count, id_verified, police_verified, insurance_verified, featured_until)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Aroha''s Home Care',
     (select id from suburbs where name='Riccarton'), 38.00,'active','premium',4.9,27,true,true,true, now() + interval '30 days'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','Sam the Cleaner',
     (select id from suburbs where name='Riccarton'), 35.00,'active','pro',4.6,12,true,false,true, null),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','33333333-3333-3333-3333-333333333333','Sparkle by Mei',
     (select id from suburbs where name='Rolleston'), 40.00,'active','pro',4.8,8,true,true,false, null);

-- Which services each cleaner offers
insert into cleaner_services (cleaner_id, service_type_id)
select cp.id, st.id from cleaner_profiles cp, service_types st
where (cp.business_name='Aroha''s Home Care' and st.slug in ('regular','deep','end-of-tenancy'))
   or (cp.business_name='Sam the Cleaner'      and st.slug in ('regular','oven'))
   or (cp.business_name='Sparkle by Mei'       and st.slug in ('regular','deep','carpet'));

-- Which suburbs each cleaner covers
insert into cleaner_service_areas (cleaner_id, suburb_id)
select cp.id, s.id from cleaner_profiles cp, suburbs s
where (cp.business_name='Aroha''s Home Care' and s.name in ('Riccarton','Fendalton','Papanui'))
   or (cp.business_name='Sam the Cleaner'      and s.name in ('Riccarton','Halswell'))
   or (cp.business_name='Sparkle by Mei'       and s.name in ('Rolleston','Lincoln'));
