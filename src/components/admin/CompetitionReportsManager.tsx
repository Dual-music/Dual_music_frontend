/**
 * CompetitionReportsManager
 * -------------------------
 * File d'attente admin des signalements de compétitions (`competition_reports`) — jusqu'ici sans
 * aucune interface admin : les signalements existaient en base mais l'admin ne les voyait jamais
 * (contrairement aux lives/concerts/duels, déjà couverts par `LiveReportsManager`).
 */
import { useEffect, useState } from "react";
import { listReports, reviewReport } from "@/api/endpoints/moderation";
import { getDisplayProfiles } from "@/api/endpoints/users";
import { ApiError } from "@/api/http";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatTz } from "@/lib/datetime";
import { AlertTriangle, CheckCircle2, XCircle, Trophy } from "lucide-react";

interface CompetitionReportRow {
  id: string;
  competition_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporter_name?: string;
}

export const CompetitionReportsManager = () => {
  const { toast } = useToast();
  const { language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const [rows, setRows] = useState<CompetitionReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "reviewed" | "dismissed" | "all">("pending");

  useEffect(() => { void load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    let reports: any[];
    try {
      reports = (await listReports("competition", {
        status: filter !== "all" ? filter : undefined,
        limit: 200,
      })) as any[];
    } catch {
      setRows([]); setLoading(false); return;
    }
    if (!reports || reports.length === 0) { setRows([]); setLoading(false); return; }

    const userIds = [...new Set(reports.map((r: any) => r.reporter_id))];
    const profiles = await getDisplayProfiles(userIds).catch(() => []);
    const profMap = new Map(profiles.map((p) => [p.id, p.full_name]));

    setRows(reports.map((r: any) => ({
      ...r,
      reporter_name: (profMap.get(r.reporter_id) as string) || (language === "fr" ? "Inconnu" : "Unknown"),
    })));
    setLoading(false);
  };

  const close = async (id: string, status: "reviewed" | "dismissed") => {
    try {
      await reviewReport("competition", id, { status });
      toast({ title: language === "fr" ? "Signalement clôturé" : "Report closed" });
      void load();
    } catch (e) {
      toast({
        title: e instanceof ApiError ? e.message : language === "fr" ? "Erreur" : "Error",
        variant: "destructive",
      });
    }
  };

  const fmt = (dt: string) => formatTz(dt, "dd MMM yyyy HH:mm", { timezone: tz, language });

  const tr = language === "en"
    ? { title: "Competition reports", subtitle: "Reports submitted on competitions by viewers.",
        empty: "No report in this state.", pending: "Pending", reviewed: "Reviewed", dismissed: "Dismissed", all: "All",
        markReviewed: "Mark reviewed", markDismissed: "Dismiss", view: "View" }
    : { title: "Signalements de compétitions", subtitle: "Signalements envoyés sur les compétitions par les spectateurs.",
        empty: "Aucun signalement dans cet état.", pending: "À traiter", reviewed: "Traité", dismissed: "Ignoré", all: "Tous",
        markReviewed: "Marquer traité", markDismissed: "Ignorer", view: "Voir" };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Trophy className="w-5 h-5" />{tr.title}</CardTitle>
        <CardDescription>{tr.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-3">
          {(["pending","reviewed","dismissed","all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {tr[f]}
            </Button>
          ))}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>{tr.empty}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="border border-border rounded-lg p-3 bg-card/50">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{r.reason}</Badge>
                        <a
                          href={`/competition/${r.competition_id}/live`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-sm truncate text-primary hover:underline"
                        >
                          {tr.view} · {r.competition_id.slice(0, 8)}
                        </a>
                      </div>
                      {r.details && <p className="text-xs text-muted-foreground mt-1">{r.details}</p>}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {r.reporter_name} · {fmt(r.created_at)}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col gap-1 items-end">
                      <Badge variant={r.status === "pending" ? "outline" : "secondary"} className="text-[10px]">
                        {tr[r.status as keyof typeof tr] || r.status}
                      </Badge>
                      {r.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => close(r.id, "reviewed")}>
                            <CheckCircle2 className="w-3 h-3 mr-1" />{tr.markReviewed}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => close(r.id, "dismissed")}>
                            <XCircle className="w-3 h-3 mr-1" />{tr.markDismissed}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default CompetitionReportsManager;
