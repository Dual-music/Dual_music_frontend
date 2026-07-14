/**
 * Vue revenus artiste/manager : agrège `revenue_distributions` + `gift_conversions`, somme par source (votes/duels/concerts/cadeaux), affiche solde dispo et historique.
 */
import { useEffect, useState } from "react";
import * as wallet from "@/api/endpoints/wallet";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Calendar, Loader2, Download, FileText } from "lucide-react";
import { useCurrencyFormatter } from "@/hooks/useCurrency";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import { sinceForPeriod } from "@/lib/period";
import { EventTransactionsDrillDown } from "./EventTransactionsDrillDown";

interface RevenueEvent {
  source_id: string;
  event_label: string;
  source_type: string;
  total_received: number;
  tx_count: number;
  last_at: string;
}

interface BreakdownRow {
  source_type: string;
  total_received: number;
  tx_count: number;
  last_at: string;
}

const SOURCE_KEY: Record<string, string> = {
  duel_ticket: "revSrcDuelTicket",
  duel_replay: "revSrcDuelReplay",
  concert_ticket: "revSrcConcertTicket",
  concert_replay: "revSrcConcertReplay",
  gift_concert: "revSrcGiftConcert",
  gift_duel: "revSrcGiftDuel",
  gift_live: "revSrcGiftLive",
  vote: "revSrcVote",
};

const sourceColor = (s: string) => {
  if (s.startsWith("gift")) return "bg-pink-500/15 text-pink-600 border-pink-500/30";
  if (s === "vote") return "bg-purple-500/15 text-purple-600 border-purple-500/30";
  if (s.includes("ticket")) return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
  if (s.includes("replay")) return "bg-blue-500/15 text-blue-600 border-blue-500/30";
  return "bg-muted text-foreground";
};

