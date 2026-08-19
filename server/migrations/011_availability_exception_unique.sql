-- One exception row per cleaner per date.
--
-- The table has existed since 001 and was never written to, so it never needed
-- the constraint. The month view writes it on every tap, which without this
-- would quietly accumulate duplicate rows for the same day - and "is this date
-- off?" would depend on which duplicate you happened to read.
--
-- Deduplicate first, keeping the most recently inserted row per (cleaner, date),
-- so the index can be created even if something already slipped through.
delete from availability_exceptions a
 using availability_exceptions b
 where a.cleaner_id = b.cleaner_id
   and a.exception_date = b.exception_date
   and a.ctid < b.ctid;

create unique index if not exists availability_exceptions_cleaner_date_idx
  on availability_exceptions (cleaner_id, exception_date);
