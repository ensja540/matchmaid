-- A date is agreed in the chat, not guessed at the moment of accepting.
--
-- The old flow made the cleaner pick a date to accept an enquiry, before they
-- had spoken to anyone - so accepting meant "I have invented a date and hope it
-- suits you". In practice a cleaner has to message the customer to find out
-- what works, which left accept unusable until after the conversation.
--
-- Now: an enquiry stays pending while the two of them talk. Either side
-- proposes a date, the other confirms it, and confirming is what makes the
-- enquiry accepted. These two columns hold the proposal in the gap between
-- those two acts - scheduled_on keeps its old meaning and is still only ever
-- set on a confirmed booking, so the review prompt that fires off it is
-- untouched.
alter table enquiries add column if not exists proposed_date date;
alter table enquiries add column if not exists proposed_by uuid references users (id) on delete set null;
