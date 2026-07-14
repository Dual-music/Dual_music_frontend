/**
 * Mini-dashboard admin embarqué dans le profil : compteurs utilisateurs, artistes en attente, retraits, revenus 30j. Réservé `role=admin`.
 */
import { useEffect, useState } from "react";
import * as admin from "@/api/endpoints/admin";
import { Card } from "@/components/ui/card";
import { UserCheck, Briefcase, Swords, DollarSign } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export const AdminProfileStats = () => {
  const { t } = useLanguage();
  const [stats, setStats] = useState({
    totalArtists: 0,
    totalManagers: 0,
    totalDuels: 0,
    pendingWithdrawals: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const s = await admin.getStats().catch(() => ({} as Record<string, unknown>));

      setStats({
        totalArtists: Number(s["totalArtists"] ?? 0),
        totalManagers: Number(s["totalManagers"] ?? 0),
        // admin.getStats() now returns `totalDuels` (all-time Duel.count());
        // `liveDuels` kept as a defensive fallback.
        totalDuels: Number(s["totalDuels"] ?? s["liveDuels"] ?? 0),
        pendingWithdrawals: Number(s["pendingWithdrawals"] ?? 0),
      });
    };

    fetchStats();
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative isolate">
      <Card className="p-5 text-center bg-card bg-gradient-to-br from-yellow-500/10 to-amber-500/5 border-yellow-500/20 transform-gpu">
        <UserCheck className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
        <p className="text-2xl font-bold">{stats.totalArtists}</p>
        <p className="text-xs text-muted-foreground">{t("profileAdminArtists")}</p>
      </Card>
      <Card className="p-5 text-center bg-card bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-blue-500/20 transform-gpu">
        <Briefcase className="w-8 h-8 mx-auto mb-2 text-blue-500" />
        <p className="text-2xl font-bold">{stats.totalManagers}</p>
        <p className="text-xs text-muted-foreground">{t("profileAdminManagers")}</p>
      </Card>
      <Card className="p-5 text-center bg-card bg-gradient-to-br from-purple-500/10 to-violet-500/5 border-purple-500/20 transform-gpu">
        <Swords className="w-8 h-8 mx-auto mb-2 text-purple-500" />
        <p className="text-2xl font-bold">{stats.totalDuels}</p>
        <p className="text-xs text-muted-foreground">{t("profileAdminDuels")}</p>
      </Card>
      <Card className="p-5 text-center bg-card bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/20 transform-gpu">
        <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-500" />
        <p className="text-2xl font-bold">{stats.pendingWithdrawals}</p>
        <p className="text-xs text-muted-foreground">{t("profileAdminPendingWithdrawals")}</p>
      </Card>
    </div>
  );
};