CREATE TABLE IF NOT EXISTS public.duel_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  duel_id uuid NOT NULL REFERENCES public.duels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reminder_type text NOT NULL,
  sent boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (duel_id, user_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_duel_reminders_duel ON public.duel_reminders(duel_id);
CREATE INDEX IF NOT EXISTS idx_duel_reminders_user ON public.duel_reminders(user_id);

ALTER TABLE public.duel_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own duel reminders"
ON public.duel_reminders FOR SELECT
USING (auth.uid() = user_id);
