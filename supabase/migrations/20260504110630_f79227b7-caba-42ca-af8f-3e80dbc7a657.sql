ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_content_type_check;
ALTER TABLE public.comments ADD CONSTRAINT comments_content_type_check
  CHECK (content_type = ANY (ARRAY['duel'::text, 'live'::text, 'lifestyle'::text, 'replay'::text, 'blog'::text, 'concert'::text]));