import Header from "@/components/Header";
import SEO from "@/components/seo/SEO";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";

const Privacy = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Politique de confidentialité — Dual Music" description="Comment Dual Music protège vos données personnelles." path="/privacy" />
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <Shield className="w-16 h-16 text-primary mx-auto mb-4" />
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
              {t("privacyTitle")}
            </h1>
            <p className="text-muted-foreground">
              {t("lastUpdated")}: 1 janvier 2025
            </p>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="prose prose-invert max-w-none p-8 space-y-6">
              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">1. {t("privacySection1Title")}</h2>
                <p className="text-muted-foreground">{t("privacySection1Content")}</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">2. {t("privacySection2Title")}</h2>
                <p className="text-muted-foreground">{t("privacySection2Content")}</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">3. {t("privacySection3Title")}</h2>
                <p className="text-muted-foreground">{t("privacySection3Content")}</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">4. {t("privacySection4Title")}</h2>
                <p className="text-muted-foreground">{t("privacySection4Content")}</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">5. {t("privacySection5Title")}</h2>
                <p className="text-muted-foreground">{t("privacySection5Content")}</p>
              </section>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Privacy;