-- Match Maid opens in Australia, so every place and every person now belongs to
-- a country.
--
-- This is not cosmetic. Thirty-three New Zealand suburb names are also
-- Australian suburb names - Sandringham, Northcote, Epsom, Newmarket and
-- Balmoral are all Auckland AND Melbourne or Sydney - and several queries match
-- suburbs by name rather than id. Without a country column, an Auckland cleaner
-- covering Sandringham would surface in a Melbourne search, and vice versa.
--
-- Defaulting to NZ is correct for every existing row: everything in the
-- database today is New Zealand.
alter table suburbs add column if not exists country char(2) not null default 'NZ';
alter table users   add column if not exists country char(2) not null default 'NZ';

-- Every suburb lookup is now country-scoped, so the index carries the country.
create index if not exists suburbs_country_name_idx on suburbs (country, lower(name));
create index if not exists suburbs_country_ta_idx   on suburbs (country, territorial_authority);
create index if not exists users_country_idx        on users (country);

-- Deliberately NOT unique on (country, territorial_authority, name). Five real
-- New Zealand rows would violate it - Wainui, Oakura, Cable Bay, Muriwai and
-- Kinloch each name two distinct places that fall back to themselves as their
-- own territorial authority. They are genuine separate localities with service
-- areas attached, so the constraint would have to be bought by merging or
-- deleting real data. Country scoping is what correctness needs here; the
-- uniqueness would only have been tidiness.
