/**
 * AccountReportsManager
 * ---------------------
 * File d'attente admin des signalements de profils (`account_reports`).
 *
 * Workflow : open → reviewed | dismissed. Permet de consulter le profil
 * signalé, le motif, le signaleur, puis d'agir (bannir le compte plateforme,
 * désactiver le profil artiste, ou rejeter).
 *
 * Toute action met à jour `admin_logs` pour l'audit.
 */
import { useEffect, useState } from "react";
import { createWarning, listWarnings, createPlatformBan, unbanPlatform, listReports, reviewReport } from "@/api/endpoints/moderation";
import { profilesBatch, getSetting, upsertSetting } from "@/api/endpoints/admin";
import { ApiError } from "@/api/http";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import { AlertTriangle, Ban, Send, Shield, User, ChevronDown, ChevronUp } from "lucide-react";

interface ReportedUser {
  user_id: string; full_name: string | null; avatar_url: string | null; email: string; is_banned: boolean | null;
  report_count: number; warning_count: number;
  reports: { id: string; reason: string; details: string | null; reporter_name: string; created_at: string; status: string; }[];
  warnings: { id: string; warning_message: string; is_automatic: boolean; created_at: string; }[];
}

export const AccountReportsManager = () => {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const [reportedUsers, setReportedUsers] = useState<ReportedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoWarningThreshold, setAutoWarningThreshold] = useState(100);

  useEffect(() => { loadData(); loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const { value } = await getSetting("account_report_auto_warning_threshold");
      if (value != null) setAutoWarningThreshold(typeof value === "number" ? value : Number(value));
    } catch { /* keep default */ }
  };

  const loadData = async () => {
    setLoading(true);
    let reports: any[];
    try {
      reports = (await listReports("account")) as any[];
    } catch {
      reports = [];
    }
    if (!reports || reports.length === 0) { setReportedUsers([]); setLoading(false); return; }
    let warnings: any[] = [];
    try {
      warnings = (await listWarnings()) as any[];
    } catch {
      warnings = [];
    }
    const userReportMap = new Map<string, typeof reports>();
    reports.forEach(r => { const arr = userReportMap.get(r.reported_user_id) || []; arr.push(r); userReportMap.set(r.reported_user_id, arr); });
    const userWarningMap = new Map<string, NonNullable<typeof warnings>>();
    (warnings || []).forEach(w => { const arr = userWarningMap.get(w.user_id) || []; arr.push(w); userWarningMap.set(w.user_id, arr); });
    const userIds = [...userReportMap.keys()];
    const reporterIds = [...new Set(reports.map(r => r.reporter_id))];
    const allIds = [...new Set([...userIds, ...reporterIds])];
    const profiles = await profilesBatch(allIds);
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
    const result: ReportedUser[] = userIds.map(uid => {
      const profile = profileMap.get(uid);
      const userReports = userReportMap.get(uid) || [];
      const userWarnings = userWarningMap.get(uid) || [];
      return {
        user_id: uid, full_name: profile?.full_name || (language === "fr" ? "Inconnu" : "Unknown"), avatar_url: profile?.avatar_url || null,
        email: profile?.email || "", is_banned: profile?.is_banned || false, report_count: userReports.length, warning_count: userWarnings.length,
        reports: userReports.map(r => ({ id: r.id, reason: r.reason, details: r.details, reporter_name: profileMap.get(r.reporter_id)?.full_name || (language === "fr" ? "Anonyme" : "Anonymous"), created_at: r.created_at, status: r.status })),
        warnings: userWarnings.map(w => ({ id: w.id, warning_message: w.warning_message, is_automatic: w.is_automatic, created_at: w.created_at })),
      };
    }).sort((a, b) => b.report_count - a.report_count);
    setReportedUsers(result); setLoading(false);
  };

  const sendWarning = async (userId: string) => {
    if (!warningMessage.trim()) { toast({ title: t("adminReportsMessageRequired"), variant: "destructive" }); return; }
    try {
      await createWarning({ userId, message: warningMessage.trim() });
      setWarningMessage(""); toast({ title: t("adminReportsWarningSent") }); loadData();
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : t("adminReportsMessageRequired"), variant: "destructive" });
    }
  };

  const banUser = async (userId: string, userName: string | null) => {
    const target = reportedUsers.find(u => u.user_id === userId);
    await createPlatformBan({ userId, reason: `${target?.report_count || 0} reports`, permanent: true });
    // Mark the banned user's still-pending reports as reviewed (one call per report).
    const pending = (target?.reports || []).filter(r => r.status === "pending");
    await Promise.all(pending.map(r => reviewReport("account", r.id, { status: "reviewed" }).catch(() => { /* best-effort */ })));
    toast({ title: `${userName || ""} ${t("adminReportsUserBanned")}` }); loadData();
  };

  const unbanUser = async (userId: string) => {
    await unbanPlatform(userId);
    toast({ title: t("adminReportsUserUnbanned") }); loadData();
  };

  const updateThreshold = async (value: number) => {
    setAutoWarningThreshold(value);
    await upsertSetting("account_report_auto_warning_threshold", value);
    toast({ title: t("adminReportsThresholdUpdated") });
  };

  const filtered = reportedUsers.filter(u => !searchQuery || u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase()));
  const fmt = (dt: string) => formatTz(dt, "dd MMM yyyy HH:mm", { timezone: tz, language });

  const severityBadge = (count: number) => {
    if (count >= 50) return <Badge variant="destructive">{t("adminReportsCritical")} ({count})</Badge>;
    if (count >= 20) return <Badge className="bg-orange-500 text-white">{t("adminReportsHigh")} ({count})</Badge>;
    if (count >= 5) return <Badge className="bg-yellow-500 text-black">{t("adminReportsMedium")} ({count})</Badge>;
    return <Badge variant="outline">{t("adminReportsLow")} ({count})</Badge>;
  };

  if (loading) return <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" />{t("adminReportsTitle")}</CardTitle>
        <CardDescription>{t("adminReportsDesc")} {autoWarningThreshold}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Input placeholder={t("adminReportsSearch")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="max-w-xs" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("adminReportsAutoThreshold")}</span>
            <Input type="number" value={autoWarningThreshold} onChange={(e) => updateThreshold(Number(e.target.value))} className="w-20" min={1} />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><Shield className="w-12 h-12 mx-auto mb-2 opacity-30" /><p>{t("adminReportsNoReport")}</p></div>
        ) : (
          <div className="space-y-2">
            {filtered.map((user) => (
              <div key={user.user_id} className="border border-border rounded-lg overflow-hidden">
                <button onClick={() => setExpandedUser(expandedUser === user.user_id ? null : user.user_id)} className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left">
                  <Avatar className="w-10 h-10"><AvatarImage src={user.avatar_url || ""} /><AvatarFallback><User className="w-4 h-4" /></AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{user.full_name}</span>
                      {user.is_banned && <Badge variant="destructive" className="text-[10px]">{t("adminReportsBanned")}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {severityBadge(user.report_count)}
                    {user.warning_count > 0 && <Badge variant="outline" className="text-[10px]"><AlertTriangle className="w-3 h-3 mr-1" /> {user.warning_count}</Badge>}
                    {expandedUser === user.user_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {expandedUser === user.user_id && (
                  <div className="border-t border-border p-4 space-y-4 bg-muted/20">
                    <div className="flex flex-wrap gap-2">
                      {!user.is_banned ? (
                        <Button size="sm" variant="destructive" onClick={() => banUser(user.user_id, user.full_name)}><Ban className="w-3 h-3 mr-1" /> {t("adminReportsBan")}</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => unbanUser(user.user_id)}>{t("adminReportsUnban")}</Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">{t("adminReportsSendWarning")}</p>
                      <div className="flex gap-2">
                        <Textarea value={warningMessage} onChange={(e) => setWarningMessage(e.target.value)} placeholder={t("adminReportsWarningPlaceholder")} className="flex-1 min-h-[60px]" />
                        <Button size="sm" onClick={() => sendWarning(user.user_id)}><Send className="w-3 h-3 mr-1" /> {t("adminReportsSend")}</Button>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">{t("adminReportsReportsList")} ({user.reports.length})</p>
                      <ScrollArea className="max-h-[200px]">
                        <div className="space-y-2">
                          {user.reports.map(r => (
                            <div key={r.id} className="bg-background rounded-md p-2 text-xs border border-border">
                              <div className="flex justify-between"><span className="font-medium">{r.reason}</span><span className="text-muted-foreground">{fmt(r.created_at)}</span></div>
                              {r.details && <p className="text-muted-foreground mt-1">{r.details}</p>}
                              <p className="text-muted-foreground mt-1">{t("adminReportsBy")} {r.reporter_name}</p>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                    {user.warnings.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">{t("adminReportsWarningsList")} ({user.warnings.length})</p>
                        <ScrollArea className="max-h-[150px]">
                          <div className="space-y-2">
                            {user.warnings.map(w => (
                              <div key={w.id} className="bg-background rounded-md p-2 text-xs border border-border">
                                <div className="flex justify-between">
                                  <Badge variant={w.is_automatic ? "secondary" : "outline"} className="text-[10px]">{w.is_automatic ? t("adminReportsAutomatic") : t("adminReportsManual")}</Badge>
                                  <span className="text-muted-foreground">{fmt(w.created_at)}</span>
                                </div>
                                <p className="mt-1">{w.warning_message}</p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
