ALTER TABLE public.sponsor_requests DROP CONSTRAINT IF EXISTS sponsor_requests_event_type_check;
ALTER TABLE public.sponsor_requests ADD CONSTRAINT sponsor_requests_event_type_check
  CHECK (event_type IN ('duel','concert','artist_concert','competition'));