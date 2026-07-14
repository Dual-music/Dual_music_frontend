
-- Moneroo transactions table
CREATE TABLE public.moneroo_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_transaction_id text NOT NULL UNIQUE,
  moneroo_transaction_id text,
  kind text NOT NULL CHECK (kind IN ('payin','payout')),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL,
  credits_amount numeric,
  phone_number text,
  payment_method text,
  status text NOT NULL DEFAULT 'pending',
  raw_init_response jsonb,
  raw_webhook_payload jsonb,
  raw_verify_response jsonb,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.moneroo_transactions TO authenticated;
GRANT ALL ON public.moneroo_transactions TO service_role;

ALTER TABLE public.moneroo_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own moneroo tx"
  ON public.moneroo_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage moneroo tx"
  ON public.moneroo_transactions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_moneroo_tx_user ON public.moneroo_transactions(user_id);
CREATE INDEX idx_moneroo_tx_status ON public.moneroo_transactions(status);

-- RPCs for atomic wallet operations
CREATE OR REPLACE FUNCTION public.moneroo_credit_wallet(p_merchant_id text, p_credits numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx record; v_new_balance numeric;
BEGIN
  SELECT * INTO v_tx FROM public.moneroo_transactions WHERE merchant_transaction_id = p_merchant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','tx_not_found'); END IF;
  IF v_tx.status = 'success' THEN RETURN jsonb_build_object('ok',true,'already',true); END IF;
  INSERT INTO public.user_wallets (user_id, balance) VALUES (v_tx.user_id, p_credits)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.user_wallets.balance + EXCLUDED.balance, updated_at = now()
  RETURNING balance INTO v_new_balance;
  UPDATE public.moneroo_transactions SET status='success', credits_amount=p_credits, processed_at=now(), updated_at=now() WHERE id = v_tx.id;
  INSERT INTO public.credit_purchases (user_id, credits_amount, paid_amount, currency, payment_method, status, payment_reference)
  VALUES (v_tx.user_id, p_credits, v_tx.amount, v_tx.currency, 'moneroo', 'completed', p_merchant_id);
  RETURN jsonb_build_object('ok',true,'balance',v_new_balance);
END;$$;

CREATE OR REPLACE FUNCTION public.moneroo_reserve_payout(p_user_id uuid, p_credits numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance numeric;
BEGIN
  SELECT balance INTO v_balance FROM public.user_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_credits THEN RETURN jsonb_build_object('ok',false,'error','insufficient_balance'); END IF;
  UPDATE public.user_wallets SET balance = balance - p_credits, updated_at=now() WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok',true);
END;$$;

CREATE OR REPLACE FUNCTION public.moneroo_confirm_payout(p_merchant_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx record;
BEGIN
  SELECT * INTO v_tx FROM public.moneroo_transactions WHERE merchant_transaction_id = p_merchant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','tx_not_found'); END IF;
  IF v_tx.status = 'success' THEN RETURN jsonb_build_object('ok',true,'already',true); END IF;
  UPDATE public.moneroo_transactions SET status='success', processed_at=now(), updated_at=now() WHERE id = v_tx.id;
  RETURN jsonb_build_object('ok',true);
END;$$;

CREATE OR REPLACE FUNCTION public.moneroo_revert_payout(p_merchant_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx record;
BEGIN
  SELECT * INTO v_tx FROM public.moneroo_transactions WHERE merchant_transaction_id = p_merchant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','tx_not_found'); END IF;
  IF v_tx.status IN ('success','failed','reverted') THEN RETURN jsonb_build_object('ok',true,'already',true); END IF;
  UPDATE public.user_wallets SET balance = balance + v_tx.credits_amount, updated_at=now() WHERE user_id = v_tx.user_id;
  UPDATE public.moneroo_transactions SET status='failed', processed_at=now(), updated_at=now() WHERE id = v_tx.id;
  RETURN jsonb_build_object('ok',true);
END;$$;

-- Payment providers config (admin toggles)
INSERT INTO public.platform_settings (key, value)
VALUES ('payment_providers_config', '{"cinetpay_enabled": true, "moneroo_enabled": true, "stripe_enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
