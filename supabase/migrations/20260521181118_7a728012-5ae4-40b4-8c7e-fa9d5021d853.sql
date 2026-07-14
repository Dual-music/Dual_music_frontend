
-- 1) Table pays
CREATE TABLE public.cinetpay_countries (
  country_code text PRIMARY KEY,
  country_name text NOT NULL,
  currency text NOT NULL,
  phone_prefix text NOT NULL,
  operators jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  secret_key_name text NOT NULL,
  secret_password_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cinetpay_countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone reads cinetpay countries" ON public.cinetpay_countries FOR SELECT USING (true);
CREATE POLICY "Admins manage cinetpay countries" ON public.cinetpay_countries FOR ALL USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

INSERT INTO public.cinetpay_countries (country_code,country_name,currency,phone_prefix,operators,is_active,secret_key_name,secret_password_name) VALUES
('CI','Côte d''Ivoire','XOF','+225','[{"code":"OM_CI","label":"Orange Money"},{"code":"MOOV_CI","label":"Moov Money"},{"code":"MTN_CI","label":"MTN MoMo"},{"code":"WAVE_CI","label":"Wave"}]'::jsonb,true,'CINETPAY_ACCOUNT_KEY_CI','CINETPAY_ACCOUNT_PASSWORD_CI'),
('SN','Sénégal','XOF','+221','[{"code":"OM_SN","label":"Orange Money"},{"code":"FREE_SN","label":"Free Money"},{"code":"WAVE_SN","label":"Wave"}]'::jsonb,false,'CINETPAY_ACCOUNT_KEY_SN','CINETPAY_ACCOUNT_PASSWORD_SN'),
('BF','Burkina Faso','XOF','+226','[{"code":"OM_BF","label":"Orange Money"},{"code":"MOOV_BF","label":"Moov Money"},{"code":"WAVE_BF","label":"Wave"}]'::jsonb,false,'CINETPAY_ACCOUNT_KEY_BF','CINETPAY_ACCOUNT_PASSWORD_BF'),
('CM','Cameroun','XAF','+237','[{"code":"OM_CM","label":"Orange Money"},{"code":"MTN_CM","label":"MTN MoMo"}]'::jsonb,false,'CINETPAY_ACCOUNT_KEY_CM','CINETPAY_ACCOUNT_PASSWORD_CM'),
('CD','RD Congo','CDF','+243','[{"code":"OM_CD","label":"Orange Money"},{"code":"AIRTEL_CD","label":"Airtel Money"},{"code":"MPESA_CD","label":"M-Pesa"}]'::jsonb,false,'CINETPAY_ACCOUNT_KEY_CD','CINETPAY_ACCOUNT_PASSWORD_CD');

-- 2) Table transactions
CREATE TABLE public.cinetpay_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_transaction_id text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('payin','payout')),
  user_id uuid NOT NULL,
  country_code text NOT NULL REFERENCES public.cinetpay_countries(country_code),
  payment_method text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','exists','insufficient')),
  cinetpay_transaction_id text,
  notify_token text NOT NULL,
  credits_amount numeric,
  withdrawal_request_id uuid,
  raw_init_response jsonb,
  raw_verify_response jsonb,
  raw_webhook_payload jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cinetpay_tx_user ON public.cinetpay_transactions(user_id);
CREATE INDEX idx_cinetpay_tx_status ON public.cinetpay_transactions(status);
ALTER TABLE public.cinetpay_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own cinetpay tx" ON public.cinetpay_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage cinetpay tx" ON public.cinetpay_transactions FOR ALL USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- 3) RPCs atomiques
CREATE OR REPLACE FUNCTION public.cinetpay_credit_wallet(p_merchant_id text, p_credits numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx record; v_new_balance numeric;
BEGIN
  SELECT * INTO v_tx FROM public.cinetpay_transactions WHERE merchant_transaction_id = p_merchant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','tx_not_found'); END IF;
  IF v_tx.status = 'success' THEN RETURN jsonb_build_object('ok',true,'already',true); END IF;
  INSERT INTO public.user_wallets (user_id, balance) VALUES (v_tx.user_id, p_credits)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.user_wallets.balance + EXCLUDED.balance, updated_at = now()
  RETURNING balance INTO v_new_balance;
  UPDATE public.cinetpay_transactions SET status='success', credits_amount=p_credits, processed_at=now(), updated_at=now() WHERE id = v_tx.id;
  INSERT INTO public.credit_purchases (user_id, credits_amount, paid_amount, currency, payment_method, status, payment_reference)
  VALUES (v_tx.user_id, p_credits, v_tx.amount, v_tx.currency, 'cinetpay', 'completed', p_merchant_id);
  RETURN jsonb_build_object('ok',true,'balance',v_new_balance);
END;$$;

CREATE OR REPLACE FUNCTION public.cinetpay_reserve_payout(p_user_id uuid, p_credits numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance numeric;
BEGIN
  SELECT balance INTO v_balance FROM public.user_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_credits THEN RETURN jsonb_build_object('ok',false,'error','insufficient_balance'); END IF;
  UPDATE public.user_wallets SET balance = balance - p_credits, updated_at=now() WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok',true);
END;$$;

CREATE OR REPLACE FUNCTION public.cinetpay_revert_payout(p_merchant_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx record;
BEGIN
  SELECT * INTO v_tx FROM public.cinetpay_transactions WHERE merchant_transaction_id = p_merchant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','tx_not_found'); END IF;
  IF v_tx.status IN ('failed','insufficient') THEN RETURN jsonb_build_object('ok',true,'already',true); END IF;
  IF v_tx.credits_amount IS NOT NULL THEN
    INSERT INTO public.user_wallets (user_id,balance) VALUES (v_tx.user_id, v_tx.credits_amount)
    ON CONFLICT (user_id) DO UPDATE SET balance = public.user_wallets.balance + EXCLUDED.balance, updated_at=now();
  END IF;
  UPDATE public.cinetpay_transactions SET status='failed', processed_at=now(), updated_at=now() WHERE id = v_tx.id;
  RETURN jsonb_build_object('ok',true);
END;$$;

CREATE OR REPLACE FUNCTION public.cinetpay_confirm_payout(p_merchant_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx record;
BEGIN
  SELECT * INTO v_tx FROM public.cinetpay_transactions WHERE merchant_transaction_id = p_merchant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','tx_not_found'); END IF;
  IF v_tx.status = 'success' THEN RETURN jsonb_build_object('ok',true,'already',true); END IF;
  UPDATE public.cinetpay_transactions SET status='success', processed_at=now(), updated_at=now() WHERE id = v_tx.id;
  RETURN jsonb_build_object('ok',true);
END;$$;
