import { useState, useEffect } from "react";
import SEO from "@/components/seo/SEO";
import { Download, Smartphone, CheckCircle, Share, Plus, Wifi, Zap, Bell, Chrome, Globe, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const { t, language } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isChrome, setIsChrome] = useState(false);
  const [isFirefox, setIsFirefox] = useState(false);
  const [isSamsung, setIsSamsung] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));
    setIsChrome(/Chrome/.test(ua) && !/Edge|OPR|Samsung/.test(ua));
    setIsFirefox(/Firefox/.test(ua));
    setIsSamsung(/SamsungBrowser/.test(ua));
    if (window.matchMedia("(display-mode: standalone)").matches) setIsInstalled(true);
    if ((navigator as any).standalone === true) setIsInstalled(true);

    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  const features = [
    { icon: <Wifi className="w-6 h-6" />, title: t("installOffline"), desc: t("installOfflineDesc") },
    { icon: <Zap className="w-6 h-6" />, title: t("installFast"), desc: t("installFastDesc") },
    { icon: <Bell className="w-6 h-6" />, title: t("installNotif"), desc: t("installNotifDesc") },
  ];

  const fr = language === "fr";

  const chromeSteps = [
    { icon: <MoreVertical className="w-5 h-5" />, text: fr ? "Ouvrez le menu ⋮ de votre navigateur Chrome" : "Open the Chrome browser menu ⋮" },
    { icon: <Download className="w-5 h-5" />, text: fr ? "Appuyez sur « Installer l'application » ou « Ajouter à l'écran d'accueil »" : "Tap 'Install app' or 'Add to Home Screen'" },
    { icon: <CheckCircle className="w-5 h-5" />, text: fr ? "Confirmez l'installation et profitez !" : "Confirm installation and enjoy!" },
  ];

  const firefoxSteps = [
    { icon: <MoreVertical className="w-5 h-5" />, text: fr ? "Appuyez sur le menu ⋮ de Firefox" : "Tap the Firefox menu ⋮" },
    { icon: <Plus className="w-5 h-5" />, text: fr ? "Choisissez « Installer » ou « Ajouter à l'écran d'accueil »" : "Choose 'Install' or 'Add to Home Screen'" },
    { icon: <CheckCircle className="w-5 h-5" />, text: fr ? "Confirmez et c'est prêt !" : "Confirm and you're set!" },
  ];

  const samsungSteps = [
    { icon: <MoreVertical className="w-5 h-5" />, text: fr ? "Appuyez sur le menu en bas du navigateur Samsung" : "Tap the menu at the bottom of Samsung Browser" },
    { icon: <Plus className="w-5 h-5" />, text: fr ? "Appuyez sur « Ajouter page à » → « Écran d'accueil »" : "Tap 'Add page to' → 'Home screen'" },
    { icon: <CheckCircle className="w-5 h-5" />, text: fr ? "Confirmez et profitez de l'app !" : "Confirm and enjoy the app!" },
  ];

  const genericSteps = [
    { icon: <Globe className="w-5 h-5" />, text: fr ? "Utilisez Chrome, Edge ou Samsung Internet pour une meilleure expérience" : "Use Chrome, Edge or Samsung Internet for the best experience" },
    { icon: <MoreVertical className="w-5 h-5" />, text: fr ? "Ouvrez le menu de votre navigateur" : "Open your browser's menu" },
    { icon: <Download className="w-5 h-5" />, text: fr ? "Cherchez « Installer » ou « Ajouter à l'écran d'accueil »" : "Look for 'Install' or 'Add to Home Screen'" },
  ];

  const iosSteps = [
    { icon: <Share className="w-5 h-5" />, text: t("installStep1") },
    { icon: <Plus className="w-5 h-5" />, text: t("installStep2") },
    { icon: <CheckCircle className="w-5 h-5" />, text: t("installStep3") },
  ];

  const getManualSteps = () => {
    if (isIOS) return { title: t("installIOS"), steps: iosSteps, browserIcon: <Share className="w-6 h-6" /> };
    if (isChrome) return { title: fr ? "Installation via Chrome" : "Install via Chrome", steps: chromeSteps, browserIcon: <Chrome className="w-6 h-6" /> };
    if (isFirefox) return { title: fr ? "Installation via Firefox" : "Install via Firefox", steps: firefoxSteps, browserIcon: <Globe className="w-6 h-6" /> };
    if (isSamsung) return { title: fr ? "Installation via Samsung Internet" : "Install via Samsung Internet", steps: samsungSteps, browserIcon: <Globe className="w-6 h-6" /> };
    return { title: fr ? "Installation manuelle" : "Manual installation", steps: genericSteps, browserIcon: <Globe className="w-6 h-6" /> };
  };

  const manual = getManualSteps();

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Installer l'application — Dual Music" description="Installez Dual Music sur votre téléphone et accédez aux duels en un clic." path="/install" />
      <Header />
      <main className="container mx-auto px-4 py-20 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }} className="text-center mb-12">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }} className="w-24 h-24 bg-gradient-to-br from-primary/30 to-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}>
              <Smartphone className="w-12 h-12 text-primary" />
            </motion.div>
          </motion.div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">{t("installTitle")}</h1>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">{t("installDesc")}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.5 }}>
          {isInstalled ? (
            <div className="bg-card border border-border rounded-2xl p-8 text-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}>
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-2xl font-bold text-foreground mb-2">{t("installAlready")}</h2>
              <p className="text-muted-foreground">{t("installAlreadyDesc")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Auto-install button (when beforeinstallprompt is available) */}
              {deferredPrompt && (
                <div className="bg-card border-2 border-primary/50 rounded-2xl p-8 text-center space-y-4">
                  <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto">
                    <Download className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">{t("installAndroid")}</h2>
                  <p className="text-muted-foreground">{t("installAndroidDesc")}</p>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button onClick={handleInstall} size="lg" className="gap-2 text-lg px-8 bg-gradient-primary hover:shadow-glow transition-all">
                      <Download className="w-5 h-5" />{t("installBtn")}
                    </Button>
                  </motion.div>
                </div>
              )}

              {/* Manual instructions (always shown as fallback or primary on iOS) */}
              <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
                <div className="flex items-center gap-3 justify-center">
                  <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary">{manual.browserIcon}</div>
                  <h2 className="text-xl font-bold text-foreground">{manual.title}</h2>
                </div>
                <div className="space-y-4">
                  {manual.steps.map((step, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.15 }} className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl">
                      <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center shrink-0 text-primary">{step.icon}</div>
                      <div>
                        <span className="text-muted-foreground text-sm">{t("installStep")} {i + 1}</span>
                        <p className="text-foreground font-medium">{step.text}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
                {!isIOS && !deferredPrompt && (
                  <p className="text-xs text-muted-foreground text-center mt-4">
                    💡 {fr ? "Conseil : pour la meilleure expérience d'installation, utilisez Google Chrome." : "Tip: for the best install experience, use Google Chrome."}
                  </p>
                )}
              </div>
            </div>
          )}
        </motion.div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.12 }} whileHover={{ y: -4, transition: { duration: 0.2 } }} className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3 text-primary">{f.icon}</div>
              <h3 className="font-semibold text-foreground">{f.title}</h3>
              <p className="text-muted-foreground text-sm mt-1">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Install;
