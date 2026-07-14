/**
 * useSubscription
 * ---------------
 * État d'abonnement courant (Free / Pro / Premium) lu depuis
 * `user_subscriptions` joint à `subscription_plans`.
 *
 * Expose les plafonds applicables (max_votes_per_duel, max_gifts_per_day, …)
 * pour gating UI. La vérification d'effort est doublée côté RPC pour la
 * sécurité — ne JAMAIS se reposer uniquement sur ce hook pour autoriser.
 *
 * @returns { plan, isPro, isPremium, limits, loading }
 */
import { useQuery } from "@tanstack/react-query";

import * as subscriptionsApi from "@/api/endpoints/subscriptions";
import { useAuth } from "@/contexts/AuthContext";

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  icon: string;
  gradient: string;
  sort_order: number;
  is_active: boolean;
  features: string[];
  rules: {
    max_votes_per_duel: number; // -1 = unlimited
    premium_replays: boolean;
    early_access: boolean;
    virtual_meets: boolean;
    exclusive_gifts: boolean;
    no_ads: boolean;
    exclusive_content: boolean;
    priority_support: boolean;
  };
}

const defaultRules: SubscriptionPlan["rules"] = {
  max_votes_per_duel: 3,
  premium_replays: false,
  early_access: false,
  virtual_meets: false,
  exclusive_gifts: false,
  no_ads: false,
  exclusive_content: false,
  priority_support: false,
};

// Fetch all plans
export const useSubscriptionPlans = () => {
  return useQuery({
    queryKey: ["subscription-plans"],
    queryFn: async () => {
      const data = (await subscriptionsApi.listPlans()) as any[];
      return (data || [])
        .filter((p) => p.is_active !== false)
        .map((p) => ({
          ...p,
          features: Array.isArray(p.features) ? p.features : [],
          rules: { ...defaultRules, ...(typeof p.rules === "object" ? p.rules : {}) },
        })) as SubscriptionPlan[];
    },
    staleTime: 5 * 60 * 1000,
  });
};

// Fetch current user's subscription + plan rules
export const useUserSubscription = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data: plans } = useSubscriptionPlans();

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["user-subscription", userId],
    queryFn: async () => {
      const data = await subscriptionsApi.mySubscription();
      return (data as any) ?? null;
    },
    enabled: !!userId,
  });

  const currentPlanId = subscription?.subscription_type || "free";
  const currentPlan = plans?.find((p) => p.id === currentPlanId) || null;
  const rules = currentPlan?.rules || defaultRules;

  return {
    isLoading,
    userId,
    currentPlanId,
    currentPlan,
    rules,
    plans: plans || [],
    isProOrAbove: currentPlanId === "pro" || currentPlanId === "premium",
    isPremium: currentPlanId === "premium",
  };
};
