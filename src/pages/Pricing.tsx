import { useNavigate } from "react-router-dom";
import SEO from "@/components/seo/SEO";
import { useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Zap, Crown, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { useSubscriptionPlans, type SubscriptionPlan } from "@/hooks/useSubscription";
import { usePricingEnabled } from "@/hooks/usePlatformConfig";

const getIcon = (icon: string) => {
  switch (icon) {
    case "Zap": return Zap;
    case "Crown": return Crown;
    default: return Star;
  }
};

const Pricing = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { data: plans, isLoading } = useSubscriptionPlans();
  const { data: pricingEnabled, isLoading: pricingLoading } = usePricingEnabled();

  useEffect(() => {
    if (!pricingLoading && pricingEnabled === false) {
      navigate("/", { replace: true });
    }
  }, [pricingEnabled, pricingLoading, navigate]);

  const creditPacks = [
    { credits: 100, price: "$4.99", bonus: "" },
    { credits: 500, price: "$19.99", bonus: "+50" },
    { credits: 1000, price: "$34.99", bonus: "+150" },
    { credits: 5000, price: "$149.99", bonus: "+1000" }
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Tarifs & abonnements — Dual Music" description="Découvrez nos formules Free, Pro et Premium. Achetez des crédits pour voter, offrir des cadeaux et soutenir vos artistes." path="/pricing" />
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
            {t("pricingTitle")}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t("pricingSubtitle")}
          </p>
        </div>

        {/* Subscription Plans */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Chargement...</div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
            {plans?.map((plan, index) => {
              const IconComp = getIcon(plan.icon);
              const isPopular = plan.sort_order === 1;
              return (
                <Card 
                  key={plan.id} 
                  className={`bg-card border-border relative ${isPopular ? "ring-2 ring-primary" : ""}`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                      {t("mostPopular")}
                    </div>
                  )}
                  <CardHeader className="text-center pb-2">
                    <div className={`w-12 h-12 mx-auto mb-4 rounded-full bg-gradient-to-r ${plan.gradient} flex items-center justify-center text-white`}>
                      <IconComp className="w-6 h-6" />
                    </div>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-center">
                    <div className="mb-6">
                      <span className="text-4xl font-bold text-foreground">
                        {plan.price === 0 ? t("freeLabel") : `$${plan.price}`}
                      </span>
                      {plan.price > 0 && <span className="text-muted-foreground">/{t("perMonth")}</span>}
                    </div>
                    
                    <ul className="space-y-3 mb-6 text-left">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className="w-5 h-5 text-primary flex-shrink-0" />
                          <span className="text-sm text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Rules summary */}
                    <div className="mb-4 text-left space-y-1">
                      {plan.rules.max_votes_per_duel === -1 ? (
                        <p className="text-xs text-primary">✓ {t("unlimitedVotes")}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">• {plan.rules.max_votes_per_duel} {t("votesPerDuel")}</p>
                      )}
                      {plan.rules.no_ads && <p className="text-xs text-primary">✓ {t("noAdsLabel")}</p>}
                      {plan.rules.early_access && <p className="text-xs text-primary">✓ {t("earlyAccessLabel")}</p>}
                    </div>
                    
                    <Link to="/auth">
                      <Button 
                        className={`w-full ${isPopular ? "bg-gradient-to-r " + plan.gradient : ""}`}
                        variant={isPopular ? "default" : "outline"}
                      >
                        {plan.price === 0 ? t("getStarted") : t("subscribe")}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Credit Packs */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8 text-foreground">
            {t("creditPacks")}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {creditPacks.map((pack, index) => (
              <Card key={index} className="bg-card border-border text-center">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-primary mb-1">
                    {pack.credits}
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">
                    {t("credits")}
                    {pack.bonus && (
                      <span className="text-primary ml-1">{pack.bonus} {t("bonus")}</span>
                    )}
                  </div>
                  <div className="text-xl font-semibold text-foreground mb-4">
                    {pack.price}
                  </div>
                  <Link to="/wallet">
                    <Button variant="outline" size="sm" className="w-full">
                      {t("buy")}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Pricing;
