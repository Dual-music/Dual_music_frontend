/**
 * Admin: GiftsVotesSettingsView — vue combinée cadeaux + votes.
 *
 * Consolide les paramètres économiques des cadeaux virtuels et du vote
 * payant en duel (prix unitaire, multiplicateurs, plafonds par plan
 * d'abonnement) pour édition rapide.
 *
 * @access  role=admin
 */
import { useEffect, useState } from "react";
import { getPublicSetting } from "@/api/endpoints/settings";
import { compareDistribution, revenueDistributions } from "@/api/endpoints/admin";
import { ApiError } from "@/api/http";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Gift, Vote, CheckCircle2, AlertTriangle, Loader2, RefreshCw, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";

interface EcoConfig {
  gift?: { platform_pct: number };
  vote?: { platform_pct: number };
}

interface RecentDist {
  id: string;
  source_type: string;
  total_credits: number;
  platform_credits: number;
  manager_credits: number;
  artist1_credits: number;
  artist2_credits: number;
  created_at: string;
}

interface Comparison {
  distribution_id: string;
  source_type: string;
  total_credits: number;
  recipient_is_manager?: boolean;
  config: { platform_pct: number; manager_pct: number };
  simulated: { platform: number; manager: number; artists: number };
  executed: { platform: number; manager: number; artists: number };
  matches: { platform: boolean; manager: boolean; artists: boolean };
}

