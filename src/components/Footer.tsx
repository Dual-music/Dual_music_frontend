import { Facebook, Instagram, Youtube, Download, MessageCircle, Send, Linkedin, Music2 } from "lucide-react";
import logoImg from "@/assets/logo-tr.png";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePricingEnabled } from "@/hooks/usePlatformConfig";
import { usePlatformSetting, DEFAULT_SOCIAL, SocialLinks } from "@/hooks/usePlatformSettings";

const PricingLink = () => {
  const { t } = useLanguage();
  const { data: enabled } = usePricingEnabled();
  if (enabled === false) return null;
  return (
    <Link to="/pricing" className="text-muted-foreground hover:text-primary transition-colors">
      {t("pricing")}
    </Link>
  );
};

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const TikTokIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.86a8.16 8.16 0 0 0 4.77 1.52V6.93a4.85 4.85 0 0 1-1.84-.24z" />
  </svg>
);

const DiscordIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.7 5.55l-.999 3.648 3.788-.897zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
  </svg>
);

const Footer = () => {
  const { t, language } = useLanguage();
  const { data: social } = usePlatformSetting<SocialLinks>("social_links_config", DEFAULT_SOCIAL);
  const s = { ...DEFAULT_SOCIAL, ...(social || {}) };

  const socialItems = [
    { url: s.facebook, Icon: Facebook, label: "Facebook" },
    { url: s.x, Icon: XIcon, label: "X" },
    { url: s.instagram, Icon: Instagram, label: "Instagram" },
    { url: s.youtube, Icon: Youtube, label: "YouTube" },
    { url: s.tiktok, Icon: TikTokIcon, label: "TikTok" },
    { url: s.whatsapp, Icon: WhatsAppIcon, label: "WhatsApp" },
    { url: s.telegram, Icon: Send, label: "Telegram" },
    { url: s.linkedin, Icon: Linkedin, label: "LinkedIn" },
    { url: s.discord, Icon: DiscordIcon, label: "Discord" },
  ].filter((i) => i.url && i.url.trim().length > 0);

  return (
    <footer className="bg-card border-t border-border/50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-4">
            <div className="flex items-center">
              <img src={logoImg} alt="Dual Music" className="h-10" />
            </div>
            <p className="text-sm text-muted-foreground">{t("footerTagline")}</p>
            {socialItems.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {socialItems.map(({ url, Icon, label }) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 hover:scale-110 transition-all"
                  >
                    <Icon className="w-4 h-4 text-primary" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-foreground">{t("footerPlatform")}</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/duels" className="text-muted-foreground hover:text-primary transition-colors">{t("duels")}</Link></li>
              <li><Link to="/lives" className="text-muted-foreground hover:text-primary transition-colors">{t("lives")}</Link></li>
              <li><Link to="/lifestyle" className="text-muted-foreground hover:text-primary transition-colors">{t("lifestyle")}</Link></li>
              <li><Link to="/replays" className="text-muted-foreground hover:text-primary transition-colors">{t("replays")}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-foreground">{t("footerResources")}</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/help" className="text-muted-foreground hover:text-primary transition-colors">{t("helpCenter")}</Link></li>
              <li><PricingLink /></li>
              <li><Link to="/blog" className="text-muted-foreground hover:text-primary transition-colors">{t("blog")}</Link></li>
              <li><Link to="/user-guide" className="text-muted-foreground hover:text-primary transition-colors">{t("userGuide")}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-foreground">{t("footerLegal")}</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/terms" className="text-muted-foreground hover:text-primary transition-colors">{t("termsOfUse")}</Link></li>
              <li><Link to="/privacy" className="text-muted-foreground hover:text-primary transition-colors">{t("privacyPolicy")}</Link></li>
              <li><Link to="/cookies" className="text-muted-foreground hover:text-primary transition-colors">{t("cookies")}</Link></li>
              <li><Link to="/contact" className="text-muted-foreground hover:text-primary transition-colors">{t("contact")}</Link></li>
              <li>
                <Link to="/install" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                  <Download className="w-4 h-4" />
                  {language === "fr" ? "Télécharger l'app" : "Download app"}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-4 text-center text-sm text-muted-foreground">
          <p>
            © 2025 Dual Music {language === "fr" ? "par" : "by"}{" "}
            <span className="font-semibold text-foreground">Synergy Network</span>. {t("allRightsReserved")}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
