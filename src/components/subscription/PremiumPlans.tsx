/**
 * Affichage plans premium : grille tarifaire `subscription_plans`, toggle via `pricing_config`.
 * CTA vers checkout.
 */
import { useState } from "react";
import { Check, Crown, Star, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import * as subscriptions from "@/api/endpoints/subscriptions";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useSubscriptionPlans } from "@/hooks/useSubscription";
import { useQueryClient } from "@tanstack/react-query";

const getIcon = (icon: string) => {
  switch (icon) {
    case "Zap": return <Zap className="w-8 h-8" />;
    case "Crown": return <Crown className="w-8 h-8" />;
    default: return <Star className="w-8 h-8" />;
  }
};

interface PremiumPlansProps {
  currentPlan?: string;
  onPlanSelected?: (planId: string) => void;
}

export const PremiumPlans = ({ currentPlan = "free", onPlanSelected }: PremiumPlansProps) => {
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: plans } = useSubscriptionPlans();
  const queryClient = useQueryClient();

  const handleSubscribe = async (planId: string) => {
    if (planId === "free" || planId === currentPlan) return;
    setLoading(planId);
    try {
      if (!user) {
        toast({ title: "Connexion requise", description: "Veuillez vous connecter pour souscrire", variant: "destructive" });
        return;
      }

      const plan = plans?.find(p => p.id === planId);
      await subscriptions.activate(planId);

      toast({ title: "Abonnement activé !", description: `Vous êtes maintenant ${plan?.name}` });
      queryClient.invalidateQueries({ queryKey: ["user-subscription"] });
      onPlanSelected?.(planId);
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {plans?.map((plan) => {
        const isPopular = plan.sort_order === 1;
        return (
          <Card
            key={plan.id}
            className={`relative p-6 flex flex-col ${isPopular ? "ring-2 ring-primary" : ""} ${currentPlan === plan.id ? "ring-2 ring-green-500" : ""}`}
          >
            {isPopular && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">Populaire</Badge>
            )}
            {currentPlan === plan.id && (
              <Badge className="absolute -top-3 right-4 bg-green-500">Votre plan</Badge>
            )}

            <div className={`w-16 h-16 rounded-full bg-gradient-to-r ${plan.gradient} flex items-center justify-center text-white mb-4`}>
              {getIcon(plan.icon)}
            </div>

            <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
            
            <div className="mb-6">
              <span className="text-4xl font-bold">{plan.price === 0 ? "Gratuit" : `$${plan.price}`}</span>
              {plan.price > 0 && <span className="text-muted-foreground">/mois</span>}
            </div>

            <ul className="space-y-3 mb-6 flex-1">
              {plan.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              className={`w-full ${isPopular ? `bg-gradient-to-r ${plan.gradient}` : ""}`}
              variant={plan.id === "free" ? "outline" : "default"}
              disabled={currentPlan === plan.id || loading !== null}
              onClick={() => handleSubscribe(plan.id)}
            >
              {loading === plan.id
                ? "Chargement..."
                : currentPlan === plan.id
                ? "Plan actuel"
                : plan.id === "free"
                ? "Plan de base"
                : "Choisir ce plan"}
            </Button>
          </Card>
        );
      })}
    </div>
  );
};
