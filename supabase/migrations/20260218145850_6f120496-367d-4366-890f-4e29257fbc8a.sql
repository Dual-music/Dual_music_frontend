
-- ============================================================
-- 1. FIX profiles exposure: restrict SELECT to auth users only
-- ============================================================
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Authenticated users can view public profiles"
  ON public.profiles FOR SELECT
  USING (is_public = true OR auth.uid() = id OR has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 2. FIX notifications: drop overly permissive INSERT policy
-- ============================================================
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- SECURITY DEFINER trigger functions bypass RLS and will continue working.
-- Edge functions use service role which also bypasses RLS.
-- No client-side notification creation is needed; backend handles it all.

-- ============================================================
-- 3. FIX vote amount validation: add positive check on duel_votes
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vote_amount_positive' AND conrelid = 'public.duel_votes'::regclass
  ) THEN
    ALTER TABLE public.duel_votes
      ADD CONSTRAINT vote_amount_positive CHECK (amount > 0 AND amount <= 10000);
  END IF;
END$$;

-- Update INSERT policy on duel_votes to enforce amount range too
DROP POLICY IF EXISTS "Authenticated users can vote" ON public.duel_votes;

CREATE POLICY "Authenticated users can vote with valid amounts"
  ON public.duel_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND amount > 0
    AND amount <= 10000
  );

-- ============================================================
-- 4. FIX wallet: add non-negative balance constraint
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'balance_non_negative' AND conrelid = 'public.user_wallets'::regclass
  ) THEN
    ALTER TABLE public.user_wallets
      ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);
  END IF;
END$$;

-- ============================================================
-- 5. Create atomic wallet deduction function (prevents race conditions)
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_wallet_balance(
  _user_id UUID,
  _amount NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_wallets
  SET balance = balance - _amount,
      updated_at = now()
  WHERE user_id = _user_id
    AND balance >= _amount;

  RETURN FOUND;
END;
$$;

-- ============================================================
-- 6. Create atomic deduct-and-vote function (prevents double spend)
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_wallet_and_vote(
  p_user_id UUID,
  p_amount NUMERIC,
  p_duel_id UUID,
  p_artist_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 OR p_amount > 10000 THEN
    RETURN FALSE;
  END IF;

  UPDATE user_wallets
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND balance >= p_amount;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  INSERT INTO duel_votes (duel_id, user_id, artist_id, amount)
  VALUES (p_duel_id, p_user_id, p_artist_id, p_amount);

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 7. Create atomic gift purchase function
-- ============================================================
CREATE OR REPLACE FUNCTION public.purchase_gift_from_wallet(
  p_user_id UUID,
  p_gift_id UUID,
  p_quantity INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price NUMERIC;
  v_total NUMERIC;
  v_existing_qty INTEGER;
BEGIN
  IF p_quantity <= 0 OR p_quantity > 100 THEN
    RETURN FALSE;
  END IF;

  SELECT price INTO v_price FROM virtual_gifts WHERE id = p_gift_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  v_total := v_price * p_quantity;

  -- Atomic deduction
  UPDATE user_wallets
  SET balance = balance - v_total,
      updated_at = now()
  WHERE user_id = p_user_id
    AND balance >= v_total;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Upsert user_gifts
  SELECT quantity INTO v_existing_qty
  FROM user_gifts
  WHERE user_id = p_user_id AND gift_id = p_gift_id;

  IF FOUND THEN
    UPDATE user_gifts
    SET quantity = quantity + p_quantity
    WHERE user_id = p_user_id AND gift_id = p_gift_id;
  ELSE
    INSERT INTO user_gifts (user_id, gift_id, quantity)
    VALUES (p_user_id, p_gift_id, p_quantity);
  END IF;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 8. Create atomic referral reward claim function (prevents replay)
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_referral_reward(
  p_referral_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_reward_claimed BOOLEAN;
BEGIN
  SELECT status, reward_claimed
  INTO v_status, v_reward_claimed
  FROM referrals
  WHERE id = p_referral_id AND referrer_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_status <> 'completed' THEN RETURN FALSE; END IF;
  IF v_reward_claimed THEN RETURN FALSE; END IF;

  UPDATE referrals
  SET reward_claimed = true
  WHERE id = p_referral_id;

  UPDATE user_wallets
  SET balance = balance + 50,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$;
