import { useState } from "react";
import SEO from "@/components/seo/SEO";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail, MapPin, Phone, Send } from "lucide-react";
import { toast } from "sonner";
import { usePlatformSetting, DEFAULT_CONTACT, ContactInfo } from "@/hooks/usePlatformSettings";

const Contact = () => {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const { data: contact } = usePlatformSetting<ContactInfo>("contact_info", DEFAULT_CONTACT);
  const c = { ...DEFAULT_CONTACT, ...(contact || {}) };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    toast.success(t("messageSent"));
    setIsLoading(false);
    (e.target as HTMLFormElement).reset();
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Contact — Dual Music" description="Contactez l'équipe Dual Music. Support, partenariats, presse." path="/contact" />
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <Mail className="w-16 h-16 text-primary mx-auto mb-4" />
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
              {t("contactTitle")}
            </h1>
            <p className="text-muted-foreground text-lg">
              {t("contactSubtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Contact Form */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>{t("sendMessage")}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("yourName")}</Label>
                    <Input id="name" required className="bg-muted/50" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("yourEmail")}</Label>
                    <Input id="email" type="email" required className="bg-muted/50" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="subject">{t("subject")}</Label>
                    <Input id="subject" required className="bg-muted/50" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="message">{t("yourMessage")}</Label>
                    <Textarea 
                      id="message" 
                      required 
                      rows={5} 
                      className="bg-muted/50 resize-none" 
                    />
                  </div>
                  
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        {t("send")}
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Contact Info */}
            <div className="space-y-6">
              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">{t("emailUs")}</h3>
                      <p className="text-muted-foreground text-sm mb-2">{t("emailUsDesc")}</p>
                      <a href={`mailto:${c.email}`} className="text-primary hover:underline break-all">
                        {c.email}
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">{t("callUs")}</h3>
                      <p className="text-muted-foreground text-sm mb-2">{t("callUsDesc")}</p>
                      <a href={`tel:${c.phone.replace(/\s+/g, '')}`} className="text-primary hover:underline">{c.phone}</a>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">{t("visitUs")}</h3>
                      <p className="text-muted-foreground text-sm mb-2">{t("visitUsDesc")}</p>
                      <address className="text-primary not-italic whitespace-pre-line">
                        {c.address}
                      </address>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;