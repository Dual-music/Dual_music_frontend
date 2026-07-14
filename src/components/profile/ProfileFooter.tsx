/**
 * Pied de la page Profile : liens légaux, version, attribution Synergy Network.
 */
import { useLanguage } from "@/contexts/LanguageContext";

const ProfileFooter = () => {
  const { t } = useLanguage();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border/50 bg-card/40 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-4 text-center text-xs sm:text-sm text-muted-foreground">
        © {year} Dual Music par <span className="font-semibold text-primary">Synergy Network</span>. {t("allRightsReserved")}
      </div>
    </footer>
  );
};

export default ProfileFooter;
