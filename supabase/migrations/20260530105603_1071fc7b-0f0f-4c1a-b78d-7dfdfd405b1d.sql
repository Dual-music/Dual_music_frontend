ALTER TABLE public.moneroo_transactions
  ADD COLUMN IF NOT EXISTS request_url text,
  ADD COLUMN IF NOT EXISTS request_payload jsonb,
  ADD COLUMN IF NOT EXISTS request_headers jsonb,
  ADD COLUMN IF NOT EXISTS http_status integer,
  ADD COLUMN IF NOT EXISTS http_status_text text,
  ADD COLUMN IF NOT EXISTS request_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS response_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS debug_logs jsonb NOT NULL DEFAULT '[]'::jsonb;