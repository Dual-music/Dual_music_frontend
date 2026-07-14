import Header from "@/components/Header";
import SEO from "@/components/seo/SEO";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

const Terms = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Conditions générales — Dual Music" description="Conditions générales d'utilisation de la plateforme Dual Music." path="/terms" />
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <FileText className="w-16 h-16 text-primary mx-auto mb-4" />
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
              {t("termsTitle")}
            </h1>
            <p className="text-muted-foreground">
              {t("lastUpdated")}: 1 janvier 2025
            </p>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="prose prose-invert max-w-none p-8 space-y-6">
              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">1. {t("termsSection1Title")}</h2>
                <p className="text-muted-foreground">{t("termsSection1Content")}</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">2. {t("termsSection2Title")}</h2>
                <p className="text-muted-foreground">{t("termsSection2Content")}</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">3. {t("termsSection3Title")}</h2>
                <p className="text-muted-foreground">{t("termsSection3Content")}</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">4. {t("termsSection4Title")}</h2>
                <p className="text-muted-foreground">{t("termsSection4Content")}</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">5. {t("termsSection5Title")}</h2>
                <p className="text-muted-foreground">{t("termsSection5Content")}</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-foreground mb-4">6. {t("termsSection6Title")}</h2>
                <p className="text-muted-foreground">{t("termsSection6Content")}</p>
              </section>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Terms;