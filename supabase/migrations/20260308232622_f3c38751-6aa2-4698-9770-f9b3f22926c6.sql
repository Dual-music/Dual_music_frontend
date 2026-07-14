
CREATE TABLE public.content_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL,
  content_id uuid NOT NULL,
  user_id uuid,
  platform text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.content_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view share counts" ON public.content_shares FOR SELECT USING (true);
CREATE POLICY "Authenticated users can share" ON public.content_shares FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_content_shares_content ON public.content_shares (content_type, content_id);
