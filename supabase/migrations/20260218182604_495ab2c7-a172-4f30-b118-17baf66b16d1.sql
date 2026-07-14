-- Add unique constraint on concert_reminders to support upsert for reminder deduplication
ALTER TABLE public.concert_reminders
  ADD CONSTRAINT concert_reminders_concert_user_type_key 
  UNIQUE (concert_id, user_id, reminder_type);