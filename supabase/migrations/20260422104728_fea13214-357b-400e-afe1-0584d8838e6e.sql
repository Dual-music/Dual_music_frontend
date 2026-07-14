-- Enable realtime for transaction tables so the Profile page can show
-- live toast notifications when a purchase, ticket, or withdrawal is confirmed.
ALTER TABLE public.credit_purchases REPLICA IDENTITY FULL;
ALTER TABLE public.concert_tickets REPLICA IDENTITY FULL;
ALTER TABLE public.withdrawal_requests REPLICA IDENTITY FULL;
ALTER TABLE public.user_wallets REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.concert_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawal_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_wallets;