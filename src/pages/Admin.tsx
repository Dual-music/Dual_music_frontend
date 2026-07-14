/**
 * Page: Admin (/admin)
 *
 * Tableau de bord administrateur global de la plateforme. Centralise toutes
 * les opérations de gouvernance : utilisateurs, artistes/managers, duels,
 * concerts, lives, replays, lifestyle, paiements, modération, configuration
 * et statistiques.
 *
 * Accès : réservé aux utilisateurs ayant le rôle `admin` dans `user_roles`
 * (vérifié via la RPC `has_role`). Toute action sensible (bannissement,
 * suppression, validation, ajustement de config) est journalisée dans
 * `admin_logs` via le sous-composant correspondant.
 *
 * Organisation :
 *   - Onglets `<Tabs>` : Stats, Users, Artists, Managers, Duels, Concerts,
 *     Lives, Replays, Lifestyle, Moderation, Payments, Config, Logs…
 *   - Chaque onglet délègue à un sous-composant dédié dans `components/admin/`.
 *   - Confirmations sensibles via `useConfirmDialog` (jamais de `window.confirm`).
 *
 * @route   /admin
 * @access  role=admin
 * @see     src/components/admin/AdminSidebar.tsx
 * @see     src/components/admin/ModerationDashboard.tsx
 * @see     src/components/admin/PlatformConfigManager.tsx
 */
import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as adminApi from "@/api/endpoints/admin";
import * as replaysApi from "@/api/endpoints/replays";
import * as creatorsApi from "@/api/endpoints/creators";
import * as withdrawalsApi from "@/api/endpoints/withdrawals";
import * as moderationApi from "@/api/endpoints/moderation";
import * as concertsApi from "@/api/endpoints/concerts";
import * as duelsApi from "@/api/endpoints/duels";
import * as livesApi from "@/api/endpoints/lives";
import * as sponsorsApi from "@/api/endpoints/sponsors";
import { getPublicSetting } from "@/api/endpoints/settings";
import { useAuth } from "@/contexts/AuthContext";
import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfileFooter from "@/components/profile/ProfileFooter";
import AdminSidebar from "@/components/admin/AdminSidebar";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Users, Music, Swords, Video, TrendingUp, UserCheck, Briefcase,
  DollarSign, CheckCircle, XCircle, Clock, Eye, Ban, Trash2,
  BarChart3, Radio, Shield, ExternalLink, CreditCard, Hash, Link2, StopCircle, ClipboardList,
  Trophy, Gift, EyeOff, Settings, Megaphone
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BlogManager } from "@/components/admin/BlogManager";
import { ModerationDashboard } from "@/components/admin/ModerationDashboard";
import AdminStats from "@/components/admin/AdminStats";
import { AdminTable } from "@/components/admin/AdminTable";
import { SocialLinksDisplay } from "@/components/admin/SocialLinksDisplay";
import AdminLogs from "@/components/admin/AdminLogs";
import { SubscriptionPlansManager } from "@/components/admin/SubscriptionPlansManager";
import LeaderboardSeasonsManager from "@/components/admin/LeaderboardSeasonsManager";
import ReferralConfigManager from "@/components/admin/ReferralConfigManager";
import AdminSponsorManager from "@/components/admin/AdminSponsorManager";
import PlatformConfigManager from "@/components/admin/PlatformConfigManager";
import LifestyleManager from "@/components/admin/LifestyleManager";
import EconomicConfigManager from "@/components/admin/EconomicConfigManager";
import GiftsVotesSettingsView from "@/components/admin/GiftsVotesSettingsView";
import RevenueAnalytics from "@/components/admin/RevenueAnalytics";
import TransactionsLedger from "@/components/admin/TransactionsLedger";
import AdminAnnouncementsManager from "@/components/admin/AdminAnnouncementsManager";
import ContactInfoManager from "@/components/admin/ContactInfoManager";
import SocialLinksManager from "@/components/admin/SocialLinksManager";
import PushConfigManager from "@/components/admin/PushConfigManager";
import AdminDocumentsManager from "@/components/admin/AdminDocumentsManager";
import AdminGiftsManager from "@/components/admin/AdminGiftsManager";
import AdminConcertValidation from "@/components/admin/AdminConcertValidation";
import AdminDedicationsManager from "@/components/admin/AdminDedicationsManager";
import CinetPayAdminPanel from "@/components/admin/CinetPayAdminPanel";
import AdminCompetitionsManager from "@/components/admin/AdminCompetitionsManager";
import RoleAssignmentManager from "@/components/admin/RoleAssignmentManager";
import PreferencesPanel from "@/components/profile/PreferencesPanel";
import TransactionsPanel from "@/components/profile/TransactionsPanel";
import { WithdrawalPinGate } from "@/components/profile/WithdrawalPinGate";
import { useLanguage } from "@/contexts/LanguageContext";
import { getUiPrefs } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import { useCurrencyFormatter } from "@/hooks/useCurrency";

