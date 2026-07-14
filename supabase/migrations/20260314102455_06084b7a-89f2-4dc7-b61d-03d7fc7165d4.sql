
-- Add ticket_price to duels for paid/free duels
ALTER TABLE public.duels ADD COLUMN IF NOT EXISTS ticket_price numeric NOT NULL DEFAULT 0;

-- Add management columns to replay_videos
ALTER TABLE public.replay_videos ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE public.replay_videos ADD COLUMN IF NOT EXISTS replay_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.replay_videos ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.replay_videos ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'duel';
ALTER TABLE public.replay_videos ADD COLUMN IF NOT EXISTS concert_id uuid;

-- Add duel_ticket_access table for users who paid for duel access
CREATE TABLE IF NOT EXISTS public.duel_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id uuid NOT NULL REFERENCES public.duels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  price_paid numeric NOT NULL DEFAULT 0,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(duel_id, user_id)
);

ALTER TABLE public.duel_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own duel tickets" ON public.duel_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can purchase duel tickets" ON public.duel_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all duel tickets" ON public.duel_tickets FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- RLS for replay management: admins, managers (via created_by), artists can manage
CREATE POLICY "Admins can manage all replays" ON public.replay_videos FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Creators can manage their replays" ON public.replay_videos FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Public replays viewable by all" ON public.replay_videos FOR SELECT USING (is_public = true);
