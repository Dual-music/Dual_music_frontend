/**
 * Gestion abonnement fan : plans Free/Pro/Premium depuis `subscription_plans`, checkout via
 * `create-checkout` (Stripe) ou Mobile Money. Contraintes votes selon tier.
 */
import { useState } from "react";
import * as subscriptions from "@/api/endpoints/subscriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Crown, Star, Zap, Check } from "lucide-react";
import { useSubscriptionPlans, useUserSubscription } from "@/hooks/useSubscription";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";

interface FanSubscriptionProps {
  userId: string;
}

const getIcon = (icon: string) => {
  switch (icon) {
    case "Zap": return Zap;
    case "Crown": return Crown;
    default: return Star;
  }
};

export const FanSubscription = ({ userId }: FanSubscriptionProps) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { currentPlanId, isLoading } = useUserSubscription();
  const { data: plans } = useSubscriptionPlans();
  const [subscribing, setSubscribing] = useState(false);

  const handleSubscribe = async (planId: string) => {
    if (planId === currentPlanId) return;
    setSubscribing(true);
    try {
      const plan = plans?.find(p => p.id === planId);
      await subscriptions.activate(planId);
      queryClient.invalidateQueries({ queryKey: ["user-subscription"] });
      toast({ title: t("profileSubUpdated"), description: `${t("profileSubUpdatedDesc")} ${plan?.name}` });
    } catch (error: any) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    } finally {
      setSubscribing(false);
    }
  };

  if (isLoading) return <div className="text-center py-8">{t("profileSubLoading")}</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t("profileSubTitle")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans?.map((plan) => {
          const Icon = getIcon(plan.icon);
          const isCurrent = currentPlanId === plan.id;
          return (
            <Card key={plan.id} className={`relative overflow-hidden ${isCurrent ? "ring-2 ring-primary" : ""}`}>
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${plan.gradient}`} />
              {isCurrent && <Badge className="absolute top-4 right-4 bg-primary">{t("profileSubCurrent")}</Badge>}
              <CardHeader className="text-center">
                <div className={`w-16 h-16 mx-auto rounded-full bg-gradient-to-r ${plan.gradient} flex items-center justify-center mb-4`}>
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>
                  <span className="text-3xl font-bold">{plan.price === 0 ? t("profileSubFree") : `$${plan.price}`}</span>
                  {plan.price > 0 && t("profileSubMonth")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500" />{f}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={isCurrent || subscribing}
                  className={`w-full ${isCurrent ? "" : `bg-gradient-to-r ${plan.gradient}`}`}
                  variant={isCurrent ? "outline" : "default"}
                >
                  {isCurrent ? t("profileSubCurrentPlan") : t("profileSubChoose")}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};