// ─── Types ───────────────────────────────────────────────────────────────────
interface ArtistRequest {
  id: string; user_id: string; description: string; social_links: any;
  status: string; created_at: string; user_name?: string; user_email?: string;
  justification_document_url?: string | null;
}
interface ManagerRequest {
  id: string; user_id: string; bio: string; experience: string;
  status: string; created_at: string; user_name?: string; user_email?: string;
}
interface DuelRequest {
  id: string; requester_id: string; opponent_id: string; status: string;
  proposed_date: string | null; message: string | null; manager_id?: string | null;
  created_at: string; requester_name?: string; opponent_name?: string; manager_name?: string;
}
interface WithdrawalRequest {
  id: string; user_id: string; amount: number; payment_method: string | null;
  payment_details: any; status: string; created_at: string;
  user_name?: string; user_email?: string;
}
interface Manager { id: string; user_id: string; display_name: string | null; }
interface LiveRow {
  id: string; artist_id: string; title: string | null; status: string;
  started_at: string; ended_at?: string | null; viewer_count: number | null; artist_name?: string;
}
interface ConcertRow {
  id: string; title: string; artist_name: string; scheduled_date: string;
  status: string; ticket_price: number; tickets_sold: number | null;
}
interface UserRow {
  id: string; full_name: string | null; email: string; is_banned: boolean | null;
  created_at: string; roles?: string[]; artist_profile?: boolean; manager_profile?: boolean;
}
interface DuelRow {
  id: string; artist1_id: string; artist2_id: string; manager_id: string | null;
  status: string; scheduled_time: string | null; winner_id: string | null;
  started_at?: string | null; ended_at?: string | null;
  artist1_name?: string; artist2_name?: string; manager_name?: string; winner_name?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (dt: string | null) => {
  if (!dt) return "—";
  // Use stored language at format time (best-effort outside React tree)
  const lang = (typeof document !== "undefined" && document.documentElement.lang === "en") ? "en" : "fr";
  return formatTz(dt, "dd MMM yyyy HH:mm", { timezone: getUiPrefs().timezone, language: lang as "fr" | "en" });
};

const createStatusBadge = (t: (key: string) => string) => (status: string) => {
  switch (status) {
    case "pending": return <Badge variant="outline" className="border-yellow-500 text-yellow-500"><Clock className="w-3 h-3 mr-1" />{t("adminStatusPending")}</Badge>;
    case "approved": case "completed": return <Badge className="bg-green-500 text-white"><CheckCircle className="w-3 h-3 mr-1" />{t("adminStatusApproved")}</Badge>;
    case "rejected": return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />{t("adminStatusRejected")}</Badge>;
    case "accepted": return <Badge variant="outline" className="border-blue-500 text-blue-500"><CheckCircle className="w-3 h-3 mr-1" />{t("adminStatusAccepted")}</Badge>;
    case "admin_pending": return <Badge variant="outline" className="border-orange-500 text-orange-500"><Clock className="w-3 h-3 mr-1" />{t("adminStatusAdminRequired")}</Badge>;
    case "live": return <Badge className="bg-red-500 text-white animate-pulse"><Radio className="w-3 h-3 mr-1" />{t("adminStatusLive")}</Badge>;
    case "upcoming": return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />{t("adminStatusUpcoming")}</Badge>;
    case "ended": return <Badge variant="secondary">{t("adminStatusEnded")}</Badge>;
    default: return <Badge variant="secondary">{status}</Badge>;
  }
};

// ─── Payment details display ──────────────────────────────────────────────────
const PaymentDetailsDisplay = ({ details, method }: { details: any; method: string | null }) => {
  if (!details && !method) return <span className="text-muted-foreground text-sm">Non renseigné</span>;

  let parsed: Record<string, any> = {};
  if (typeof details === "string") {
    try { parsed = JSON.parse(details); } catch { parsed = { valeur: details }; }
  } else if (typeof details === "object" && details !== null) {
    parsed = details;
  }

  const getIcon = (key: string) => {
    const k = key.toLowerCase();
    if (k.includes("iban")) return <Hash className="w-4 h-4 text-blue-500" />;
    if (k.includes("stripe") || k.includes("lien") || k.includes("link")) return <Link2 className="w-4 h-4 text-purple-500" />;
    if (k.includes("phone") || k.includes("numero") || k.includes("mobile") || k.includes("tel")) return <CreditCard className="w-4 h-4 text-green-500" />;
    return <CreditCard className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-2">
      {method && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">{method}</Badge>
        </div>
      )}
      {Object.entries(parsed).map(([key, val]) => {
        const strVal = String(val);
        const isLink = strVal.startsWith("http");
        return (
          <div key={key} className="flex items-start gap-2 p-2 bg-muted/30 rounded-md">
            {getIcon(key)}
            <div>
              <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
              {isLink ? (
                <a href={strVal} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                  {strVal} <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <p className="text-sm font-mono font-medium select-all">{strVal}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Detail dialog generic ────────────────────────────────────────────────────
const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-4 py-2 border-b border-border last:border-0">
    <span className="font-medium text-muted-foreground text-sm">{label}</span>
    <div className="col-span-2 text-sm break-words">{children}</div>
  </div>
);

// ─── Duel Request Row ─────────────────────────────────────────────────────────
const DuelRequestRow = ({
  request, managers, adminUserId, onApprove, onReject, getStatusBadge
}: {
  request: DuelRequest; managers: Manager[]; adminUserId?: string | null;
  onApprove: (managerId: string, scheduledDate?: string, ticketPrice?: number, allowsSponsorAds?: boolean) => void;
  onReject: () => void;
  getStatusBadge: (s: string) => JSX.Element;
}) => {
  const [selectedManager, setSelectedManager] = useState<string>(request.manager_id || "");
  const [scheduledDate, setScheduledDate] = useState<string>(request.proposed_date || "");
  const [ticketPrice, setTicketPrice] = useState<number>(0);
  const [allowsSponsorAds, setAllowsSponsorAds] = useState<boolean>(true);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const { toast } = useToast();

  const canApprove = request.status === "accepted" || request.status === "admin_pending";
  const isApproved = request.status === "approved";

  const managerName = managers.find(m => m.user_id === (request.manager_id))?.display_name || request.manager_name || "—";

  const handleUpdateDuelDate = async () => {
    if (!scheduledDate) return;
    try {
      // The approved request produced a duel between the two artists. Locate it
      // via the by-artist filter and match the opponent, then patch its
      // scheduled_time (admin-only field on PATCH /duels/:id).
      const candidates = (await duelsApi.listDuels({
        artistId: request.requester_id,
        limit: 100,
      })) as Array<Record<string, any>>;
      const duel = (candidates || []).find(
        (d) =>
          (d.artist1_id === request.requester_id && d.artist2_id === request.opponent_id) ||
          (d.artist1_id === request.opponent_id && d.artist2_id === request.requester_id),
      );
      if (!duel?.id) {
        toast({
          title: "Introuvable",
          description: "Aucun duel correspondant à cette demande n'a été trouvé.",
          variant: "destructive",
        });
        return;
      }
      await duelsApi.updateDuel(duel.id as string, { scheduledTime: scheduledDate });
      toast({ title: "Date mise à jour", description: "La date du duel a été modifiée." });
      setIsEditingDate(false);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Échec de la mise à jour de la date.",
        variant: "destructive",
      });
    }
  };

  return (
    <tr className="border-b hover:bg-muted/20 transition-colors">
      <td className="p-4 font-medium">{request.requester_name}</td>
      <td className="p-4">{request.opponent_name}</td>
      <td className="p-4">
        {canApprove || isEditingDate ? (
          <Input type="datetime-local" value={scheduledDate ? scheduledDate.slice(0, 16) : ""} onChange={(e) => setScheduledDate(e.target.value)} className="w-[200px]" />
        ) : (
          <div className="flex items-center gap-2">
            <span>{fmt(request.proposed_date)}</span>
            {isApproved && <Button size="sm" variant="ghost" onClick={() => setIsEditingDate(true)}><Clock className="w-3 h-3 mr-1" />Modifier</Button>}
          </div>
        )}
      </td>
      <td className="p-4">{getStatusBadge(request.status)}</td>
      <td className="p-4">
        {canApprove ? (
          <Select value={selectedManager} onValueChange={setSelectedManager}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
            <SelectContent>
              {adminUserId && (
                <SelectItem value={adminUserId}>👑 Admin (moi) — joue le rôle de manager</SelectItem>
              )}
              {managers.map((m) => <SelectItem key={m.id} value={m.user_id}>{m.display_name || "Manager"}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm">{managerName}</span>
        )}
      </td>
      <td className="p-4">
        {canApprove && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={0.5}
                value={ticketPrice}
                onChange={(e) => setTicketPrice(Number(e.target.value))}
                className="w-[100px]"
                placeholder="Prix $"
              />
              <span className="text-xs text-muted-foreground">{ticketPrice === 0 ? "Gratuit" : `${ticketPrice} $`}</span>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={allowsSponsorAds}
                onChange={(e) => setAllowsSponsorAds(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Autoriser les publicités sponsor
            </label>
            <div className="flex gap-2">
              <Button size="sm" className="bg-green-500 hover:bg-green-600" onClick={() => onApprove(selectedManager, scheduledDate, ticketPrice, allowsSponsorAds)} disabled={!selectedManager || !scheduledDate}>
                <CheckCircle className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="destructive" onClick={onReject}><XCircle className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
        {isEditingDate && (
          <div className="flex gap-2">
            <Button size="sm" onClick={handleUpdateDuelDate} disabled={!scheduledDate}><CheckCircle className="w-4 h-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => setIsEditingDate(false)}><XCircle className="w-4 h-4" /></Button>
          </div>
        )}
      </td>
    </tr>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { formatPrice, formatCreditsLabel } = useCurrencyFormatter();
  const statusBadge = createStatusBadge(t);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { user, profile, isAdmin, ready } = useAuth();
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, string[]>>({});
  const [concerts, setConcerts] = useState<ConcertRow[]>([]);
  const [duels, setDuels] = useState<DuelRow[]>([]);
  const [lives, setLives] = useState<LiveRow[]>([]);
  const [replays, setReplays] = useState<any[]>([]);
  const [artistRequests, setArtistRequests] = useState<ArtistRequest[]>([]);
  const [managerRequests, setManagerRequests] = useState<ManagerRequest[]>([]);
  const [duelRequests, setDuelRequests] = useState<DuelRequest[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [approvalRequest, setApprovalRequest] = useState<WithdrawalRequest | null>(null);
  const [approvalProvider, setApprovalProvider] = useState<string>("cinetpay");
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [providersCfg, setProvidersCfg] = useState<Record<string, { enabled: boolean; min_amount_credits: number; mode: string }>>({});
  const [managers, setManagers] = useState<Manager[]>([]);
  const [artistProfileIds, setArtistProfileIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getPublicSetting("withdrawal_providers_config", null)
      .then((value) => { if (value) setProvidersCfg(value as any); })
      .catch(() => { /* non-blocking */ });
  }, []);

  const [stats, setStats] = useState({
    totalUsers: 0, totalConcerts: 0, totalDuels: 0, totalReplays: 0,
    pendingArtistRequests: 0, pendingManagerRequests: 0, pendingDuelRequests: 0,
    pendingWithdrawals: 0, activeLives: 0, pendingSponsors: 0,
  });

  // Sidebar navigation state — synced with URL ?tab=
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "stats";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab !== activeTab) setActiveTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSidebarSelect = (v: string) => {
    if (v === "profile") {
      navigate("/profile");
      return;
    }
    if (v === "transactions") {
      navigate("/transactions");
      return;
    }
    if (v === "followed") {
      navigate("/profile?tab=followed");
      return;
    }
    setActiveTab(v);
    setSearchParams({ tab: v }, { replace: true });
  };

  // Ref to hold current admin info without re-renders
  const adminRef = useRef<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) { navigate("/auth"); return; }
    if (!isAdmin) {
      toast({ title: t("adminAccessDenied"), description: t("adminNoPermission"), variant: "destructive" });
      navigate("/");
      setLoading(false);
      return;
    }
    adminRef.current = {
      id: user.id,
      name: (profile?.full_name as string | null | undefined) || user.email || "Admin",
    };
    loadDashboardData().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, isAdmin]);

  // ── Log admin action ──────────────────────────────────────────────────────
  const logAdminAction = async (
    actionType: string,
    targetType: string,
    targetId?: string | null,
    targetName?: string | null,
    details?: Record<string, any>
  ) => {
    // Best-effort audit write. Many admin mutations are already logged
    // server-side; this explicit endpoint records dashboard-initiated actions.
    // Never let a logging failure surface to the operator.
    await adminApi
      .writeLog({ actionType, targetType, targetId, targetName, details })
      .catch(() => {});
  };

  const loadDashboardData = async () => {
    try {
      // Single consolidated dashboard fetch (11 lists in one call).
      const dashboard = await adminApi.getDashboard();
      const usersData = { data: (dashboard.profiles || []) as any[] };
      const concertsData = { data: (dashboard.artistConcerts || []) as any[] };
      const duelsData = { data: (dashboard.duels || []) as any[] };
      const livesData = { data: (dashboard.artistLives || []) as any[] };
      const replaysData = { data: (dashboard.replayVideos || []) as any[] };
      const artistReqData = { data: (dashboard.artistRequests || []) as any[] };
      const managerReqData = { data: (dashboard.managerRequests || []) as any[] };
      const duelReqData = { data: (dashboard.duelRequests || []) as any[] };
      const withdrawalData = { data: (dashboard.withdrawalRequests || []) as any[] };
      const managersData = { data: (dashboard.managerProfiles || []) as any[] };
      const artistProfilesData = { data: (dashboard.artistProfiles || []) as any[] };

      const allUsers = usersData.data || [];
      const userMap = new Map(allUsers.map(u => [u.id, { name: u.full_name, email: u.email }]));

      // Artist profiles set (for redirect logic)
      const artistPublicSet = new Set<string>(
        (artistProfilesData.data || []).filter(ap => ap.is_public).map(ap => ap.user_id)
      );
      setArtistProfileIds(artistPublicSet);

      // Roles map — resolved via the admin roles-batch endpoint.
      const rolesRows = await adminApi.rolesBatch(allUsers.map(u => u.id));
      const rolesMap: Record<string, string[]> = {};
      (rolesRows || []).forEach(r => {
        if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
        rolesMap[r.user_id].push(r.role);
      });
      setUserRoles(rolesMap);

      // Users enriched
      setUsers(allUsers.map(u => ({ ...u, roles: rolesMap[u.id] || [] })));

      // Concerts from artist_concerts
      setConcerts((concertsData.data || []).map(c => ({
        ...c,
        artist_name: userMap.get(c.artist_id)?.name || "Artiste inconnu",
      })));

      // Managers
      const enrichedManagers = (managersData.data || []).map(m => ({
        ...m,
        display_name: m.display_name || allUsers.find(u => u.id === m.user_id)?.full_name || "Manager"
      }));
      setManagers(enrichedManagers);

      // Duels enriched
      setDuels((duelsData.data || []).map(d => ({
        ...d,
        artist1_name: userMap.get(d.artist1_id)?.name || "Artiste 1",
        artist2_name: userMap.get(d.artist2_id)?.name || "Artiste 2",
        manager_name: d.manager_id ? (enrichedManagers.find(m => m.user_id === d.manager_id)?.display_name || userMap.get(d.manager_id)?.name || "Manager") : "—",
        winner_name: d.winner_id ? (userMap.get(d.winner_id)?.name || "Inconnu") : "En cours",
      })));

      // Lives enriched
      setLives((livesData.data || []).map(l => ({
        ...l,
        artist_name: userMap.get(l.artist_id)?.name || "Artiste inconnu",
      })));

      setReplays(replaysData.data || []);

      // Requests enriched
      const artistReqs: ArtistRequest[] = (artistReqData.data || []).map(req => ({
        ...req,
        user_name: userMap.get(req.user_id)?.name || "Inconnu",
        user_email: userMap.get(req.user_id)?.email || ""
      }));
      setArtistRequests(artistReqs);

      const managerReqs: ManagerRequest[] = (managerReqData.data || []).map(req => ({
        ...req,
        user_name: userMap.get(req.user_id)?.name || "Inconnu",
        user_email: userMap.get(req.user_id)?.email || ""
      }));
      setManagerRequests(managerReqs);

      const duelReqs: DuelRequest[] = (duelReqData.data || []).map(req => ({
        ...req,
        requester_name: userMap.get(req.requester_id)?.name || "Inconnu",
        opponent_name: userMap.get(req.opponent_id)?.name || "Inconnu",
        manager_name: req.manager_id ? (enrichedManagers.find(m => m.user_id === req.manager_id)?.display_name || userMap.get(req.manager_id)?.name || "Manager") : undefined,
      }));
      setDuelRequests(duelReqs);

      const withdrawals: WithdrawalRequest[] = (withdrawalData.data || []).map(req => ({
        ...req,
        user_name: userMap.get(req.user_id)?.name || "Inconnu",
        user_email: userMap.get(req.user_id)?.email || ""
      }));
      setWithdrawalRequests(withdrawals);

      setStats({
        totalUsers: allUsers.length,
        totalConcerts: concertsData.data?.length || 0,
        totalDuels: duelsData.data?.length || 0,
        totalReplays: replaysData.data?.length || 0,
        pendingArtistRequests: artistReqs.filter(r => r.status === "pending").length,
        pendingManagerRequests: managerReqs.filter(r => r.status === "pending").length,
        pendingDuelRequests: duelReqs.filter(r => r.status === "pending" || r.status === "accepted" || r.status === "admin_pending").length,
        pendingWithdrawals: withdrawals.filter(r => r.status === "pending").length,
        activeLives: (livesData.data || []).filter(l => l.status === "live").length,
        pendingSponsors: 0,
      });

      // Sponsor pending count (best-effort).
      try {
        const requests = await sponsorsApi.listRequests();
        const count = (requests || []).filter((r: any) => r.status === "pending" || r.status === "paid").length;
        setStats(s => ({ ...s, pendingSponsors: count }));
      } catch (_e) { /* non-blocking */ }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
      toast({ title: t("error"), description: t("adminLoadError"), variant: "destructive" });
    }
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleArtistRequest = async (requestId: string, _userId: string, status: "approved" | "rejected") => {
    try {
      // Backend atomically updates the request, grants the role, creates the
      // artist profile, and notifies the applicant + logs the admin action.
      await creatorsApi.reviewArtistRequest(requestId, { approve: status === "approved" });
      toast({ title: status === "approved" ? t("adminArtistApproved") : t("adminRequestRejected") });
      await loadDashboardData();
    } catch (error: any) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    }
  };

  const handleManagerRequest = async (requestId: string, _userId: string, status: "approved" | "rejected") => {
    try {
      await creatorsApi.reviewManagerRequest(requestId, { approve: status === "approved" });
      toast({ title: status === "approved" ? t("adminManagerApproved") : t("adminRequestRejected") });
      await loadDashboardData();
    } catch (error: any) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    }
  };

  const handleDuelRequest = async (requestId: string, status: "approved" | "rejected", managerId?: string, scheduledDate?: string, ticketPrice?: number, allowsSponsorAds?: boolean) => {
    const duelReq = duelRequests.find(r => r.id === requestId);
    try {
      if (status === "approved" && !managerId) {
        toast({ title: t("error"), description: t("adminSelectManager"), variant: "destructive" });
        return;
      }
      if (!duelReq) return;
      // Backend atomically updates the request, creates the duel, notifies the
      // parties, and logs the admin action.
      if (status === "approved") {
        await adminApi.approveDuelRequest(requestId, {
          managerId,
          scheduledDate: scheduledDate || duelReq.proposed_date,
          ticketPrice: ticketPrice ?? 0,
          allowsSponsorAds: allowsSponsorAds ?? true,
        });
      } else {
        await adminApi.rejectDuelRequest(requestId);
      }
      toast({ title: status === "approved" ? t("adminDuelValidated") : t("adminRequestRejected") });
      await loadDashboardData();
    } catch (error: any) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    }
  };

  const handleWithdrawalRequest = async (requestId: string, status: "completed" | "rejected") => {
    const withdrawal = withdrawalRequests.find(r => r.id === requestId);
    if (status === "completed") {
      // Ouvre le sélecteur de provider — le traitement réel se fait dans handleApproveWithProvider.
      setApprovalRequest(withdrawal ?? null);
      setApprovalProvider("cinetpay");
      return;
    }
    try {
      // Rejection: backend flips status, refunds if needed, and notifies.
      await withdrawalsApi.reject(requestId);
      toast({ title: t("adminWithdrawalRejected") });
      await loadDashboardData();
    } catch (error: any) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    }
  };

  const handleApproveWithProvider = async () => {
    if (!approvalRequest) return;
    setApprovalSubmitting(true);
    try {
      // Backend processes the payout via the chosen provider + notifies.
      await withdrawalsApi.complete(approvalRequest.id, { provider: approvalProvider });
      toast({ title: t("adminWithdrawalDone"), description: `Provider: ${approvalProvider}` });
      setApprovalRequest(null);
      await loadDashboardData();
    } catch (e: any) {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const handleStopLive = async (liveId: string) => {
    const live = lives.find(l => l.id === liveId);
    confirm({
      title: t("adminConfirmStopLive"),
      description: t("adminStopLiveDesc"),
      confirmLabel: t("adminStopLiveBtn"),
      cancelLabel: t("cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await livesApi.endLive(liveId);
          toast({ title: t("adminLiveStopped"), description: t("adminLiveStopped") });
          await loadDashboardData();
        } catch (error: any) {
          toast({ title: t("error"), description: error.message, variant: "destructive" });
        }
      }
    });
  };

  const handleStopConcert = async (concertId: string) => {
    const concert = concerts.find(c => c.id === concertId);
    confirm({
      title: t("adminConfirmStopConcert"),
      description: t("adminStopConcertDesc"),
      confirmLabel: t("adminStopConcertBtn"),
      cancelLabel: t("cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await concertsApi.updateArtistConcert(concertId, { status: "ended" });
          toast({ title: t("adminConcertStopped") });
          await loadDashboardData();
        } catch (error: any) {
          toast({ title: t("error"), description: error.message, variant: "destructive" });
        }
      }
    });
  };

  const handleAssignRole = async (userId: string, role: "moderator" | "admin", userName?: string | null) => {
    confirm({
      title: `${t("adminAssignRole")} "${role === "admin" ? t("adminAdmin") : t("adminModerator")}"`,
      description: `${t("adminConfirmAssign")} ${userName || t("adminColUser")} ? ${t("adminExtendedPermissions")}`,
      confirmLabel: t("adminAssignRole"),
      cancelLabel: t("cancel"),
      variant: role === "admin" ? "warning" : "info",
      onConfirm: async () => {
        try {
          await adminApi.grantRole({ userId, role });
          await logAdminAction("assign_role", "role", userId, userName, { role });
          toast({ title: t("adminRoleAssigned"), description: `${role}` });
          await loadDashboardData();
        } catch (error: any) {
          toast({ title: t("error"), description: error.message, variant: "destructive" });
        }
      }
    });
  };

  const handleRemoveRole = async (userId: string, role: string, userName?: string | null) => {
    confirm({
      title: `${t("adminRemoveRole")} "${role}"`,
      description: `${t("adminConfirmRemoveRole")} ${userName || t("adminColUser")} ?`,
      confirmLabel: t("adminRemoveRole"),
      cancelLabel: t("cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await adminApi.revokeRole({ userId, role });
          await logAdminAction("remove_role", "role", userId, userName, { role });
          toast({ title: t("adminRemoveRole") });
          await loadDashboardData();
        } catch (error: any) {
          toast({ title: t("error"), description: error.message, variant: "destructive" });
        }
      }
    });
  };

  const handleBanUser = async (userId: string, userName?: string | null) => {
    confirm({
      title: t("adminConfirmBan"),
      description: `${userName || t("adminColUser")} ${t("adminBanDesc")}`,
      confirmLabel: t("adminBan"),
      cancelLabel: t("cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await moderationApi.createPlatformBan({ userId, reason: "", permanent: true });
          toast({ title: t("adminUserBanned") });
          loadDashboardData();
        } catch (error: any) {
          toast({ title: t("error"), description: error.message, variant: "destructive" });
        }
      }
    });
  };

  const handleDeleteUser = async (userId: string, userName?: string | null) => {
    confirm({
      title: t("adminConfirmDelete"),
      description: `${t("adminDeleteDesc")} (${userName || t("adminColUser")})`,
      confirmLabel: t("adminDeleteConfirmBtn"),
      cancelLabel: t("cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await adminApi.deleteUser(userId);
          toast({ title: t("adminUserDeleted") });
          loadDashboardData();
        } catch (error: any) {
          toast({ title: t("error"), description: error.message, variant: "destructive" });
        }
      }
    });
  };

  const handleDeleteDuel = async (duelId: string) => {
    const duel = duels.find(d => d.id === duelId);
    confirm({
      title: t("adminConfirmDeleteDuel"),
      description: t("adminDeleteDuelDesc"),
      confirmLabel: t("adminDeleteDuelBtn"),
      cancelLabel: t("cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await adminApi.deleteDuel(duelId);
          toast({ title: t("adminDuelDeleted") });
          loadDashboardData();
        } catch (error: any) {
          toast({ title: t("error"), description: error.message, variant: "destructive" });
        }
      }
    });
  };

