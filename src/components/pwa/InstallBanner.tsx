/**
 * Bannière installation PWA : prompt natif `beforeinstallprompt`, fallback manuel par navigateur
 * (instructions iOS/Android/Desktop).
 */
import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

const BANNER_DISMISSED_KEY = "pwa-banner-dismissed";

const InstallBanner = () => {
  const [visible, setVisible] = useState(false);
  const { language } = useLanguage();

  useEffect(() => {
    // Don't show if already installed or dismissed
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (sessionStorage.getItem(BANNER_DISMISSED_KEY)) return;

    const timer = setTimeout(() => setVisible(true), 30000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem(BANNER_DISMISSED_KEY, "1");
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-fade-in md:left-auto md:right-4 md:max-w-sm">
      <div className="bg-card border border-border rounded-2xl p-4 shadow-lg flex items-center gap-3">
        <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {language === "fr" ? "Installer Dual Music" : "Install Dual Music"}
          </p>
          <p className="text-xs text-muted-foreground">
            {language === "fr"
              ? "Accédez à l'app depuis votre écran d'accueil"
              : "Access the app from your home screen"}
          </p>
        </div>
        <Link to="/install" onClick={dismiss}>
          <Button size="sm" className="bg-primary text-primary-foreground shrink-0">
            {language === "fr" ? "Installer" : "Install"}
          </Button>
        </Link>
        <button onClick={dismiss} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default InstallBanner;
