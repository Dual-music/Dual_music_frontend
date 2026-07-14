import { Mic2, Video, Gift, Ticket, TrendingUp, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";

const Features = () => {
  const { t } = useLanguage();

  const features = [
    {
      icon: Mic2,
      title: t("duelTitle"),
      description: t("duelDesc"),
      color: "text-primary",
    },
    {
      icon: Video,
      title: t("liveTitle"),
      description: t("liveDesc"),
      color: "text-accent",
    },
    {
      icon: Gift,
      title: t("virtualGifts"),
      description: t("virtualGiftsDesc"),
      color: "text-neon-pink",
    },
    {
      icon: Ticket,
      title: t("ticketSystem"),
      description: t("ticketSystemDesc"),
      color: "text-electric-blue",
    },
    {
      icon: TrendingUp,
      title: t("advancedAnalytics"),
      description: t("advancedAnalyticsDesc"),
      color: "text-neon-cyan",
    },
    {
      icon: Shield,
      title: t("securePayments"),
      description: t("securePaymentsDesc"),
      color: "text-primary",
    },
  ];
  return (
    <section className="py-20 relative">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 space-y-4 animate-fade-in">
          <h2 className="text-4xl md:text-5xl font-bold">
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              {t("featuresTitle")}
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {t("heroDescription")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card
                key={index}
                className="p-6 bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all hover:shadow-elegant group animate-fade-in cursor-pointer"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="space-y-4">
                  <div className={`w-12 h-12 rounded-lg bg-gradient-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-6 h-6 ${feature.color}`} />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;
