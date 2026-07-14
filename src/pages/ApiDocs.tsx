import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code, Key, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const ApiDocs = () => {
  const { t } = useLanguage();

  const endpoints = [
    {
      method: "GET",
      path: "/api/v1/duels",
      description: "Récupérer la liste des duels",
      auth: true
    },
    {
      method: "POST",
      path: "/api/v1/votes",
      description: "Voter pour un artiste pendant un duel",
      auth: true
    },
    {
      method: "GET",
      path: "/api/v1/gifts",
      description: "Récupérer le catalogue de cadeaux virtuels",
      auth: false
    },
    {
      method: "POST",
      path: "/api/v1/gifts/send",
      description: "Envoyer un cadeau à un artiste",
      auth: true
    },
    {
      method: "GET",
      path: "/api/v1/replays",
      description: "Récupérer les replays disponibles",
      auth: true
    },
    {
      method: "GET",
      path: "/api/v1/artists",
      description: "Récupérer la liste des artistes publics",
      auth: false
    },
    {
      method: "POST",
      path: "/api/v1/artists/:id/follow",
      description: "S'abonner à un artiste",
      auth: true
    },
    {
      method: "GET",
      path: "/api/v1/leaderboard",
      description: "Récupérer le classement des artistes",
      auth: false
    },
    {
      method: "GET",
      path: "/api/v1/subscriptions",
      description: "Vérifier le statut d'abonnement premium",
      auth: true
    },
    {
      method: "POST",
      path: "/api/v1/chat/:duelId",
      description: "Envoyer un message dans le chat live",
      auth: true
    },
    {
      method: "POST",
      path: "/functions/v1/livekit-token",
      description: "Obtenir un token JWT LiveKit (SFU streaming)",
      auth: true
    },
    {
      method: "POST",
      path: "/functions/v1/send-push",
      description: "Envoyer une notification Web Push (VAPID)",
      auth: true
    },
    {
      method: "POST",
      path: "/functions/v1/cinetpay-payin-init",
      description: "Initialiser une recharge Mobile Money (CinetPay)",
      auth: true
    },
    {
      method: "POST",
      path: "/functions/v1/cinetpay-payout-init",
      description: "Initialiser un retrait Mobile Money (CinetPay)",
      auth: true
    },
    {
      method: "POST",
      path: "/functions/v1/moneroo-payin-init",
      description: "Initialiser une recharge Mobile Money (Moneroo)",
      auth: true
    },
    {
      method: "POST",
      path: "/functions/v1/cinetpay-webhook-payin",
      description: "Webhook CinetPay (vérification canonique)",
      auth: false
    },
    {
      method: "POST",
      path: "/api/v1/push/subscribe",
      description: "Enregistrer un abonnement push (endpoint + p256dh + auth)",
      auth: true
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <Code className="w-16 h-16 text-primary mx-auto mb-4" />
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
              {t("apiTitle")}
            </h1>
            <p className="text-muted-foreground text-lg">
              {t("apiSubtitle")}
            </p>
          </div>

          {/* Getting Started */}
          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                {t("gettingStarted")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">{t("apiGettingStartedDesc")}</p>
              <div className="bg-muted rounded-lg p-4">
                <code className="text-sm text-foreground">
                  Authorization: Bearer YOUR_API_KEY
                </code>
              </div>
              <Button>{t("requestApiKey")}</Button>
            </CardContent>
          </Card>

          {/* Rate Limits */}
          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                {t("rateLimits")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-primary">100</div>
                  <div className="text-sm text-muted-foreground">{t("requestsPerMinute")}</div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-primary">5,000</div>
                  <div className="text-sm text-muted-foreground">{t("requestsPerHour")}</div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-primary">50,000</div>
                  <div className="text-sm text-muted-foreground">{t("requestsPerDay")}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Endpoints */}
          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                {t("endpoints")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {endpoints.map((endpoint, index) => (
                <div key={index} className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                  <Badge 
                    variant={endpoint.method === "GET" ? "secondary" : "default"}
                    className="font-mono"
                  >
                    {endpoint.method}
                  </Badge>
                  <div className="flex-1">
                    <code className="text-sm font-semibold text-foreground">{endpoint.path}</code>
                    <p className="text-sm text-muted-foreground mt-1">{endpoint.description}</p>
                  </div>
                  {endpoint.auth && (
                    <Badge variant="outline" className="flex-shrink-0">
                      <Key className="w-3 h-3 mr-1" />
                      Auth
                    </Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Example */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>{t("exampleRequest")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm text-foreground">
{`curl -X GET "https://api.dualmusic.com/v1/duels" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}
                </pre>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ApiDocs;