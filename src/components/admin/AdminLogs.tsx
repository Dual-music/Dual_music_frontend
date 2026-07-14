/**
 * Admin: AdminLogs — journal d'audit des actions admin.
 *
 * Lecture filtrée de `admin_logs` (acteur, action, cible, payload, date),
 * permettant la traçabilité complète des opérations sensibles : bans,
 * suppressions, validations, ajustements de configuration.
 *
 * @access  role=admin
 */
import { useEffect, useState } from "react";
import * as admin from "@/api/endpoints/admin";
import { AdminTable } from "@/components/admin/AdminTable";
import { Badge } from "@/components/ui/badge";
import { 
  ShieldCheck, ShieldX, UserCheck, UserX, Trash2, 
  StopCircle, CheckCircle, XCircle, Star, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";

interface AdminLog {
  id: string;
  admin_id: string;
  admin_name: string | null;
  action_type: string;
  target_type: string;
  target_id: string | null;
  target_name: string | null;
  details: any;
  created_at: string;
}

const AdminLogs = () => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fmt = (dt: string | null) =>
    dt ? formatTz(dt, "dd MMM yyyy HH:mm:ss", { timezone: tz, language }) : "—";

  const ACTION_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    approve_artist:   { label: t("adminLogsArtistApproved"),   icon: UserCheck,   color: "bg-green-500/10 text-green-500 border-green-500/30" },
    reject_artist:    { label: t("adminLogsArtistRejected"),   icon: UserX,       color: "bg-red-500/10 text-red-500 border-red-500/30" },
    approve_manager:  { label: t("adminLogsManagerApproved"),  icon: UserCheck,   color: "bg-green-500/10 text-green-500 border-green-500/30" },
    reject_manager:   { label: t("adminLogsManagerRejected"),  icon: UserX,       color: "bg-red-500/10 text-red-500 border-red-500/30" },
    approve_withdrawal: { label: t("adminLogsWithdrawalDone"), icon: CheckCircle, color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
    reject_withdrawal:  { label: t("adminLogsWithdrawalRejected"), icon: XCircle, color: "bg-red-500/10 text-red-500 border-red-500/30" },
    approve_duel:     { label: t("adminLogsDuelApproved"),     icon: CheckCircle, color: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
    reject_duel:      { label: t("adminLogsDuelRejected"),     icon: XCircle,     color: "bg-red-500/10 text-red-500 border-red-500/30" },
    assign_role:      { label: t("adminLogsRoleAssigned"),     icon: ShieldCheck, color: "bg-purple-500/10 text-purple-500 border-purple-500/30" },
    remove_role:      { label: t("adminLogsRoleRemoved"),      icon: ShieldX,     color: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
    ban_user:         { label: t("adminLogsUserBanned"),       icon: UserX,       color: "bg-red-500/10 text-red-500 border-red-500/30" },
    delete_user:      { label: t("adminLogsUserDeleted"),      icon: Trash2,      color: "bg-red-600/10 text-red-600 border-red-600/30" },
    stop_live:        { label: t("adminLogsLiveStopped"),      icon: StopCircle,  color: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
    stop_concert:     { label: t("adminLogsConcertStopped"),   icon: StopCircle,  color: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
    stop_duel:        { label: t("adminLogsDuelStopped"),      icon: StopCircle,  color: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
    delete_duel:      { label: t("adminLogsDuelDeleted"),      icon: Trash2,      color: "bg-red-500/10 text-red-500 border-red-500/30" },
    delete_concert:   { label: t("adminLogsConcertDeleted"),   icon: Trash2,      color: "bg-red-500/10 text-red-500 border-red-500/30" },
    delete_live:      { label: t("adminLogsLiveDeleted"),      icon: Trash2,      color: "bg-red-500/10 text-red-500 border-red-500/30" },
    welcome_email:    { label: t("adminLogsWelcomeEmail"),     icon: Star,        color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" },
  };

  const TARGET_LABELS: Record<string, string> = {
    user: t("adminLogsTargetUser"), artist: t("adminLogsTargetArtist"), manager: t("adminLogsTargetManager"),
    withdrawal: t("adminLogsTargetWithdrawal"), duel: t("adminLogsTargetDuel"), duel_request: t("adminLogsTargetDuelRequest"),
    live: t("adminLogsTargetLive"), concert: t("adminLogsTargetConcert"), role: t("adminLogsTargetRole"),
  };

  const ActionBadge = ({ actionType }: { actionType: string }) => {
    const cfg = ACTION_CONFIG[actionType] || { label: actionType, icon: RefreshCw, color: "bg-muted text-muted-foreground border-border" };
    const Icon = cfg.icon;
    return (
      <Badge variant="outline" className={`${cfg.color} flex items-center gap-1 whitespace-nowrap`}>
        <Icon className="w-3 h-3" />
        {cfg.label}
      </Badge>
    );
  };

  const TargetBadge = ({ targetType }: { targetType: string }) => (
    <Badge variant="secondary" className="text-xs">{TARGET_LABELS[targetType] || targetType}</Badge>
  );

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await admin.getLogs({ limit: 500 });
      setLogs((data as unknown as AdminLog[]) || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLogs(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t("adminLogsTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("adminLogsDesc")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {t("adminLogsRefresh")}
        </Button>
      </div>

      <AdminTable
        data={logs}
        searchKeys={["admin_name", "target_name", "action_type", "target_type"]}
        emptyMessage={t("adminLogsNoAction")}
        columns={[
          {
            key: "created_at", label: t("adminLogsColDate"), sortable: true,
            render: (log) => <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">{fmt(log.created_at)}</span>,
          },
          {
            key: "admin_name", label: t("adminLogsColAdmin"), sortable: true,
            render: (log) => <span className="font-medium text-sm">{log.admin_name || "Admin"}</span>,
          },
          {
            key: "action_type", label: t("adminLogsColAction"), sortable: true,
            render: (log) => <ActionBadge actionType={log.action_type} />,
          },
          {
            key: "target_type", label: t("adminLogsColTarget"), sortable: true,
            render: (log) => <TargetBadge targetType={log.target_type} />,
          },
          {
            key: "target_name", label: t("adminLogsColConcerned"), sortable: true,
            render: (log) => <span className="text-sm">{log.target_name || "—"}</span>,
          },
          {
            key: "details", label: t("adminLogsColDetails"),
            render: (log) => {
              const d = log.details;
              if (!d || Object.keys(d).length === 0) return <span className="text-muted-foreground text-xs">—</span>;
              const parts: string[] = [];
              if (d.role) parts.push(`${t("adminLogsDetailRole")}: ${d.role}`);
              if (d.amount) parts.push(`${t("adminLogsDetailAmount")}: $${d.amount}`);
              if (d.status) parts.push(`${t("adminLogsDetailStatus")}: ${d.status}`);
              if (d.manager) parts.push(`${t("adminLogsDetailManager")}: ${d.manager}`);
              return <span className="text-xs text-muted-foreground">{parts.join(" · ") || JSON.stringify(d).slice(0, 60)}</span>;
            },
          },
        ]}
      />
    </div>
  );
};

export default AdminLogs;
