/**
 * Sidebar de navigation profil (Sheet sur mobile, sticky desktop) : liste les sections selon rôle (fan/artiste/manager/mod/admin).
 */
import { useEffect, useRef } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Heart, CreditCard, Gift, Megaphone, UserCheck, Briefcase, Bell,
  Mic, Swords, Music, Radio, Video, DollarSign, User, Wallet, SlidersHorizontal, LogOut, Trophy,
  PlayCircle,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export type ProfileRole = "fan" | "artist" | "manager";

export interface ProfileTabItem {
  value: string;
  label: string;
  icon: JSX.Element;
  /** Compte affiché en badge sur l'item (ex. invitations de duel en attente) — masqué si 0/absent. */
  badge?: number;
}

/**
 * @param badges Comptes à injecter par valeur d'onglet (ex. `{ duels: 2 }`) — le sidebar reste
 *   agnostique de leur origine ; l'appelant (Profile.tsx) les charge une seule fois au montage
 *   pour qu'ils soient visibles immédiatement, sans avoir à ouvrir l'onglet concerné.
 */
export function useProfileTabs(role: ProfileRole, badges?: Record<string, number>): ProfileTabItem[] {
  const { t } = useLanguage();
  const withBadges = (items: ProfileTabItem[]): ProfileTabItem[] =>
    badges ? items.map((it) => (badges[it.value] ? { ...it, badge: badges[it.value] } : it)) : items;
  if (role === "artist") {
    return withBadges([
      { value: "dashboard",     label: t("dashboard"),         icon: <LayoutDashboard className="w-4 h-4" /> },
      { value: "profile",       label: t("artistProfile"),     icon: <Mic className="w-4 h-4" /> },
      { value: "duels",         label: t("duels"),             icon: <Swords className="w-4 h-4" /> },
      { value: "concerts",      label: t("concerts"),          icon: <Music className="w-4 h-4" /> },
      { value: "lives",         label: t("lives"),             icon: <Radio className="w-4 h-4" /> },
      { value: "competitions",  label: t("compMyCompetitions"), icon: <Mic className="w-4 h-4" /> },
      { value: "content",       label: t("navLifestyle"),      icon: <Video className="w-4 h-4" /> },
      // Regroupe TOUS les enregistrements (duel/concert/compétition/live) en attente d'édition
      // (prix + publication) ou déjà publiés — auparavant accessible seulement via un bouton
      // enfoui dans l'onglet Tableau de bord, absent de la sidebar elle-même.
      { value: "replays",       label: t("myReplays"),         icon: <PlayCircle className="w-4 h-4" /> },
      { value: "earnings",      label: t("earnings"),          icon: <DollarSign className="w-4 h-4" /> },
      { value: "followed",      label: t("followed") || t("sbFollowing"), icon: <Heart className="w-4 h-4" /> },
      { value: "transactions",  label: t("sbMyTransactions"),   icon: <Wallet className="w-4 h-4" /> },
      { value: "referral",      label: t("referralProgram"),   icon: <Gift className="w-4 h-4" /> },
      { value: "sponsor",       label: t("sbSponsor"),         icon: <Megaphone className="w-4 h-4" /> },
      { value: "preferences",   label: t("sbPreferences"),      icon: <SlidersHorizontal className="w-4 h-4" /> },
      { value: "notifications", label: t("notifs"),            icon: <Bell className="w-4 h-4" /> },
    ]);
  }
  if (role === "manager") {
    return withBadges([
      { value: "dashboard",     label: t("dashboard"),         icon: <LayoutDashboard className="w-4 h-4" /> },
      { value: "duels",         label: t("myDuelsTab"),        icon: <Swords className="w-4 h-4" /> },
      { value: "competitions",  label: t("compManagement"),    icon: <Trophy className="w-4 h-4" /> },
      { value: "profile",       label: t("artistProfile"),     icon: <User className="w-4 h-4" /> },
      // Regroupe TOUS les enregistrements (duel/compétition) que le manager a produits, en
      // attente d'édition (prix + publication) ou déjà publiés.
      { value: "replays",       label: t("myReplays"),         icon: <PlayCircle className="w-4 h-4" /> },
      { value: "earnings",      label: t("earnings"),          icon: <DollarSign className="w-4 h-4" /> },
      { value: "followed",      label: t("followed") || t("sbFollowing"), icon: <Heart className="w-4 h-4" /> },
      { value: "transactions",  label: t("sbMyTransactions"),   icon: <Wallet className="w-4 h-4" /> },
      { value: "referral",      label: t("referralProgram"),   icon: <Gift className="w-4 h-4" /> },
      { value: "sponsor",       label: t("sbSponsor"),         icon: <Megaphone className="w-4 h-4" /> },
      { value: "preferences",   label: t("sbPreferences"),      icon: <SlidersHorizontal className="w-4 h-4" /> },
      { value: "notifications", label: t("notifs"),            icon: <Bell className="w-4 h-4" /> },
    ]);
  }
  return withBadges([
    { value: "dashboard",      label: t("dashboard"),         icon: <LayoutDashboard className="w-4 h-4" /> },
    { value: "followed",       label: t("followed"),          icon: <Heart className="w-4 h-4" /> },
    { value: "subscription",   label: t("subscription"),      icon: <CreditCard className="w-4 h-4" /> },
    { value: "transactions",   label: t("sbMyTransactions"),   icon: <Wallet className="w-4 h-4" /> },
    { value: "referral",       label: t("referralProgram"),   icon: <Gift className="w-4 h-4" /> },
    { value: "sponsor",        label: t("sbSponsor"),         icon: <Megaphone className="w-4 h-4" /> },
    { value: "become-artist",  label: t("becomeArtist"),      icon: <UserCheck className="w-4 h-4" /> },
    { value: "become-manager", label: t("becomeManager"),     icon: <Briefcase className="w-4 h-4" /> },
    { value: "preferences",    label: t("sbPreferences"),      icon: <SlidersHorizontal className="w-4 h-4" /> },
    { value: "notifications",  label: t("notifs"),            icon: <Bell className="w-4 h-4" /> },
  ]);
}

