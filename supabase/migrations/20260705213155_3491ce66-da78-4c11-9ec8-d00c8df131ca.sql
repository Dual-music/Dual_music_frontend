ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS sponsor_submission_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS forced_focus_participant_id UUID;

ALTER TABLE public.duels
  ADD COLUMN IF NOT EXISTS sponsor_submission_deadline TIMESTAMPTZ;

ALTER TABLE public.concerts
  ADD COLUMN IF NOT EXISTS sponsor_submission_deadline TIMESTAMPTZ;