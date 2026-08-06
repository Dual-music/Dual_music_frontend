/**
 * Admin: AdminSidebar — navigation latérale du dashboard admin.
 *
 * Onglets localisés (FR/EN) regroupés par catégories (Modération, Contenu,
 * Paiements, Configuration…). Responsive : hamburger sur mobile, fixe sur
 * desktop. Conserve la sélection dans l'URL via query param.
 *
 * @access  role=admin
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  BarChart3, UserCheck, Briefcase, Swords, DollarSign, Users, Music, Radio,
  Video, Shield, FileText, ClipboardList, CreditCard, Trophy, Gift, Settings,
  Megaphone, User as UserIcon, BookOpen, Phone, Share2, Bell, SlidersHorizontal, Wallet, LogOut, Heart,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export interface AdminTabItem {
  value: string;
  label: string;
  icon: JSX.Element;
  badge?: number;
  badgeClass?: string;
  group: "main" | "moderation" | "content" | "config";
}

interface AdminSidebarProps {
  active: string;
  onSelect: (value: string) => void;
  stats: {
    pendingArtistRequests: number;
    pendingManagerRequests: number;
    pendingDuelRequests: number;
    pendingWithdrawals: number;
    activeLives: number;
    pendingSponsors?: number;
    pendingConcerts?: number;
  };
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function useAdminTabs(stats: AdminSidebarProps["stats"]): AdminTabItem[] {
  const { t } = useLanguage();
  return [
    { value: "stats",            label: t("adminTabStats"),         icon: <BarChart3 className="w-4 h-4" />,    group: "main" },
    { value: "profile",          label: t("profile") || "Profil",   icon: <UserIcon className="w-4 h-4" />,     group: "main" },
    { value: "transactions",     label: t("sbMyTransactions"),       icon: <Wallet className="w-4 h-4" />,       group: "main" },
    { value: "followed",         label: t("sbFollowing"),             icon: <Heart className="w-4 h-4" />,        group: "main" },
    { value: "preferences",      label: t("sbPreferences"),          icon: <SlidersHorizontal className="w-4 h-4" />, group: "main" },
    { value: "artist-requests",  label: t("adminTabArtistReq"),     icon: <UserCheck className="w-4 h-4" />,    badge: stats.pendingArtistRequests, group: "main" },
    { value: "manager-requests", label: t("adminTabManagerReq"),    icon: <Briefcase className="w-4 h-4" />,    badge: stats.pendingManagerRequests, group: "main" },
    { value: "duel-requests",    label: t("adminTabDuelReq"),       icon: <Swords className="w-4 h-4" />,       badge: stats.pendingDuelRequests, group: "main" },
    { value: "withdrawals",      label: t("adminTabWithdrawals"),   icon: <DollarSign className="w-4 h-4" />,   badge: stats.pendingWithdrawals, group: "main" },
    { value: "role-assignment",  label: t("adminTabRoleAssignment") || "Rôles",  icon: <UserCheck className="w-4 h-4" />, group: "main" },

    { value: "users",            label: t("adminTabUsers"),         icon: <Users className="w-4 h-4" />,        group: "moderation" },
    { value: "reports",          label: t("adminTabReports"),       icon: <Shield className="w-4 h-4" />,       group: "moderation" },
    { value: "logs",             label: t("adminTabLogs"),          icon: <ClipboardList className="w-4 h-4" />, group: "moderation" },

    { value: "duels",            label: t("adminTabDuels"),         icon: <Swords className="w-4 h-4" />,       group: "content" },
    { value: "competitions",     label: t("adminTabCompetitions"),  icon: <Trophy className="w-4 h-4" />,       group: "content" },
    { value: "concerts",         label: t("adminTabConcerts"),      icon: <Music className="w-4 h-4" />,        badge: stats.pendingConcerts, badgeClass: "bg-yellow-500 text-black", group: "content" },
    { value: "lives",            label: t("adminTabLives"),         icon: <Radio className="w-4 h-4" />,        badge: stats.activeLives, badgeClass: "bg-red-500", group: "content" },
    { value: "replays",          label: t("adminTabReplays"),       icon: <Video className="w-4 h-4" />,        group: "content" },
    { value: "lifestyle",        label: t("adminTabLifestyle"),     icon: <Video className="w-4 h-4" />,        group: "content" },
    { value: "concert-validation", label: t("sbConcertValidation"), icon: <Music className="w-4 h-4" />,        group: "content" },
    { value: "dedications",      label: t("sbDedications"),          icon: <Heart className="w-4 h-4" />,        group: "content" },
    { value: "gifts",            label: t("sbGiftShop"),             icon: <Gift className="w-4 h-4" />,         group: "content" },
    { value: "blogs",            label: t("adminTabBlog"),          icon: <FileText className="w-4 h-4" />,     group: "content" },

    { value: "subscriptions",    label: t("adminTabSubscriptions"), icon: <CreditCard className="w-4 h-4" />,   group: "config" },
    { value: "leaderboard",      label: t("adminTabLeaderboard"),   icon: <Trophy className="w-4 h-4" />,       group: "config" },
    { value: "referrals",        label: t("adminTabReferrals"),     icon: <Gift className="w-4 h-4" />,         group: "config" },
    { value: "platform",         label: t("adminTabPlatform"),      icon: <Settings className="w-4 h-4" />,     group: "config" },
    { value: "economy",          label: t("adminTabEconomy"),       icon: <DollarSign className="w-4 h-4" />,   group: "config" },
    { value: "announcements",    label: t("adminTabAnnouncements"), icon: <Megaphone className="w-4 h-4" />,    group: "config" },
    { value: "sponsors",         label: t("sbSponsors"),             icon: <Megaphone className="w-4 h-4" />,   badge: stats.pendingSponsors, badgeClass: "bg-yellow-500 text-black", group: "config" },
    { value: "contact",          label: t("sbContact"),              icon: <Phone className="w-4 h-4" />,        group: "config" },
    { value: "communities",      label: t("sbCommunities"),          icon: <Share2 className="w-4 h-4" />,       group: "config" },
    { value: "push",             label: t("sbPushNotifs"),           icon: <Bell className="w-4 h-4" />,         group: "config" },
    { value: "documents",        label: t("sbDocuments"),            icon: <BookOpen className="w-4 h-4" />,     group: "config" },
  ];
}

const groupLabels: Record<AdminTabItem["group"], { fr: string; en: string }> = {
  main:       { fr: "Principal",    en: "Main" },
  moderation: { fr: "Modération",   en: "Moderation" },
  content:    { fr: "Contenus",     en: "Content" },
  config:     { fr: "Configuration", en: "Configuration" },
};

const SidebarBody = ({ items, active, onSelect, onClose }: {
  items: AdminTabItem[];
  active: string;
  onSelect: (v: string) => void;
  onClose?: () => void;
}) => {
  const { language } = useLanguage();
  const groups: AdminTabItem["group"][] = ["main", "moderation", "content", "config"];
  return (
    <ScrollArea className="flex-1 min-h-0 h-full w-full">
      <nav className="p-3 space-y-5">
        {groups.map((g) => {
          const list = items.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {language === "en" ? groupLabels[g].en : groupLabels[g].fr}
              </p>
              <div className="space-y-1">
                {list.map((item) => {
                  const isActive = active === item.value;
                  return (
                    <button
                      key={item.value}
                      onClick={() => { onSelect(item.value); onClose?.(); }}
                      className={cn(
                        "w-full group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all relative overflow-hidden",
                        isActive
                          ? "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-primary font-semibold shadow-sm"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-primary" />
                      )}
                      <span className={cn("shrink-0 transition-transform group-hover:scale-110", isActive && "text-primary")}>
                        {item.icon}
                      </span>
                      <span className="flex-1 text-left truncate">{item.label}</span>
                      {!!item.badge && item.badge > 0 && (
                        <Badge className={cn("h-5 px-1.5 text-[10px] shrink-0", item.badgeClass || "")}>
                          {item.badge}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </ScrollArea>
  );
};

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

const AdminSidebar = ({ active, onSelect, stats, open, onOpenChange }: AdminSidebarProps) => {
  const items = useAdminTabs(stats);
  const { t } = useLanguage();

  return (
    <>
      {/* Desktop sidebar (sticky) */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 sticky top-20 self-start h-[calc(100vh-6rem)] rounded-xl border border-border/60 bg-card/40 backdrop-blur-md overflow-hidden">
        <div className="shrink-0 p-4 border-b border-border/50 bg-gradient-to-r from-primary/10 to-transparent">
          <p className="text-xs font-semibold text-primary">{t("sbAdminPanel")}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Synergy Network</p>
        </div>
        <SidebarBody items={items} active={active} onSelect={onSelect} />
        <LogoutFooter />
      </aside>

      {/* Mobile sheet */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="p-0 w-72 bg-background flex flex-col">
          <div className="shrink-0 p-4 pr-12 border-b border-border/50 bg-gradient-to-r from-primary/10 to-transparent">
            <p className="text-xs font-semibold text-primary">{t("sbAdminPanel")}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Synergy Network</p>
          </div>
          <div className="flex-1 min-h-0">
            <SidebarBody items={items} active={active} onSelect={onSelect} onClose={() => onOpenChange(false)} />
          </div>
          <LogoutFooter />
        </SheetContent>
      </Sheet>
    </>
  );
};

export default AdminSidebar;
