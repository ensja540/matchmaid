-- Cleaner-Pays Directory: initial schema (PostgreSQL)
-- Creates all tables, types and indexes for the directory.

-- Enums (fixed sets of allowed values)
create type user_role            as enum ('client','cleaner','admin');
create type subscription_tier    as enum ('none','pro','premium');
create type subscription_status  as enum ('trialing','active','past_due','cancelled');
create type listing_status       as enum ('draft','active','paused','hidden');
create type clean_frequency      as enum ('one_off','weekly','fortnightly','monthly');
create type verification_type    as enum ('id','police','insurance');
create type verification_status  as enum ('pending','verified','failed','expired');
create type enquiry_status       as enum ('new','responded','accepted','declined','closed');
create type booking_status       as enum ('pending','confirmed','completed','cancelled','no_show');
create type payment_status       as enum ('pending','held','released','refunded','failed');
create type review_status        as enum ('published','flagged','removed');

-- Identity
create table users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  phone           text,
  password_hash   text,
  role            user_role not null,
  full_name       text not null,
  status          text not null default 'active',
  email_verified  boolean not null default false,
  phone_verified  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Geography and catalogue
create table suburbs (
  id                     serial primary key,
  name                   text not null,
  region                 text not null,
  territorial_authority  text,
  lat                    numeric(9,6),
  lng                    numeric(9,6),
  unique (name, region)
);

create table service_types (
  id    serial primary key,
  name  text not null,
  slug  text not null unique
);

-- Profiles
create table client_profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references users(id) on delete cascade,
  default_suburb_id integer references suburbs(id),
  address_line      text,
  notes             text,
  -- "I need the cleaner to bring cleaning products."
  needs_products    boolean not null default false,
  created_at        timestamptz not null default now()
);

create table cleaner_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references users(id) on delete cascade,
  business_name       text,
  bio                 text,
  base_suburb_id      integer references suburbs(id),
  hourly_rate         numeric(8,2),
  years_experience    integer,
  profile_photo_url   text,
  listing_status      listing_status not null default 'draft',
  subscription_tier   subscription_tier not null default 'none',
  avg_rating          numeric(3,2) not null default 0,
  review_count        integer not null default 0,
  id_verified         boolean not null default false,
  police_verified     boolean not null default false,
  insurance_verified  boolean not null default false,
  -- "I bring my own cleaning products."
  brings_products     boolean not null default false,
  featured_until      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table cleaner_services (
  cleaner_id       uuid not null references cleaner_profiles(id) on delete cascade,
  service_type_id  integer not null references service_types(id),
  from_price       numeric(8,2),
  primary key (cleaner_id, service_type_id)
);

create table cleaner_service_areas (
  cleaner_id  uuid not null references cleaner_profiles(id) on delete cascade,
  suburb_id   integer not null references suburbs(id),
  primary key (cleaner_id, suburb_id)
);

create table availability_rules (
  id           uuid primary key default gen_random_uuid(),
  cleaner_id   uuid not null references cleaner_profiles(id) on delete cascade,
  day_of_week  smallint not null check (day_of_week between 0 and 6),
  start_time   time not null,
  end_time     time not null
);

create table availability_exceptions (
  id              uuid primary key default gen_random_uuid(),
  cleaner_id      uuid not null references cleaner_profiles(id) on delete cascade,
  exception_date  date not null,
  is_available    boolean not null,
  reason          text
);

-- Connection and messaging
create table enquiries (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references client_profiles(id),
  cleaner_id       uuid not null references cleaner_profiles(id),
  service_type_id  integer references service_types(id),
  suburb_id        integer references suburbs(id),
  message          text,
  preferred_date   date,
  frequency        clean_frequency,
  status           enquiry_status not null default 'new',
  created_at       timestamptz not null default now(),
  responded_at     timestamptz
);

create table conversations (
  id              uuid primary key default gen_random_uuid(),
  enquiry_id      uuid not null unique references enquiries(id) on delete cascade,
  client_id       uuid not null references client_profiles(id),
  cleaner_id      uuid not null references cleaner_profiles(id),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz
);

create table messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  sender_user_id   uuid not null references users(id),
  body             text not null,
  sent_at          timestamptz not null default now(),
  read_at          timestamptz
);

-- Optional on-platform booking, payment and review
create table bookings (
  id               uuid primary key default gen_random_uuid(),
  enquiry_id       uuid references enquiries(id),
  client_id        uuid not null references client_profiles(id),
  cleaner_id       uuid not null references cleaner_profiles(id),
  service_type_id  integer references service_types(id),
  scheduled_at     timestamptz not null,
  duration_minutes integer,
  address_line     text,
  suburb_id        integer references suburbs(id),
  quoted_price     numeric(8,2),
  status           booking_status not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table payments (
  id                       uuid primary key default gen_random_uuid(),
  booking_id               uuid not null unique references bookings(id) on delete cascade,
  gross_amount             numeric(10,2) not null,
  protection_fee           numeric(10,2) not null default 0,
  processing_fee           numeric(10,2) not null default 0,
  net_to_cleaner           numeric(10,2) not null,
  currency                 char(3) not null default 'NZD',
  stripe_payment_intent_id text,
  status                   payment_status not null default 'pending',
  held_until               timestamptz,
  paid_at                  timestamptz,
  released_at              timestamptz,
  created_at               timestamptz not null default now()
);

create table reviews (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid unique references bookings(id),
  cleaner_id  uuid not null references cleaner_profiles(id),
  client_id   uuid not null references client_profiles(id),
  rating      smallint not null check (rating between 1 and 5),
  comment     text,
  status      review_status not null default 'published',
  created_at  timestamptz not null default now()
);

-- Monetisation and trust
create table subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  cleaner_id             uuid not null references cleaner_profiles(id) on delete cascade,
  tier                   subscription_tier not null,
  status                 subscription_status not null default 'trialing',
  stripe_subscription_id text,
  trial_ends_at          timestamptz,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancelled_at           timestamptz,
  created_at             timestamptz not null default now()
);

create table verifications (
  id           uuid primary key default gen_random_uuid(),
  cleaner_id   uuid not null references cleaner_profiles(id) on delete cascade,
  type         verification_type not null,
  status       verification_status not null default 'pending',
  document_url text,
  provider     text,
  verified_at  timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

create table featured_placements (
  id          uuid primary key default gen_random_uuid(),
  cleaner_id  uuid not null references cleaner_profiles(id) on delete cascade,
  suburb_id   integer references suburbs(id),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  amount      numeric(8,2) not null,
  created_at  timestamptz not null default now()
);

-- Indexes for the core search and feeds
create index idx_cleaner_listing on cleaner_profiles(listing_status);
create index idx_cleaner_rating  on cleaner_profiles(avg_rating desc);
create index idx_csa_suburb      on cleaner_service_areas(suburb_id);
create index idx_cs_service      on cleaner_services(service_type_id);
create index idx_enq_cleaner     on enquiries(cleaner_id, status);
create index idx_enq_client      on enquiries(client_id);
create index idx_msg_convo       on messages(conversation_id);
create index idx_bk_cleaner      on bookings(cleaner_id, status);
create index idx_rev_cleaner     on reviews(cleaner_id);
