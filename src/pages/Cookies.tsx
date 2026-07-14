import Header from "@/components/Header";
import SEO from "@/components/seo/SEO";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { Cookie } from "lucide-react";

const Cookies = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Cookies — Dual Music" description="Gestion des cookies sur la plateforme Dual Music." path="/cookies" />
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <Cookie className="w-16 h-16 text-primary mx-auto mb-4" />
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
              {t("cookiesTitle")}
            </h1>
            <p className="text-muted-foreground">
              {t("lastUpdated")}: 1 janvier 2025
            </p>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="prose prose-invert max-w-none p-8 space-y-6">
              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">1. {t("cookiesSection1Title")}</h2>
                <p className="text-muted-foreground">{t("cookiesSection1Content")}</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">2. {t("cookiesSection2Title")}</h2>
                <p className="text-muted-foreground">{t("cookiesSection2Content")}</p>
                <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
                  <li>{t("cookieType1")}</li>
                  <li>{t("cookieType2")}</li>
                  <li>{t("cookieType3")}</li>
                  <li>{t("cookieType4")}</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">3. {t("cookiesSection3Title")}</h2>
                <p className="text-muted-foreground">{t("cookiesSection3Content")}</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">4. {t("cookiesSection4Title")}</h2>
                <p className="text-muted-foreground">{t("cookiesSection4Content")}</p>
              </section>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Cookies;