const GiftsVotesSettingsView = () => {
  const { toast } = useToast();
  const { language, t } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const fmtDt = (d: string) => formatTz(d, "dd MMM yyyy HH:mm", { timezone: tz, language });
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<EcoConfig | null>(null);
  const [recents, setRecents] = useState<RecentDist[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [simAmount, setSimAmount] = useState<string>("100");
  const [simType, setSimType] = useState<string>("gift_duel");
  const [simManagerInvolved, setSimManagerInvolved] = useState<boolean>(true);

  const load = async () => {
    setLoading(true);
    const cfg = await getPublicSetting<EcoConfig | null>("economic_config", null);
    if (cfg) setConfig(cfg);
    const rows = await revenueDistributions({ limit: 50 }).catch(() => []);
    setRecents(rows as unknown as RecentDist[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runComparison = async () => {
    if (!selectedId) {
      toast({ title: t("gvSelectDistErr"), variant: "destructive" });
      return;
    }
    setComparing(true);
    try {
      const data = await compareDistribution(selectedId);
      if ((data as any)?.error) {
        toast({ title: t("commonError"), description: (data as any).error, variant: "destructive" });
        return;
      }
      setComparison(data as any);
    } catch (e) {
      toast({ title: t("commonError"), description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setComparing(false);
    }
  };

  // Local quick simulation — REAL rule: only platform + recipient (artist OR manager)
  const simResult = (() => {
    const amt = parseFloat(simAmount);
    if (isNaN(amt) || amt <= 0 || !config) return null;
    const isGift = simType.startsWith("gift_");
    const section = isGift ? config.gift : config.vote;
    if (!section) return null;
    const platform_pct = Number(section.platform_pct ?? 0);
    const platform = +(amt * platform_pct / 100).toFixed(2);
    const recipient = +(amt - platform).toFixed(2);
    const recipientLabel = isGift
      ? (simManagerInvolved ? t("gvManagerRecipient") : t("gvArtistRecipient"))
      : t("gvVotedArtist");
    return { platform, recipient, platform_pct, recipientLabel };
  })();

  if (loading) {
    return <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("commonLoading")}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Effective rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Gift className="w-5 h-5 text-pink-500" />
            {t("gvRulesTitle")}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {t("gvRulesDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border p-3 bg-pink-500/5">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="w-4 h-4 text-pink-500" /> <span className="font-semibold text-sm">{t("gvVirtualGifts")}</span>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("gvPlatform")}</span><Badge variant="outline">{config?.gift?.platform_pct ?? 0}%</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("gvRecipientLabel")}</span><Badge>{t("gvRestFull")}</Badge></div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 leading-snug">
              {t("gvRecipientNote")}
            </p>
          </div>
          <div className="rounded-lg border p-3 bg-purple-500/5">
            <div className="flex items-center gap-2 mb-2">
              <Vote className="w-4 h-4 text-purple-500" /> <span className="font-semibold text-sm">{t("gvVotes")}</span>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("gvPlatform")}</span><Badge variant="outline">{config?.vote?.platform_pct ?? 0}%</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("gvVotedArtist")}</span><Badge>{t("gvRestFull")}</Badge></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick simulation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">{t("gvSimTitle")}</CardTitle>
          <CardDescription className="text-xs">{t("gvSimDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">{t("gvType")}</Label>
              <Select value={simType} onValueChange={setSimType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gift_duel">{t("gvGiftDuel")}</SelectItem>
                  <SelectItem value="gift_concert">{t("gvGiftConcert")}</SelectItem>
                  <SelectItem value="gift_live">{t("gvGiftLive")}</SelectItem>
                  <SelectItem value="vote">{t("gvVote")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("gvAmount")}</Label>
              <Input type="number" min={1} value={simAmount} onChange={(e) => setSimAmount(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("gvReceiverType")}</Label>
              <Select value={simManagerInvolved ? "yes" : "no"} onValueChange={(v) => setSimManagerInvolved(v === "yes")} disabled={simType === "vote"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">{t("gvArtist")}</SelectItem>
                  <SelectItem value="yes">{t("gvManager")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {simResult && (
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <div className="rounded p-2 bg-blue-500/10 border border-blue-500/20">
                <p className="text-muted-foreground">{t("gvPlatform")} ({simResult.platform_pct}%)</p>
                <p className="text-base font-bold">{simResult.platform.toLocaleString()} {simResult.platform > 1 ? t("creditsUnit") : t("creditUnit")}</p>
              </div>
              <div className="rounded p-2 bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-muted-foreground">{simResult.recipientLabel} ({(100 - simResult.platform_pct).toFixed(0)}%)</p>
                <p className="text-base font-bold">{simResult.recipient.toLocaleString()} {simResult.recipient > 1 ? t("creditsUnit") : t("creditUnit")}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compare */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">{t("gvCompareTitle")}</CardTitle>
          <CardDescription className="text-xs">
            {t("gvCompareDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder={t("gvDistPh")} /></SelectTrigger>
              <SelectContent>
                {recents.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {fmtDt(r.created_at)} • {r.source_type} • {Number(r.total_credits).toLocaleString()} {Number(r.total_credits) > 1 ? t("creditsUnit") : t("creditUnit")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={runComparison} disabled={comparing || !selectedId}>
              {comparing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              {t("gvCompareBtn")}
            </Button>
          </div>

          {recents.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">{t("gvNoDist")}</p>
          )}

          {comparison && <ComparisonResult comparison={comparison} />}

          {/* Recent distributions list with per-row "Voir le détail" */}
          {recents.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 text-xs font-semibold flex items-center justify-between">
                <span>{t("gvRecentDists")}</span>
                <Badge variant="outline" className="text-[10px]">{t("gvGiftVotesTag")}</Badge>
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {recents.map((r) => {
                  const srcLabel =
                    r.source_type === "gift_duel" ? t("gvGiftDuel")
                    : r.source_type === "gift_concert" ? t("gvGiftConcert")
                    : r.source_type === "gift_live" ? t("gvGiftLive")
                    : r.source_type === "vote" ? t("gvVote")
                    : r.source_type;
                  return (
                  <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{srcLabel}</Badge>
                        <span className="text-muted-foreground">{fmtDt(r.created_at)}</span>
                      </div>
                      <div className="text-[11px] mt-0.5">
                        Total <strong>{Number(r.total_credits).toLocaleString()} {Number(r.total_credits) > 1 ? t("gvCreditMany") : t("gvCreditOne")}</strong>
                        {" "}• {t("gvRowPlatform")} {Number(r.platform_credits).toLocaleString()}
                        {" "}• {t("gvRowManager")} {Number(r.manager_credits).toLocaleString()}
                        {" "}• {t("gvRowArtists")} {(Number(r.artist1_credits) + Number(r.artist2_credits)).toLocaleString()}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => { setDetailId(r.id); setDetailOpen(true); }}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> {t("gvViewDetail")}
                    </Button>
                  </div>
                  );
                })}
              </div>

            </div>
          )}
        </CardContent>
      </Card>

      <DistributionDetailDialog open={detailOpen} onClose={() => setDetailOpen(false)} distributionId={detailId} />
    </div>
  );
};

// ============== Helpers / sub-components ==============

const fmtDelta = (sim: number, exe: number) => {
  const d = +(exe - sim).toFixed(2);
  if (d === 0) return { text: "0", positive: true };
  return { text: `${d > 0 ? "+" : ""}${d.toLocaleString()}`, positive: false };
};

const ComparisonResult = ({ comparison }: { comparison: Comparison }) => {
  const { t } = useLanguage();
  const isGiftOrVote = ["gift_concert", "gift_duel", "gift_live", "vote"].includes(comparison.source_type);
  const isGift = comparison.source_type.startsWith("gift_");

  // For gifts/votes, only show platform + recipient (2 cols). Otherwise show all 3.
  const recipientLabel = isGiftOrVote
    ? (comparison.recipient_is_manager ? t("gvManagerRecipient") : (isGift ? t("gvArtistRecipient") : t("gvArtist")))
    : t("gvArtistsPlural");

  const keys: Array<"platform" | "manager" | "artists"> = isGiftOrVote
    ? ["platform", comparison.recipient_is_manager ? "manager" : "artists"]
    : ["platform", "manager", "artists"];

  const allMatch = keys.every((k) => comparison.matches[k]);

  const labelFor = (k: "platform" | "manager" | "artists") => {
    if (k === "platform") return t("gvRowPlatform");
    if (isGiftOrVote) return recipientLabel;
    return k === "manager" ? t("gvRowManager") : t("gvArtistsPlural");
  };

  const srcLabel =
    comparison.source_type === "gift_duel" ? t("gvGiftDuel")
    : comparison.source_type === "gift_concert" ? t("gvGiftConcert")
    : comparison.source_type === "gift_live" ? t("gvGiftLive")
    : comparison.source_type === "vote" ? t("gvVote")
    : comparison.source_type;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        {t("gvCompareSource")}: <span className="font-medium text-foreground">{srcLabel}</span>
        {" "}• {t("gvTotal")}: <span className="font-medium text-foreground">{comparison.total_credits.toLocaleString()} {comparison.total_credits > 1 ? t("gvCreditMany") : t("gvCreditOne")}</span>
        {isGiftOrVote && (
          <> {" "}• {t("gvReceiver")}: <span className="font-medium text-foreground">{comparison.recipient_is_manager ? t("gvRowManager") : t("gvArtist")}</span></>
        )}
      </div>
      <div className={`grid gap-2 text-xs ${keys.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {keys.map((k) => {
          const ok = comparison.matches[k];
          const sim = comparison.simulated[k];
          const exe = comparison.executed[k];
          const delta = fmtDelta(sim, exe);
          return (
            <div key={k} className={`rounded border p-2 ${ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold">{labelFor(k)}</span>
                {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
              </div>
              <div className="text-[10px] text-muted-foreground">{t("gvSimulated")}</div>
              <div className="font-bold">{sim.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{t("gvExecuted")}</div>
              <div className="font-bold">{exe.toLocaleString()}</div>
              <div className="text-[10px] mt-1">{t("gvDelta")} : <span className={ok ? "text-emerald-600" : "text-destructive font-semibold"}>{delta.text}</span></div>
            </div>
          );
        })}
      </div>
      {!allMatch && (
        <div className="text-xs p-2 rounded bg-destructive/10 border border-destructive/30 text-destructive">
          {t("gvMismatch")}
        </div>
      )}
      {allMatch && (
        <div className="text-xs p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
          {t("gvConform")}
        </div>
      )}
    </div>
  );
};


const DistributionDetailDialog = ({
  open, onClose, distributionId,
}: { open: boolean; onClose: () => void; distributionId: string | null }) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);

  useEffect(() => {
    if (!open || !distributionId) return;
    let active = true;
    setLoading(true);
    setComparison(null);
    (async () => {
      try {
        const data = await compareDistribution(distributionId);
        if (!active) return;
        if ((data as any)?.error) {
          toast({ title: t("gvErrorTitle"), description: (data as any).error, variant: "destructive" });
        } else {
          setComparison(data as any);
        }
      } catch (e) {
        if (!active) return;
        toast({ title: t("gvErrorTitle"), description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, distributionId, toast, t]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("gvDistDetail")}</DialogTitle>
          <DialogDescription className="text-xs">
            {t("gvDistDetailDesc")}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("gvLoading")}</div>
        ) : comparison ? (
          <ComparisonResult comparison={comparison} />
        ) : (
          <p className="text-xs text-muted-foreground text-center py-6">{t("gvNoData")}</p>
        )}
      </DialogContent>
    </Dialog>

  );
};

export default GiftsVotesSettingsView;
