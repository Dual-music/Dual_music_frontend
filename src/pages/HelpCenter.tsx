import Header from "@/components/Header";
import SEO from "@/components/seo/SEO";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle, MessageCircle, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const HelpCenter = () => {
  const { t } = useLanguage();

  const faqs = [
    {
      question: t("faq1Question"),
      answer: t("faq1Answer")
    },
    {
      question: t("faq2Question"),
      answer: t("faq2Answer")
    },
    {
      question: t("faq3Question"),
      answer: t("faq3Answer")
    },
    {
      question: t("faq4Question"),
      answer: t("faq4Answer")
    },
    {
      question: t("faq5Question"),
      answer: t("faq5Answer")
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Centre d'aide — Dual Music" description="Réponses aux questions fréquentes sur Dual Music : duels, concerts, paiements, cadeaux." path="/help" />
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <HelpCircle className="w-16 h-16 text-primary mx-auto mb-4" />
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
              {t("helpCenterTitle")}
            </h1>
            <p className="text-muted-foreground text-lg">
              {t("helpCenterSubtitle")}
            </p>
          </div>

          {/* FAQ Section */}
          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                {t("frequentlyAsked")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="text-left">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          {/* Contact Section */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>{t("needMoreHelp")}</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
              <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                <Mail className="w-8 h-8 text-primary flex-shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">{t("emailSupport")}</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    {t("emailSupportDesc")}
                  </p>
                  <a href="mailto:support@dualmusic.com" className="text-primary hover:underline">
                    support@dualmusic.com
                  </a>
                </div>
              </div>
              
              <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                <Phone className="w-8 h-8 text-primary flex-shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">{t("phoneSupport")}</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    {t("phoneSupportDesc")}
                  </p>
                  <span className="text-primary">+33 1 23 45 67 89</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center mt-8">
            <Link to="/user-guide">
              <Button variant="outline" size="lg">
                {t("viewUserGuide")}
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default HelpCenter;