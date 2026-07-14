
-- Table to persist live likes count
CREATE TABLE public.live_likes (
  live_id uuid NOT NULL PRIMARY KEY,
  likes_count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.live_likes ENABLE ROW LEVEL SECURITY;

-- Everyone can view likes
CREATE POLICY "Everyone can view live likes"
  ON public.live_likes FOR SELECT
  USING (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated users can create live likes"
  ON public.live_likes FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update (increment)
CREATE POLICY "Authenticated users can update live likes"
  ON public.live_likes FOR UPDATE
  TO authenticated
  USING (true);