const Body = ({ items, active, onSelect, onClose }: {
  items: ProfileTabItem[]; active: string; onSelect: (v: string) => void; onClose?: () => void;
}) => {
  // Fait défiler jusqu'à l'item ACTIF dès qu'on arrive sur une page (ou qu'on change d'onglet) —
  // sans ça, la liste restait scrollée là où on l'avait laissée (souvent tout en haut) même quand
  // la page actuelle correspondait à un item tout en bas : pour naviguer vers un item VOISIN de
  // la page en cours, il fallait d'abord rescroller manuellement depuis le haut à chaque fois
  // (signalé). `block: "center"` laisse voir les voisins des deux côtés, pas seulement en dessous.
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
  }, [active]);

  return (
    <ScrollArea className="flex-1 min-h-0 h-full w-full">
      <nav className="p-3 space-y-1">
        {items.map((item) => {
          const isActive = active === item.value;
          return (
            <button
              key={item.value}
              ref={isActive ? activeRef : undefined}
              onClick={() => { onSelect(item.value); onClose?.(); }}
              className={cn(
                "w-full group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all relative overflow-hidden",
                isActive
                  ? "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-primary font-semibold shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-primary" />}
              <span className={cn("shrink-0 transition-transform group-hover:scale-110", isActive && "text-primary")}>
                {item.icon}
              </span>
              <span className="flex-1 text-left truncate">{item.label}</span>
              {!!item.badge && item.badge > 0 && (
                <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </ScrollArea>
  );
};

interface ProfileSidebarProps {
  role: ProfileRole;
  active: string;
  onSelect: (v: string) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  /** Comptes de badge par valeur d'onglet (ex. `{ duels: 2 }`) — voir `useProfileTabs`. */
  badges?: Record<string, number>;
}

const LogoutFooter = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { signOut } = useAuth();
  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };
  return (
    <div className="shrink-0 p-3 border-t border-border/50 bg-background/50">
      <Button
        variant="outline"
        size="sm"
        onClick={handleLogout}
        className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
      >
        <LogOut className="w-4 h-4" />
        {t("logout")}
      </Button>
    </div>
  );
};

const ProfileSidebar = ({ role, active, onSelect, open, onOpenChange, title, badges }: ProfileSidebarProps) => {
  const items = useProfileTabs(role, badges);
  const { t } = useLanguage();
  const headerTitle = title || (role === "artist" ? t("sbArtist") : role === "manager" ? t("sbManager") : t("sbFan"));

  return (
    <>
      <aside className="hidden lg:flex flex-col w-60 shrink-0 sticky top-20 self-start h-[calc(100vh-6rem)] rounded-xl border border-border/60 bg-card/40 backdrop-blur-md overflow-hidden">
        <div className="shrink-0 p-4 border-b border-border/50 bg-gradient-to-r from-primary/10 to-transparent">
          <p className="text-xs font-semibold text-primary">{headerTitle}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{t("sbMySpace")}</p>
        </div>
        <Body items={items} active={active} onSelect={onSelect} />
        <LogoutFooter />
      </aside>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="p-0 w-72 bg-background flex flex-col">
          <div className="shrink-0 p-4 pr-12 border-b border-border/50 bg-gradient-to-r from-primary/10 to-transparent">
            <p className="text-xs font-semibold text-primary">{headerTitle}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t("sbMySpace")}</p>
          </div>
          <div className="flex-1 min-h-0">
            <Body items={items} active={active} onSelect={onSelect} onClose={() => onOpenChange(false)} />
          </div>
          <LogoutFooter />
        </SheetContent>
      </Sheet>
    </>
  );
};

export default ProfileSidebar;
