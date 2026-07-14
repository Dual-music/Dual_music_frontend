/**
 * En-tête de la page Profile : avatar, nom display (`get_display_profiles`), rôle actif, solde wallet (`useWallet`) avec toggle visibilité.
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Moon, Sun, Wallet, Eye, EyeOff, Crown, Mic, Briefcase, Star, Menu,
} from "lucide-react";
import logoImg from "@/assets/logo-tr.png";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import NotificationBell from "@/components/notifications/NotificationBell";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Role = "admin" | "artist" | "manager" | "fan";

interface ProfileHeaderProps {
  primaryRole?: Role;
  onMenuToggle?: () => void;
  showMenuButton?: boolean;
}

const roleStyle: Record<Role, { gradient: string; label: (t: any) => string; icon: JSX.Element }> = {
  admin:   { gradient: "from-red-500 to-orange-500",    label: (t) => t("administration"),     icon: <Crown className="w-3.5 h-3.5" /> },
  artist:  { gradient: "from-purple-500 to-pink-500",   label: (t) => t("artistDefault"),      icon: <Mic className="w-3.5 h-3.5" /> },
  manager: { gradient: "from-blue-500 to-cyan-500",     label: (t) => t("profileManagerRole"), icon: <Briefcase className="w-3.5 h-3.5" /> },
  fan:     { gradient: "from-green-500 to-emerald-500", label: (t) => t("profileFanRole"),     icon: <Star className="w-3.5 h-3.5" /> },
};

const ProfileHeader = ({ primaryRole, onMenuToggle, showMenuButton }: ProfileHeaderProps) => {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { user } = useAuth();
  const { balance: walletBalance } = useWallet();
  const [showBalance, setShowBalance] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("showWalletBalance");
    if (saved !== null) setShowBalance(saved === "true");
  }, []);

  const toggleBalance = () => {
    const next = !showBalance;
    setShowBalance(next);
    localStorage.setItem("showWalletBalance", String(next));
  };


  const style = primaryRole ? roleStyle[primaryRole] : null;
  const langCode = language === "fr" ? "fr" : "gb";
  const langFlag = (
    <img
      src={`https://flagcdn.com/${langCode}.svg`}
      alt=""
      aria-hidden
      className="inline-block rounded-[2px] shadow-sm"
      style={{ height: 14, width: "auto" }}
      loading="lazy"
    />
  );
  const langLabel = language === "fr" ? "FR" : "EN";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background lg:bg-background/85 lg:backdrop-blur-xl border-b border-border/50">
      {style && <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${style.gradient} opacity-80`} />}
      <nav className="container mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/" className="flex items-center group shrink-0">
            <img src={logoImg} alt="Dual Music" className="h-9 transition-transform group-hover:scale-105" />
          </Link>
          {style && (
            <Badge className={`hidden sm:inline-flex ml-1 bg-gradient-to-r ${style.gradient} text-white border-0 gap-1`}>
              {style.icon}
              <span className="text-[11px] font-semibold">{style.label(t)}</span>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {user && walletBalance !== null && (
            <div className="flex items-center gap-0.5">
              <Link to="/wallet" className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors">
                <Wallet className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-primary">{showBalance ? walletBalance : "•••"}</span>
              </Link>
              <button onClick={toggleBalance} className="p-1 rounded-full hover:bg-muted transition-colors hidden sm:block" aria-label="Toggle balance">
                {showBalance ? <EyeOff className="w-3 h-3 text-muted-foreground" /> : <Eye className="w-3 h-3 text-muted-foreground" />}
              </button>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-foreground gap-1 px-2 h-9">
                <span className="text-base">{langFlag}</span>
                <span className="text-xs font-semibold hidden sm:inline">{langLabel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border">
              <DropdownMenuItem onClick={() => setLanguage("fr")} className={`cursor-pointer gap-2 ${language === "fr" ? "bg-primary/10 text-primary font-semibold" : ""}`}>
                <img src="https://flagcdn.com/fr.svg" alt="" aria-hidden className="inline-block rounded-[2px] shadow-sm" style={{ height: 14, width: "auto" }} /> Français
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLanguage("en")} className={`cursor-pointer gap-2 ${language === "en" ? "bg-primary/10 text-primary font-semibold" : ""}`}>
                <img src="https://flagcdn.com/gb.svg" alt="" aria-hidden className="inline-block rounded-[2px] shadow-sm" style={{ height: 14, width: "auto" }} /> English
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="h-9 w-9 hidden sm:inline-flex">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          {user && <NotificationBell />}

          {showMenuButton && (
            <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9" onClick={onMenuToggle} aria-label="Menu">
              <Menu className="w-5 h-5" />
            </Button>
          )}
        </div>
      </nav>
    </header>
  );
};

export default ProfileHeader;
