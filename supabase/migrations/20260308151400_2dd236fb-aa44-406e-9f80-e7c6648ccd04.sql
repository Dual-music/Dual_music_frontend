
CREATE TABLE public.subscription_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  icon text NOT NULL DEFAULT 'Star',
  gradient text NOT NULL DEFAULT 'from-gray-500 to-gray-600',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view subscription plans"
  ON public.subscription_plans FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage subscription plans"
  ON public.subscription_plans FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.subscription_plans (id, name, description, price, icon, gradient, sort_order, features, rules) VALUES
(
  'free',
  'Gratuit',
  'Pour découvrir la plateforme',
  0,
  'Star',
  'from-gray-500 to-gray-600',
  0,
  '["Accès aux duels en direct", "Votes gratuits limités", "Replays gratuits", "Commentaires et likes"]'::jsonb,
  '{"max_votes_per_duel": 3, "premium_replays": false, "early_access": false, "virtual_meets": false, "exclusive_gifts": false, "no_ads": false, "exclusive_content": false, "priority_support": false}'::jsonb
),
(
  'pro',
  'Pro',
  'Pour les fans passionnés',
  9.99,
  'Zap',
  'from-purple-500 to-pink-500',
  1,
  '["Tout le plan Gratuit", "Votes illimités", "Accès aux replays premium", "Badge Pro exclusif", "Support prioritaire"]'::jsonb,
  '{"max_votes_per_duel": -1, "premium_replays": true, "early_access": false, "virtual_meets": false, "exclusive_gifts": false, "no_ads": false, "exclusive_content": false, "priority_support": true}'::jsonb
),
(
  'premium',
  'Premium',
  E'L\'expérience ultime',
  19.99,
  'Crown',
  'from-yellow-500 to-amber-500',
  2,
  '["Tout le plan Pro", "Accès anticipé aux duels", "Rencontres virtuelles artistes", "Cadeaux exclusifs", "Sans publicité", "Contenu exclusif"]'::jsonb,
  '{"max_votes_per_duel": -1, "premium_replays": true, "early_access": true, "virtual_meets": true, "exclusive_gifts": true, "no_ads": true, "exclusive_content": true, "priority_support": true}'::jsonb
);
