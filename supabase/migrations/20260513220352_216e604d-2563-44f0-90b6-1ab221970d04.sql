-- 1) Add duration to sponsor_requests
ALTER TABLE public.sponsor_requests
  ADD COLUMN IF NOT EXISTS media_duration_seconds integer;

-- 2) Sponsor price tiers
CREATE TABLE IF NOT EXISTS public.sponsor_price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  min_seconds integer NOT NULL CHECK (min_seconds >= 0),
  max_seconds integer NOT NULL CHECK (max_seconds > 0),
  price_credits numeric NOT NULL CHECK (price_credits >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_seconds >= min_seconds)
);

ALTER TABLE public.sponsor_price_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read active tiers" ON public.sponsor_price_tiers;
CREATE POLICY "Everyone can read active tiers"
  ON public.sponsor_price_tiers FOR SELECT
  USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage tiers" ON public.sponsor_price_tiers;
CREATE POLICY "Admins manage tiers"
  ON public.sponsor_price_tiers FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_sponsor_price_tiers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sponsor_price_tiers_updated ON public.sponsor_price_tiers;
CREATE TRIGGER trg_sponsor_price_tiers_updated
  BEFORE UPDATE ON public.sponsor_price_tiers
  FOR EACH ROW EXECUTE FUNCTION public.touch_sponsor_price_tiers_updated_at();

-- 3) Default tier seed
INSERT INTO public.sponsor_price_tiers (label, min_seconds, max_seconds, price_credits)
SELECT * FROM (VALUES
  ('Court (0-15s)',     0,  15,  50),
  ('Standard (16-30s)', 16, 30, 100),
  ('Long (31-60s)',     31, 60, 200),
  ('Extra (61-120s)',   61, 120, 350)
) AS v(label, min_seconds, max_seconds, price_credits)
WHERE NOT EXISTS (SELECT 1 FROM public.sponsor_price_tiers);

-- 4) Helper to look up the default price for a duration
CREATE OR REPLACE FUNCTION public.get_sponsor_default_price(p_duration_seconds integer)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT price_credits
  FROM public.sponsor_price_tiers
  WHERE is_active = true
    AND COALESCE(p_duration_seconds, 0) BETWEEN min_seconds AND max_seconds
  ORDER BY min_seconds
  LIMIT 1;
$$;