export const MyRevenuesView = () => {
  const { formatPrice } = useCurrencyFormatter();
  const { toast } = useToast();
  const { language, t } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const [period, setPeriod] = useState("all");
  const [events, setEvents] = useState<RevenueEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [breakdowns, setBreakdowns] = useState<Record<string, BreakdownRow[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  const srcLabel = (s: string) => (SOURCE_KEY[s] ? t(SOURCE_KEY[s]) : s);
  const credUnit = (n: number) => (n > 1 ? t("revCreditPlural") : t("revCreditSingular"));

  const load = async () => {
    setLoading(true);
    try {
      const data = await wallet.getRevenues(sinceForPeriod(period));
      setEvents((data as any) ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [period]);

  const handleOpen = async (sourceId: string) => {
    if (breakdowns[sourceId]) return;
    setLoadingDetail(sourceId);
    try {
      const data = await wallet.getRevenueBreakdown(sourceId);
      setBreakdowns((prev) => ({ ...prev, [sourceId]: (data as any) ?? [] }));
    } finally {
      setLoadingDetail(null);
    }
  };

  const totalAll = events.reduce((s, e) => s + Number(e.total_received), 0);

  const periodLabel = period === "day" ? t("revPeriodToday") : period === "week" ? t("revPeriod7d") : period === "month" ? t("revPeriod30d") : t("revPeriodAll");

  const handleExportCSV = () => {
    if (events.length === 0) {
      toast({ title: t("revNothingToExport"), variant: "destructive" });
      return;
    }
    const header = [t("revColEvent"), t("revColSource"), t("revColCredits"), t("revColEquivalent"), t("revColPayouts"), t("revColLastDate")];
    const rows = events.map((e) => [
      `"${(e.event_label ?? "").replace(/"/g, '""')}"`,
      srcLabel(e.source_type),
      Number(e.total_received).toString(),
      formatPrice(Number(e.total_received)),
      e.tx_count.toString(),
      new Date(e.last_at).toISOString(),
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revenues-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: t("revExportCSVReady") });
  };

  const handleExportPDF = () => {
    if (events.length === 0) {
      toast({ title: t("revNothingToExport"), variant: "destructive" });
      return;
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${t("revTitle")}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}h1{font-size:20px;margin-bottom:4px}h2{font-size:13px;font-weight:400;color:#64748b;margin-top:0}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border:1px solid #e2e8f0;padding:8px;text-align:left}th{background:#f1f5f9}.total{margin-top:16px;font-weight:600}</style>
</head><body>
<h1>${t("revTitle")}</h1>
<h2>${t("revPdfPeriod")} : ${periodLabel} • ${t("revPdfGenerated")} ${formatTz(new Date(), "dd MMM yyyy HH:mm", { timezone: tz, language })}</h2>
<p class="total">${t("revPdfTotal")} : ${totalAll.toLocaleString()} ${credUnit(totalAll)} (${formatPrice(totalAll)})</p>
<table><thead><tr><th>${t("revColEvent")}</th><th>${t("revColSource")}</th><th>${t("revColPayouts")}</th><th>${t("revColCredits")}</th><th>${t("revColEquivalent")}</th><th>${t("revColLastDate")}</th></tr></thead><tbody>
${events.map((e) => `<tr><td>${(e.event_label ?? "").replace(/</g, "&lt;")}</td><td>${srcLabel(e.source_type)}</td><td>${e.tx_count}</td><td>${Number(e.total_received).toLocaleString()}</td><td>${formatPrice(Number(e.total_received))}</td><td>${formatTz(e.last_at, "dd MMM yyyy", { timezone: tz, language })}</td></tr>`).join("")}
</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),300);</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) {
      toast({ title: t("revPopupBlocked"), description: t("revPopupBlockedDesc"), variant: "destructive" });
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                {t("revTitle")}
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {t("revDesc")}
              </CardDescription>
            </div>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">{t("revPeriodToday")}</SelectItem>
                <SelectItem value="week">{t("revPeriod7d")}</SelectItem>
                <SelectItem value="month">{t("revPeriod30d")}</SelectItem>
                <SelectItem value="all">{t("revPeriodAll")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 p-4 mb-3 text-center">
            <p className="text-xs text-muted-foreground">{t("revTotalReceived")}</p>
            <p className="text-2xl sm:text-3xl font-bold">
              {totalAll.toLocaleString()} {credUnit(totalAll)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">≈ {formatPrice(totalAll)}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="flex-1 h-9">
              <Download className="w-4 h-4 mr-1" /> {t("revExportCSV")}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} className="flex-1 h-9">
              <FileText className="w-4 h-4 mr-1" /> {t("revExportPDF")}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("revLoading")}
            </div>
          ) : events.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">{t("revNoData")}</p>
          ) : (
            <Accordion type="single" collapsible className="space-y-2">
              {events.map((e) => (
                <AccordionItem key={`${e.source_id}-${e.source_type}`} value={`${e.source_id}-${e.source_type}`} className="border rounded-lg px-3 sm:px-4">
                  <AccordionTrigger
                    onClick={() => handleOpen(e.source_id)}
                    className="hover:no-underline py-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full text-left pr-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm sm:text-base truncate">{e.event_label}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] ${sourceColor(e.source_type)}`}>
                            {srcLabel(e.source_type)}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatTz(e.last_at, "dd MMM yyyy", { timezone: tz, language })}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-sm sm:text-base">{Number(e.total_received).toLocaleString()} {credUnit(Number(e.total_received))}</p>
                        <p className="text-[10px] text-muted-foreground">{e.tx_count} {e.tx_count > 1 ? t("revPayoutPlural") : t("revPayoutSingular")} • ≈ {formatPrice(Number(e.total_received))}</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {loadingDetail === e.source_id ? (
                      <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" /> {t("revLoadingDetail")}
                      </div>
                    ) : (
                      <div className="space-y-3 pb-2">
                        <div className="space-y-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{t("revSummaryBySrc")}</p>
                          {(breakdowns[e.source_id] ?? []).map((b) => (
                            <div key={b.source_type} className="flex items-center justify-between gap-2 p-2 rounded bg-muted/40">
                              <Badge variant="outline" className={`text-[10px] ${sourceColor(b.source_type)}`}>
                                {srcLabel(b.source_type)}
                              </Badge>
                              <div className="text-right">
                                <p className="text-sm font-semibold">
                                  {Number(b.total_received).toLocaleString()} {credUnit(Number(b.total_received))}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {b.tx_count} tx • ≈ {formatPrice(Number(b.total_received))}
                                </p>
                              </div>
                            </div>
                          ))}
                          {(breakdowns[e.source_id] ?? []).length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-1">{t("revNoDetail")}</p>
                          )}
                        </div>
                        <div className="border-t pt-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">{t("revTransactions")}</p>
                          <EventTransactionsDrillDown sourceId={e.source_id} eventLabel={e.event_label} />
                        </div>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MyRevenuesView;

