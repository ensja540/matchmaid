-- Sample cleaner availability so the matching screen returns results.
-- Slots are stored in the existing availability_rules table.
-- Convention used across the app:
--   day_of_week: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
--   AM    = 08:00–12:00
--   Lunch = 12:00–14:00
--   PM    = 14:00–18:00

insert into availability_rules (cleaner_id, day_of_week, start_time, end_time) values
  -- Aroha's Home Care (Riccarton/Fendalton/Papanui)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0, '08:00', '12:00'), -- Mon AM
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0, '14:00', '18:00'), -- Mon PM
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, '08:00', '12:00'), -- Wed AM
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, '12:00', '14:00'), -- Fri Lunch
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, '08:00', '12:00'), -- Sat AM

  -- Sam the Cleaner (Riccarton/Halswell)
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 0, '08:00', '12:00'), -- Mon AM
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, '08:00', '12:00'), -- Tue AM
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 3, '14:00', '18:00'), -- Thu PM
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 5, '12:00', '14:00'), -- Sat Lunch

  -- Sparkle by Mei (Rolleston/Lincoln)
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 2, '14:00', '18:00'), -- Wed PM
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 4, '08:00', '12:00'), -- Fri AM
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 5, '08:00', '12:00'), -- Sat AM
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 6, '12:00', '14:00'); -- Sun Lunch
