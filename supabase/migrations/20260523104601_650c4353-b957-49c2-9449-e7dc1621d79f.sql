
CREATE TABLE IF NOT EXISTS public.cinetpay_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  event text NOT NULL,
  transaction_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cinetpay_alerts_unack ON public.cinetpay_alerts(created_at DESC) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cinetpay_alerts_dedup ON public.cinetpay_alerts(event, transaction_id, created_at DESC);

ALTER TABLE public.cinetpay_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage cinetpay alerts"
  ON public.cinetpay_alerts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
