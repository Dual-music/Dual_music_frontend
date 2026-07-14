/**
 * ModerationDashboard
 * -------------------
 * Tableau de bord admin regroupant la modération en 4 onglets :
 *  1. Signalements de profils     → AccountReportsManager
 *  2. Signalements de lives        → LiveReportsManager
 *  3. Bannissements de stream      → ActiveStreamBansManager (event-scoped)
 *  4. Bannissements plateforme     → PlatformBansManager (global, admin)
 *
 * Monté dans `Admin.tsx` sous l'onglet "Modération".
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Radio, Ban, ShieldAlert } from "lucide-react";
import { AccountReportsManager } from "@/components/admin/AccountReportsManager";
import { LiveReportsManager } from "@/components/admin/LiveReportsManager";
import { ActiveStreamBansManager } from "@/components/admin/ActiveStreamBansManager";
import { PlatformBansManager } from "@/components/admin/PlatformBansManager";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Unified moderation dashboard for the admin.
 * - Profile reports (accounts reported by users).
 * - Live/concert/duel reports (events reported by viewers).
 * - Active per-event bans (live/concert/duel).
 * - Platform-wide account suspensions (temporary or permanent).
 */
export const ModerationDashboard = () => {
  const { language } = useLanguage();
  const tr = language === "en"
    ? { profiles: "Profile reports", events: "Event reports", eventBans: "Event bans", platformBans: "Platform suspensions" }
    : { profiles: "Signalements profils", events: "Signalements événements", eventBans: "Bans événement", platformBans: "Suspensions plateforme" };

  return (
    <Tabs defaultValue="profiles" className="w-full">
      <TabsList className="w-full justify-start flex-wrap h-auto">
        <TabsTrigger value="profiles" className="text-xs"><Shield className="w-3 h-3 mr-1" />{tr.profiles}</TabsTrigger>
        <TabsTrigger value="events" className="text-xs"><Radio className="w-3 h-3 mr-1" />{tr.events}</TabsTrigger>
        <TabsTrigger value="bans" className="text-xs"><Ban className="w-3 h-3 mr-1" />{tr.eventBans}</TabsTrigger>
        <TabsTrigger value="platform" className="text-xs"><ShieldAlert className="w-3 h-3 mr-1" />{tr.platformBans}</TabsTrigger>
      </TabsList>
      <TabsContent value="profiles" className="mt-4"><AccountReportsManager /></TabsContent>
      <TabsContent value="events" className="mt-4"><LiveReportsManager /></TabsContent>
      <TabsContent value="bans" className="mt-4"><ActiveStreamBansManager /></TabsContent>
      <TabsContent value="platform" className="mt-4"><PlatformBansManager /></TabsContent>
    </Tabs>
  );
};

export default ModerationDashboard;