  const handleStopDuel = async (duelId: string) => {
    const duel = duels.find(d => d.id === duelId);
    confirm({
      title: t("adminConfirmStopDuel"),
      description: t("adminStopDuelDesc"),
      confirmLabel: t("adminStopDuelBtn"),
      cancelLabel: t("cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await duelsApi.updateDuel(duelId, { status: "ended" });
          toast({ title: t("adminDuelStopped") });
          loadDashboardData();
        } catch (error: any) {
          toast({ title: t("error"), description: error.message, variant: "destructive" });
        }
      }
    });
  };

  const handleDeleteConcert = async (concertId: string) => {
    const concert = concerts.find(c => c.id === concertId);
    confirm({
      title: t("adminConfirmDeleteConcert"),
      description: t("adminDeleteConcertDesc"),
      confirmLabel: t("adminDeleteConcertBtn"),
      cancelLabel: t("cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await concertsApi.deleteArtistConcert(concertId);
          toast({ title: t("adminConcertDeleted") });
          loadDashboardData();
        } catch (error: any) {
          toast({ title: t("error"), description: error.message, variant: "destructive" });
        }
      }
    });
  };

  const handleDeleteLive = async (liveId: string) => {
    const live = lives.find(l => l.id === liveId);
    confirm({
      title: t("adminConfirmDeleteLive"),
      description: t("adminDeleteLiveDesc"),
      confirmLabel: t("adminDeleteLiveBtn"),
      cancelLabel: t("cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await adminApi.deleteLive(liveId);
          toast({ title: t("adminLiveDeleted") });
          loadDashboardData();
        } catch (error: any) {
          toast({ title: t("error"), description: error.message, variant: "destructive" });
        }
      }
    });
  };

  // ── Navigate to user profile ───────────────────────────────────────────────
  const navigateToUserProfile = (user: UserRow) => {
    const roles = userRoles[user.id] || [];
    // Check if artist with public profile
    if (roles.includes("artist") && artistProfileIds.has(user.id)) {
      navigate(`/artist/${user.id}`);
    } else if (roles.includes("artist")) {
      // Artist without public profile yet — go to public artist page (may be incomplete)
      navigate(`/artist/${user.id}`);
    } else {
      // For non-artists: navigate to their profile page
      // Since we can't visit another user's profile without a public profile system,
      // we open a detail dialog instead — handled in the table now
      toast({
        title: t("adminNoPublicProfile"),
        description: `${user.full_name || t("adminColUser")} ${t("adminNoPublicProfileDesc")}`,
      });
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p>{t("loading")}</p></div>;
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {confirmDialog}
      <Dialog open={!!approvalRequest} onOpenChange={(o) => !o && setApprovalRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("adminApproveWithdrawalTitle") || "Approuver le retrait"}</DialogTitle>
          </DialogHeader>
          {approvalRequest && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                <div><span className="text-muted-foreground">{t("adminColUser") || "Utilisateur"} :</span> <span className="font-medium">{approvalRequest.user_name}</span></div>
                <div><span className="text-muted-foreground">{t("adminPaymentAmount") || "Montant"} :</span> <span className="font-bold text-green-500">{Number(approvalRequest.amount).toLocaleString()} Crédits</span></div>
                <div className="text-xs text-muted-foreground">{approvalRequest.payment_method} • {(approvalRequest.payment_details as any)?.phone_number || (approvalRequest.payment_details as any)?.iban || (approvalRequest.payment_details as any)?.paypal_email || "—"}</div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{t("adminApproveProviderLabel") || "Choisir le compte de paiement"}</label>
                <Select value={approvalProvider} onValueChange={setApprovalProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {providersCfg.cinetpay?.enabled !== false && <SelectItem value="cinetpay">CinetPay (Mobile Money)</SelectItem>}
                    {providersCfg.moneroo?.enabled !== false && <SelectItem value="moneroo">Moneroo (Mobile Money)</SelectItem>}
                    {providersCfg.stripe?.enabled !== false && <SelectItem value="stripe">Stripe (Carte — manuel)</SelectItem>}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  {approvalProvider === "stripe"
                    ? (t("adminApproveStripeNote") || "Stripe : la demande sera marquée comme payée. Le virement réel doit être effectué manuellement depuis ton tableau Stripe.")
                    : (t("adminApproveAutoNote") || "Le payout est déclenché automatiquement vers la coordonnée du demandeur.")}
                </p>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setApprovalRequest(null)} disabled={approvalSubmitting}>{t("cancel") || "Annuler"}</Button>
                <Button onClick={handleApproveWithProvider} disabled={approvalSubmitting} className="bg-green-500 hover:bg-green-600">
                  {approvalSubmitting ? (t("loading") || "Traitement...") : (t("adminApproveConfirm") || "Confirmer & payer")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ProfileHeader primaryRole="admin" showMenuButton onMenuToggle={() => setSidebarOpen(true)} />

      <main className="flex-1 pt-20 pb-8 px-3 sm:px-4">
        <div className="container max-w-[1600px] mx-auto">
          <div className="flex gap-6">
            <AdminSidebar
              active={activeTab}
              onSelect={handleSidebarSelect}
              stats={{
                pendingArtistRequests: stats.pendingArtistRequests,
                pendingManagerRequests: stats.pendingManagerRequests,
                pendingDuelRequests: stats.pendingDuelRequests,
                pendingWithdrawals: stats.pendingWithdrawals,
                activeLives: stats.activeLives,
                pendingSponsors: stats.pendingSponsors,
              }}
              open={sidebarOpen}
              onOpenChange={setSidebarOpen}
            />

            <div className="flex-1 min-w-0">
              <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold mb-1 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  {t("adminDashTitle")}
                </h1>
                <p className="text-sm text-muted-foreground">{t("adminDashSubtitle")}</p>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-2.5 mb-6 relative isolate">
                {[
                  { label: t("adminUsers"), value: stats.totalUsers, icon: Users, color: "" },
                  { label: t("adminConcerts"), value: stats.totalConcerts, icon: Music, color: "" },
                  { label: t("adminDuels"), value: stats.totalDuels, icon: Swords, color: "" },
                  { label: t("adminReplays"), value: stats.totalReplays, icon: Video, color: "" },
                  { label: t("adminActiveLives"), value: stats.activeLives, icon: Radio, color: "text-red-500 border-red-500/50" },
                  { label: t("adminArtists"), value: stats.pendingArtistRequests, icon: UserCheck, color: "text-yellow-500 border-yellow-500/50" },
                  { label: t("adminManagers"), value: stats.pendingManagerRequests, icon: Briefcase, color: "text-blue-500 border-blue-500/50" },
                  { label: t("adminDuelReq"), value: stats.pendingDuelRequests, icon: Swords, color: "text-purple-500 border-purple-500/50" },
                  { label: t("adminWithdrawals"), value: stats.pendingWithdrawals, icon: DollarSign, color: "text-green-500 border-green-500/50" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <Card key={label} className={`bg-card transform-gpu border-border/60 ${color ? color.split(" ").slice(1).join(" ") : ""}`}>
                    <CardHeader className="flex flex-row items-center justify-between pb-1 pt-2.5 px-3">
                      <CardTitle className={`text-[10px] font-medium ${color.split(" ")[0] || "text-muted-foreground"}`}>{label}</CardTitle>
                      <Icon className={`h-3 w-3 ${color.split(" ")[0] || "text-muted-foreground"}`} />
                    </CardHeader>
                    <CardContent className="px-3 pb-2.5">
                      <div className={`text-lg font-bold ${color.split(" ")[0] || ""}`}>{value}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Tabs (controlled by sidebar) */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="sr-only">
                  <TabsTrigger value="stats" className="text-xs"><BarChart3 className="w-3 h-3 mr-1" />{t("adminTabStats")}</TabsTrigger>
              <TabsTrigger value="artist-requests" className="text-xs">
                {t("adminTabArtistReq")} {stats.pendingArtistRequests > 0 && <Badge className="ml-1 h-4 px-1 text-xs">{stats.pendingArtistRequests}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="manager-requests" className="text-xs">
                {t("adminTabManagerReq")} {stats.pendingManagerRequests > 0 && <Badge className="ml-1 h-4 px-1 text-xs">{stats.pendingManagerRequests}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="duel-requests" className="text-xs">
                {t("adminTabDuelReq")} {stats.pendingDuelRequests > 0 && <Badge className="ml-1 h-4 px-1 text-xs">{stats.pendingDuelRequests}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="withdrawals" className="text-xs">
                {t("adminTabWithdrawals")} {stats.pendingWithdrawals > 0 && <Badge className="ml-1 h-4 px-1 text-xs">{stats.pendingWithdrawals}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="users" className="text-xs">{t("adminTabUsers")}</TabsTrigger>
              <TabsTrigger value="duels" className="text-xs">{t("adminTabDuels")}</TabsTrigger>
              <TabsTrigger value="concerts" className="text-xs">{t("adminTabConcerts")}</TabsTrigger>
              <TabsTrigger value="lives" className="text-xs">
                {t("adminTabLives")} {stats.activeLives > 0 && <Badge className="ml-1 h-4 px-1 text-xs bg-red-500">{stats.activeLives}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="replays" className="text-xs"><Video className="w-3 h-3 mr-1" />{t("adminTabReplays")}</TabsTrigger>
              <TabsTrigger value="reports" className="text-xs"><Shield className="w-3 h-3 mr-1" />{t("adminTabReports")}</TabsTrigger>
              <TabsTrigger value="blogs" className="text-xs">{t("adminTabBlog")}</TabsTrigger>
              <TabsTrigger value="logs" className="text-xs"><ClipboardList className="w-3 h-3 mr-1" />{t("adminTabLogs")}</TabsTrigger>
              <TabsTrigger value="subscriptions" className="text-xs"><CreditCard className="w-3 h-3 mr-1" />{t("adminTabSubscriptions")}</TabsTrigger>
              <TabsTrigger value="leaderboard" className="text-xs"><Trophy className="w-3 h-3 mr-1" />{t("adminTabLeaderboard")}</TabsTrigger>
              <TabsTrigger value="referrals" className="text-xs"><Gift className="w-3 h-3 mr-1" />{t("adminTabReferrals")}</TabsTrigger>
              <TabsTrigger value="lifestyle" className="text-xs"><Video className="w-3 h-3 mr-1" />{t("adminTabLifestyle")}</TabsTrigger>
              <TabsTrigger value="platform" className="text-xs"><Settings className="w-3 h-3 mr-1" />{t("adminTabPlatform")}</TabsTrigger>
              <TabsTrigger value="economy" className="text-xs"><DollarSign className="w-3 h-3 mr-1" />{t("adminTabEconomy")}</TabsTrigger>
              <TabsTrigger value="announcements" className="text-xs"><Megaphone className="w-3 h-3 mr-1" />{t("adminTabAnnouncements")}</TabsTrigger>
              <TabsTrigger value="sponsors" className="text-xs"><Megaphone className="w-3 h-3 mr-1" />Sponsors {stats.pendingSponsors > 0 && <Badge className="ml-1 h-4 px-1 text-xs bg-yellow-500 text-black">{stats.pendingSponsors}</Badge>}</TabsTrigger>
              <TabsTrigger value="cinetpay" className="text-xs"><DollarSign className="w-3 h-3 mr-1" />CinetPay</TabsTrigger>
            </TabsList>

            {/* ── Stats ─────────────────────────────────────────────────────── */}
            <TabsContent value="stats"><AdminStats /></TabsContent>

            {/* ── Artist Requests ───────────────────────────────────────────── */}
            <TabsContent value="artist-requests">
              <Card>
                <CardHeader>
                  <CardTitle>{t("adminArtistRequestsTitle")}</CardTitle>
                  <CardDescription>{t("adminArtistRequestsDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <AdminTable
                    data={artistRequests}
                    searchKeys={["user_name", "user_email", "description"]}
                    emptyMessage={t("adminNoArtistRequest")}
                    columns={[
                      { key: "user_name", label: t("adminColUser"), sortable: true },
                      { key: "user_email", label: t("adminColEmail"), sortable: true },
                      { key: "description", label: t("adminColDescription"), render: (r) => <span className="max-w-xs truncate block">{r.description}</span> },
                      { key: "created_at", label: t("adminColDate"), sortable: true, render: (r) => fmt(r.created_at) },
                      { key: "status", label: t("adminColStatus"), sortable: true, render: (r) => statusBadge(r.status) },
                      {
                        key: "actions", label: t("adminColActions"),
                        render: (request) => (
                          <div className="flex gap-2">
                            {/* Detail dialog */}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm"><Eye className="w-4 h-4 mr-1" />{t("adminDetails")}</Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader><DialogTitle>{t("adminArtistRequestDetail")} – {request.user_name}</DialogTitle></DialogHeader>
                                <ScrollArea className="max-h-[70vh]">
                                  <div className="space-y-1 pr-2">
                                    <InfoRow label="Nom">{request.user_name}</InfoRow>
                                    <InfoRow label="Email">{request.user_email}</InfoRow>
                                    <InfoRow label="Description">{request.description}</InfoRow>
                                    <InfoRow label="Réseaux sociaux"><SocialLinksDisplay socialLinks={request.social_links} /></InfoRow>
                                    {request.justification_document_url && (
                                      <InfoRow label="Document justificatif">
                                        <a href={request.justification_document_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                          Voir le document <ExternalLink className="w-3 h-3" />
                                        </a>
                                      </InfoRow>
                                    )}
                                    <InfoRow label="Date">{fmt(request.created_at)}</InfoRow>
                                    <InfoRow label="Statut">{statusBadge(request.status)}</InfoRow>
                                  </div>
                                </ScrollArea>
                              </DialogContent>
                            </Dialog>
                            {request.status === "pending" && (
                              <>
                                <Button size="sm" className="bg-green-500 hover:bg-green-600" onClick={() => handleArtistRequest(request.id, request.user_id, "approved")}><CheckCircle className="w-4 h-4" /></Button>
                                <Button size="sm" variant="destructive" onClick={() => handleArtistRequest(request.id, request.user_id, "rejected")}><XCircle className="w-4 h-4" /></Button>
                              </>
                            )}
                          </div>
                        )
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Manager Requests ──────────────────────────────────────────── */}
            <TabsContent value="manager-requests">
              <Card>
                <CardHeader>
                  <CardTitle>{t("adminManagerRequestsTitle")}</CardTitle>
                  <CardDescription>{t("adminManagerRequestsDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <AdminTable
                    data={managerRequests}
                    searchKeys={["user_name", "user_email", "experience"]}
                    emptyMessage={t("adminNoManagerRequest")}
                    columns={[
                      { key: "user_name", label: t("adminColUser"), sortable: true },
                      { key: "user_email", label: t("adminColEmail"), sortable: true },
                      { key: "experience", label: t("adminColExperience"), render: (r) => <span className="max-w-xs truncate block">{r.experience}</span> },
                      { key: "created_at", label: t("adminColDate"), sortable: true, render: (r) => fmt(r.created_at) },
                      { key: "status", label: t("adminColStatus"), sortable: true, render: (r) => statusBadge(r.status) },
                      {
                        key: "actions", label: t("adminColActions"),
                        render: (request) => (
                          <div className="flex gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm"><Eye className="w-4 h-4 mr-1" />{t("adminDetails")}</Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader><DialogTitle>{t("adminManagerRequestDetail")} – {request.user_name}</DialogTitle></DialogHeader>
                                <ScrollArea className="max-h-[70vh]">
                                  <div className="space-y-1 pr-2">
                                    <InfoRow label={t("adminColName")}>{request.user_name}</InfoRow>
                                    <InfoRow label={t("adminColEmail")}>{request.user_email}</InfoRow>
                                    <InfoRow label={t("adminColBio")}>{request.bio}</InfoRow>
                                    <InfoRow label={t("adminColExperience")}>{request.experience}</InfoRow>
                                    <InfoRow label={t("adminColDate")}>{fmt(request.created_at)}</InfoRow>
                                    <InfoRow label={t("adminColStatus")}>{statusBadge(request.status)}</InfoRow>
                                  </div>
                                </ScrollArea>
                              </DialogContent>
                            </Dialog>
                            {request.status === "pending" && (
                              <>
                                <Button size="sm" className="bg-green-500 hover:bg-green-600" onClick={() => handleManagerRequest(request.id, request.user_id, "approved")}><CheckCircle className="w-4 h-4" /></Button>
                                <Button size="sm" variant="destructive" onClick={() => handleManagerRequest(request.id, request.user_id, "rejected")}><XCircle className="w-4 h-4" /></Button>
                              </>
                            )}
                          </div>
                        )
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Duel Requests ─────────────────────────────────────────────── */}
            <TabsContent value="duel-requests">
              <Card>
                <CardHeader>
                  <CardTitle>{t("adminDuelRequestsTitle")}</CardTitle>
                  <CardDescription>{t("adminDuelRequestsDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <AdminTable
                    data={duelRequests}
                    searchKeys={["requester_name", "opponent_name", "manager_name", "status"]}
                    emptyMessage={t("adminNoDuelRequest")}
                    columns={[
                      { key: "requester_name", label: t("adminColRequester"), sortable: true },
                      { key: "opponent_name", label: t("adminColOpponent"), sortable: true },
                      { key: "proposed_date", label: t("adminColProposedDate"), sortable: true, render: (r) => fmt(r.proposed_date) },
                      { key: "status", label: t("adminColStatus"), sortable: true, render: (r) => statusBadge(r.status) },
                      { key: "manager_name", label: t("adminColManager"), sortable: true, render: (r) => <span className="text-sm">{r.manager_name || "—"}</span> },
                      {
                        key: "actions", label: t("adminColActions"),
                        render: (request) => {
                          const canApprove = request.status === "accepted" || request.status === "admin_pending";
                          const isApproved = request.status === "approved";
                          return (
                            <div className="flex gap-2 items-center flex-wrap">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm"><Eye className="w-4 h-4 mr-1" />{t("adminDetails")}</Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                  <DialogHeader><DialogTitle>{t("adminDuelRequestDetail")}</DialogTitle></DialogHeader>
                                  <ScrollArea className="max-h-[70vh]">
                                    <div className="space-y-1 pr-2">
                                      <InfoRow label={t("adminColRequester")}>{request.requester_name}</InfoRow>
                                      <InfoRow label={t("adminColOpponent")}>{request.opponent_name}</InfoRow>
                                      <InfoRow label={t("adminColProposedDate")}>{fmt(request.proposed_date)}</InfoRow>
                                      <InfoRow label={t("adminAssignedManager")}>{request.manager_name || t("adminNone")}</InfoRow>
                                      <InfoRow label={t("adminColMessage")}>{request.message || "—"}</InfoRow>
                                      <InfoRow label={t("adminColStatus")}>{statusBadge(request.status)}</InfoRow>
                                      <InfoRow label={t("adminColCreatedAt")}>{fmt(request.created_at)}</InfoRow>
                                    </div>
                                  </ScrollArea>
                                </DialogContent>
                              </Dialog>
                              {canApprove && (
                                <DuelRequestRow
                                  key={request.id}
                                  request={request}
                                  managers={managers}
                                  adminUserId={adminRef.current?.id || null}
                                  onApprove={(managerId, scheduledDate, ticketPrice, allowsSponsorAds) => handleDuelRequest(request.id, "approved", managerId, scheduledDate, ticketPrice, allowsSponsorAds)}
                                  onReject={() => handleDuelRequest(request.id, "rejected")}
                                  getStatusBadge={statusBadge}
                                />
                              )}
                            </div>
                          );
                        }
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Withdrawals ───────────────────────────────────────────────── */}
            <TabsContent value="withdrawals">
              <WithdrawalPinGate>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("adminWithdrawalsTitle")}</CardTitle>
                    <CardDescription>{t("adminWithdrawalsDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AdminTable
                      data={withdrawalRequests}
                      searchKeys={["user_name", "user_email", "payment_method"]}
                      emptyMessage={t("adminNoWithdrawal")}
                      columns={[
                        { key: "user_name", label: t("adminColUser"), sortable: true },
                        { key: "user_email", label: t("adminColEmail"), sortable: true },
                        { key: "amount", label: t("adminColAmount"), sortable: true, render: (r) => (
                          <div className="flex flex-col">
                            <span className="font-bold text-green-500">{formatCreditsLabel(Number(r.amount))}</span>
                            <span className="text-[10px] text-muted-foreground">≈ {formatPrice(Number(r.amount))}</span>
                          </div>
                        ) },
                        {
                          key: "payment_details", label: t("adminColPaymentDetails"),
                          render: (r) => (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" title={t("adminPaymentDetailsTitle")}><CreditCard className="w-3 h-3 mr-1" />{t("adminSee")}</Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader><DialogTitle>{t("adminPaymentDetailsTitle")} – {r.user_name}</DialogTitle></DialogHeader>
                                <div className="space-y-3">
                                  <div className="flex flex-col gap-1 mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-muted-foreground text-sm">{t("adminPaymentAmount")} :</span>
                                      <span className="font-bold text-green-500 text-lg">{formatCreditsLabel(Number(r.amount))}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">≈ {formatPrice(Number(r.amount))}</span>
                                  </div>
                                  <PaymentDetailsDisplay details={r.payment_details} method={r.payment_method} />
                                </div>
                              </DialogContent>
                            </Dialog>
                          )
                        },
                        { key: "created_at", label: t("adminColDate"), sortable: true, render: (r) => fmt(r.created_at) },
                        { key: "status", label: t("adminColStatus"), sortable: true, render: (r) => statusBadge(r.status) },
                        {
                          key: "actions", label: t("adminColActions"),
                          render: (request) => request.status === "pending" ? (
                            <div className="flex gap-2">
                              <Button size="sm" className="bg-green-500 hover:bg-green-600" title={t("approve") || "Approuver"} aria-label={t("approve") || "Approuver"} onClick={() => handleWithdrawalRequest(request.id, "completed")}><CheckCircle className="w-4 h-4" /></Button>
                              <Button size="sm" variant="destructive" title={t("reject") || "Rejeter"} aria-label={t("reject") || "Rejeter"} onClick={() => handleWithdrawalRequest(request.id, "rejected")}><XCircle className="w-4 h-4" /></Button>
                            </div>
                          ) : null
                        }
                      ]}
                    />
                  </CardContent>
                </Card>
              </WithdrawalPinGate>
            </TabsContent>

            {/* ── Users ─────────────────────────────────────────────────────── */}
            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <CardTitle>{t("adminUsersTitle")}</CardTitle>
                  <CardDescription>{t("adminUsersDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <AdminTable
                    data={users}
                    searchKeys={["full_name", "email"]}
                    emptyMessage={t("adminNoUser")}
                    columns={[
                      { key: "full_name", label: t("adminColName"), sortable: true, render: (u) => u.full_name || t("adminNotDefined") },
                      { key: "email", label: t("adminColEmail"), sortable: true },
                      {
                        key: "roles", label: t("adminColRoles"),
                        render: (u) => (
                          <div className="flex flex-wrap gap-1">
                            {(userRoles[u.id] || []).map(r => (
                              <Badge key={r} variant="outline" className="text-xs capitalize">{r}</Badge>
                            ))}
                          </div>
                        )
                      },
                      {
                        key: "status", label: t("adminColStatus"),
                        render: (u) => u.is_banned
                          ? <Badge variant="destructive">{t("adminBanned")}</Badge>
                          : <Badge variant="secondary" className="text-green-600 border-green-500">{t("adminActive")}</Badge>
                      },
                      { key: "created_at", label: t("adminColRegistration"), sortable: true, render: (u) => fmt(u.created_at) },
                      {
                        key: "actions", label: t("adminColActions"),
                        render: (user) => (
                          <div className="flex flex-wrap gap-1">
                            {/* Profil button — only for artists */}
                            {(userRoles[user.id] || []).includes("artist") ? (
                              <Button variant="outline" size="sm" onClick={() => navigate(`/artist/${user.id}`)}>
                                <Eye className="w-3 h-3 mr-1" />{t("adminProfile")}
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" disabled title={t("adminNoPublicProfile")}>
                                <Eye className="w-3 h-3 mr-1" />{t("adminProfile")}
                              </Button>
                            )}
                            {/* Role management */}
                            {!(userRoles[user.id] || []).includes("moderator") && !(userRoles[user.id] || []).includes("admin") && (
                              <Button variant="outline" size="sm" onClick={() => handleAssignRole(user.id, "moderator", user.full_name)} className="text-xs">
                                <Shield className="w-3 h-3 mr-1" />{t("adminModerator")}
                              </Button>
                            )}
                            {!(userRoles[user.id] || []).includes("admin") && (
                              <Button variant="outline" size="sm" onClick={() => handleAssignRole(user.id, "admin", user.full_name)} className="text-xs border-yellow-500/50 text-yellow-600">
                                <Shield className="w-3 h-3 mr-1" />Admin
                              </Button>
                            )}
                            {(userRoles[user.id] || []).some(r => r === "moderator" || r === "admin") && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="text-xs text-destructive border-destructive/50">
                                    <XCircle className="w-3 h-3 mr-1" />{t("adminRoles")}
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader><DialogTitle>{t("adminManageRoles")} – {user.full_name}</DialogTitle></DialogHeader>
                                  <div className="space-y-2">
                                    {(userRoles[user.id] || []).filter(r => r !== "fan").map(role => (
                                      <div key={role} className="flex items-center justify-between p-2 border rounded-md">
                                        <Badge className="capitalize">{role}</Badge>
                                        {role !== "fan" && (
                                          <Button size="sm" variant="destructive" onClick={() => handleRemoveRole(user.id, role, user.full_name)}>
                                            <XCircle className="w-3 h-3 mr-1" />{t("adminRemove")}
                                          </Button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                            {!user.is_banned ? (
                              <Button variant="destructive" size="sm" onClick={() => handleBanUser(user.id, user.full_name)}>
                                <Ban className="w-3 h-3" />
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" onClick={async () => {
                                await moderationApi.unbanPlatform(user.id);
                                toast({ title: t("adminUserUnbanned") });
                                loadDashboardData();
                              }}>
                                {t("adminUnban")}
                              </Button>
                            )}
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(user.id, user.full_name)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Duels ─────────────────────────────────────────────────────── */}
            <TabsContent value="duels">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>{t("adminDuelsTitle")}</CardTitle>
                    <CardDescription>{t("adminDuelsDesc")}</CardDescription>
                  </div>
                  <Button onClick={() => navigate("/duel-management")}>{t("adminNewDuel")}</Button>
                </CardHeader>
                <CardContent>
                  <AdminTable
                    data={duels}
                    searchKeys={["artist1_name", "artist2_name", "manager_name", "status"]}
                    emptyMessage={t("adminNoDuel")}
                    columns={[
                      { key: "artist1_name", label: t("adminColArtist1"), sortable: true },
                      { key: "artist2_name", label: t("adminColArtist2"), sortable: true },
                      { key: "manager_name", label: t("adminColManager"), sortable: true, render: (d) => <span className="text-sm">{d.manager_name}</span> },
                      { key: "scheduled_time", label: t("adminColDate"), sortable: true, render: (d) => fmt(d.scheduled_time) },
                      { key: "status", label: t("adminColStatus"), sortable: true, render: (d) => statusBadge(d.status) },
                      { key: "winner_name", label: t("adminColWinner"), render: (d) => d.winner_name || t("adminInProgress") },
                      {
                        key: "actions", label: t("adminColActions"),
                        render: (duel) => (
                          <div className="flex gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm"><Eye className="w-4 h-4 mr-1" />{t("adminDetails")}</Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-lg">
                                <DialogHeader><DialogTitle>{t("adminDuelDetails")}</DialogTitle></DialogHeader>
                                <div className="space-y-1">
                                  <InfoRow label={t("adminColArtist1")}>{duel.artist1_name}</InfoRow>
                                  <InfoRow label={t("adminColArtist2")}>{duel.artist2_name}</InfoRow>
                                  <InfoRow label={t("adminColManager")}>{duel.manager_name}</InfoRow>
                                  <InfoRow label={t("adminColDate")}>{fmt(duel.scheduled_time)}</InfoRow>
                                  <InfoRow label={t("adminColStatus")}>{statusBadge(duel.status)}</InfoRow>
                                  <InfoRow label={t("adminColWinner")}>{duel.winner_name || t("adminInProgress")}</InfoRow>
                                  <InfoRow label={t("adminStarted")}>{fmt(duel.started_at)}</InfoRow>
                                  <InfoRow label={t("adminFinished")}>{fmt(duel.ended_at)}</InfoRow>
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Button variant="outline" size="sm" onClick={() => navigate(`/duel/${duel.id}`)}><Eye className="w-4 h-4" /></Button>
                            {duel.status === "live" && (
                              <Button size="sm" variant="destructive" onClick={() => handleStopDuel(duel.id)}>
                                <StopCircle className="w-4 h-4" />
                              </Button>
                            )}
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteDuel(duel.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Concerts ──────────────────────────────────────────────────── */}
            <TabsContent value="concerts">
              <Card>
                <CardHeader>
                  <CardTitle>{t("adminConcertsTitle")}</CardTitle>
                  <CardDescription>{t("adminConcertsDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <AdminTable
                    data={concerts}
                    searchKeys={["title", "artist_name", "status"]}
                    emptyMessage={t("adminNoConcert")}
                    columns={[
                      { key: "title", label: t("adminColTitle"), sortable: true },
                      { key: "artist_name", label: t("adminColArtist"), sortable: true },
                      { key: "scheduled_date", label: t("adminColDate"), sortable: true, render: (c) => fmt(c.scheduled_date) },
                      { key: "ticket_price", label: t("adminColPrice"), sortable: true, render: (c) => `${c.ticket_price} $` },
                      { key: "tickets_sold", label: t("adminColTicketsSold"), render: (c) => c.tickets_sold ?? 0 },
                      { key: "status", label: t("adminColStatus"), sortable: true, render: (c) => statusBadge(c.status) },
                      {
                        key: "actions", label: t("adminColActions"),
                        render: (concert) => (
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => navigate(`/concert/${concert.id}`)}><Eye className="w-4 h-4" /></Button>
                            {concert.status === "live" && (
                              <Button size="sm" variant="destructive" onClick={() => handleStopConcert(concert.id)}>
                                <StopCircle className="w-4 h-4 mr-1" />{t("adminStop")}
                              </Button>
                            )}
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteConcert(concert.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Competitions ─────────────────────────────────────────── */}
            <TabsContent value="competitions">
              <AdminCompetitionsManager />
            </TabsContent>

            {/* ── Lives ─────────────────────────────────────────────────────── */}
            <TabsContent value="lives">
              <Card>
                <CardHeader>
                  <CardTitle>{t("adminLivesTitle")}</CardTitle>
                  <CardDescription>{t("adminLivesDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <AdminTable
                    data={lives}
                    searchKeys={["artist_name", "title", "status"]}
                    emptyMessage={t("adminNoLive")}
                    columns={[
                      { key: "artist_name", label: t("adminColArtist"), sortable: true },
                      { key: "title", label: t("adminColTitle"), render: (l) => l.title || t("adminLiveWithoutTitle") },
                      { key: "status", label: t("adminColStatus"), sortable: true, render: (l) => statusBadge(l.status) },
                      { key: "viewer_count", label: t("adminColViewers"), sortable: true, render: (l) => l.viewer_count ?? 0 },
                      { key: "started_at", label: t("adminColStarted"), sortable: true, render: (l) => fmt(l.started_at) },
                      { key: "ended_at", label: t("adminColEnded"), render: (l) => fmt(l.ended_at) },
                      {
                        key: "actions", label: t("adminColActions"),
                        render: (live) => (
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => navigate(`/lives/${live.id}`)}><Eye className="w-4 h-4" /></Button>
                            {live.status === "live" && (
                              <Button size="sm" variant="destructive" onClick={() => handleStopLive(live.id)}>
                                <StopCircle className="w-4 h-4 mr-1" />{t("adminStop")}
                              </Button>
                            )}
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteLive(live.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Replays ──────────────────────────────────────────────── */}
            <TabsContent value="replays">
              <Card>
                <CardHeader>
                  <CardTitle>{t("adminReplaysTitle")}</CardTitle>
                  <CardDescription>{t("adminReplaysDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <AdminTable
                    data={replays}
                    searchKeys={["title", "source_type"]}
                    emptyMessage={t("adminNoReplay")}
                    columns={[
                      { key: "title", label: t("adminColTitle"), sortable: true },
                      { key: "source_type", label: t("adminColType"), sortable: true, render: (r: any) => <Badge variant="outline" className="capitalize">{r.source_type || "duel"}</Badge> },
                      { key: "recorded_date", label: t("adminColDate"), sortable: true, render: (r: any) => fmt(r.recorded_date) },
                      { key: "is_public", label: t("adminColPublic"), sortable: true, render: (r: any) => r.is_public ? <Badge className="bg-green-500 text-white">{t("adminYes")}</Badge> : <Badge variant="outline">{t("adminNo")}</Badge> },
                      { key: "replay_price", label: t("adminColPrice"), render: (r: any) => r.replay_price > 0 ? `${r.replay_price} $` : t("adminFreeAccess") },
                      { key: "views_count", label: t("adminColViews"), sortable: true, render: (r: any) => r.views_count || 0 },
                      {
                        key: "actions", label: t("adminColActions"),
                        render: (replay: any) => (
                          <div className="flex gap-2 flex-wrap">
                            <Button variant="outline" size="sm" onClick={async () => {
                              await replaysApi.updateReplay(replay.id, { is_public: !replay.is_public });
                              toast({ title: replay.is_public ? t("adminReplayHidden") : t("adminReplayPublished") });
                              loadDashboardData();
                            }}>
                              {replay.is_public ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                              {replay.is_public ? t("adminHide") : t("adminPublish")}
                            </Button>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm"><DollarSign className="w-3 h-3 mr-1" />{t("adminSetPrice")}</Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader><DialogTitle>{t("adminSetReplayPrice")}</DialogTitle></DialogHeader>
                                <div className="space-y-3 pt-2">
                                  <Input type="number" min={0} step={0.5} defaultValue={replay.replay_price || 0} id={`price-${replay.id}`} placeholder={t("adminPriceInEuro")} />
                                  <Button className="w-full" onClick={async () => {
                                    const input = document.getElementById(`price-${replay.id}`) as HTMLInputElement;
                                    const price = Number(input?.value || 0);
                                    await replaysApi.updateReplay(replay.id, { replay_price: price });
                                    toast({ title: t("adminPriceUpdated") });
                                    loadDashboardData();
                                  }}>{t("adminSavePrice")}</Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Button variant="outline" size="sm" onClick={() => navigate(`/replay/${replay.id}`)}><Eye className="w-3 h-3" /></Button>
                            <Button variant="destructive" size="sm" onClick={async () => {
                              await replaysApi.deleteReplay(replay.id);
                              toast({ title: t("adminReplayDeleted") });
                              loadDashboardData();
                            }}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        )
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Signalements ────────────────────────────────────────────── */}
            <TabsContent value="reports">
              <ModerationDashboard />
            </TabsContent>

            {/* ── Blog ──────────────────────────────────────────────────────── */}
            <TabsContent value="blogs">
              <BlogManager />
            </TabsContent>

            {/* ── Journal Admin ─────────────────────────────────────────────── */}
            <TabsContent value="logs">
              <Card>
                <CardContent className="pt-6">
                  <AdminLogs />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Abonnements ──────────────────────────────────────────────── */}
            <TabsContent value="subscriptions">
              <Card>
                <CardContent className="pt-6">
                  <SubscriptionPlansManager />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Classements ──────────────────────────────────────────────── */}
            <TabsContent value="leaderboard">
              <Card>
                <CardContent className="pt-6">
                  <LeaderboardSeasonsManager />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Parrainage ───────────────────────────────────────────────── */}
            <TabsContent value="referrals">
              <Card>
                <CardContent className="pt-6">
                  <ReferralConfigManager />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Lifestyle ────────────────────────────────────────────── */}
            <TabsContent value="lifestyle">
              <LifestyleManager />
            </TabsContent>

            {/* ── Configuration Plateforme ─────────────────────────────── */}
            <TabsContent value="platform">
              <Card>
                <CardContent className="pt-6">
                  <PlatformConfigManager />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Économie ─────────────────────────────── */}
            <TabsContent value="economy">
              <Tabs defaultValue="config">
                <TabsList className="flex-wrap h-auto">
                  <TabsTrigger value="config">{t("ecoTabConfig")}</TabsTrigger>
                  <TabsTrigger value="gifts-votes">Cadeaux & Votes</TabsTrigger>
                  <TabsTrigger value="analytics">{t("ecoTabAnalytics")}</TabsTrigger>
                  <TabsTrigger value="ledger">{t("ecoTabLedger")}</TabsTrigger>
                </TabsList>
                <TabsContent value="config" className="mt-6"><EconomicConfigManager /></TabsContent>
                <TabsContent value="gifts-votes" className="mt-6"><GiftsVotesSettingsView /></TabsContent>
                <TabsContent value="analytics" className="mt-6"><RevenueAnalytics /></TabsContent>
                <TabsContent value="ledger" className="mt-6"><TransactionsLedger /></TabsContent>
              </Tabs>
            </TabsContent>

            {/* ── Announcements ─────────────────────────────────────────────── */}
            <TabsContent value="announcements">
              <AdminAnnouncementsManager />
            </TabsContent>

            {/* ── Sponsors ──────────────────────────────────────────────────── */}
            <TabsContent value="sponsors">
              <AdminSponsorManager />
            </TabsContent>

            <TabsContent value="transactions"><TransactionsPanel /></TabsContent>
            <TabsContent value="preferences"><PreferencesPanel /></TabsContent>
            <TabsContent value="contact"><ContactInfoManager /></TabsContent>
            <TabsContent value="communities"><SocialLinksManager /></TabsContent>
            <TabsContent value="push"><PushConfigManager /></TabsContent>
            <TabsContent value="documents"><AdminDocumentsManager /></TabsContent>
            <TabsContent value="gifts"><AdminGiftsManager /></TabsContent>
            <TabsContent value="concert-validation"><AdminConcertValidation /></TabsContent>
            <TabsContent value="dedications"><AdminDedicationsManager /></TabsContent>
            <TabsContent value="cinetpay"><CinetPayAdminPanel /></TabsContent>
            <TabsContent value="role-assignment"><RoleAssignmentManager /></TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </main>
      <ProfileFooter />
    </div>
  );
};

export default Admin;
