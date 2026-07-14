/**
 * Bouton signalement de live (`live_reports`). Déclenche auto-stop à 75% de reports (modération).
 */
/**
 * LiveReportButton
 * ----------------
 * Bouton de signalement contextuel affiché pendant un live/concert/duel.
 *
 * Visibilité conditionnée par `platform_settings.report_config` :
 *  - feature flag par type de stream (`live`, `concert`, `duel`)
 *  - seuil minimum de spectateurs avant affichage
 *
 * Insère une ligne dans `live_reports` (déduplique par reporter+stream).
 * Au-delà de 75% de spectateurs ayant signalé, un trigger côté DB stoppe
 * automatiquement le live (voir mem://features/moderation-reporting-system).
 *
 * @prop streamId    - id du concert / duel / live
 * @prop streamType  - 'concert' | 'duel' | 'live'
 * @prop viewerCount - nombre courant de spectateurs (alimente le seuil)
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { reportLive } from "@/api/endpoints/moderation";
import { reportSummary } from "@/api/endpoints/lives";
import { getPublicSetting } from "@/api/endpoints/settings";
import { ApiError } from "@/api/http";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ReportStreamType = "live" | "concert" | "duel" | "competition";

interface LiveReportButtonProps {
  /** Stream id (live id, concert id or duel id). */
  liveId: string;
  viewerCount: number;
  /** True if current user hosts/owns the stream and should not see the button. */
  isArtist: boolean;
  /** Defaults to "live" for backward compatibility. */
  streamType?: ReportStreamType;
  onAutoStop?: () => void;
}

const REPORT_REASONS = [
  { value: "inappropriate", label: "Contenu inapproprié" },
  { value: "violence", label: "Violence" },
  { value: "harassment", label: "Harcèlement" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Autre" },
];

interface ReportConfig {
  enabled_live: boolean;
  enabled_concert: boolean;
  enabled_duel: boolean;
  enabled_competition: boolean;
  viewer_threshold: number;
  stop_percentage: number;
}

const DEFAULT_REPORT_CONFIG: ReportConfig = {
  enabled_live: true,
  enabled_concert: true,
  enabled_duel: true,
  enabled_competition: true,
  viewer_threshold: 5,
  stop_percentage: 75,
};

export const LiveReportButton = ({
  liveId,
  viewerCount,
  isArtist,
  streamType = "live",
  onAutoStop,
}: LiveReportButtonProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [hasReported, setHasReported] = useState(false);
  const [reason, setReason] = useState("inappropriate");
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ReportConfig>(DEFAULT_REPORT_CONFIG);
  const [warningIssued, setWarningIssued] = useState(false);

  // Per-live report summary (count + caller's own report status). Only lives are
  // backed by `live_reports`; other stream types rely on the DB-side threshold
  // trigger, so the count stays at 0 for them.
  const { data: summary } = useQuery({
    queryKey: ["live-report-summary", liveId],
    queryFn: () => reportSummary(liveId),
    enabled: streamType === "live" && !!liveId,
    refetchInterval: 15000,
  });
  const reportCount = summary?.count ?? 0;

  // Reflect the server's knowledge that the caller already reported this live.
  useEffect(() => {
    if (summary?.hasReported) setHasReported(true);
  }, [summary?.hasReported]);

  // Load merged config (new live_report_config + legacy keys as fallback)
  useEffect(() => {
    const loadSettings = async () => {
      const cfg = await getPublicSetting<Partial<ReportConfig>>(
        "live_report_config",
        DEFAULT_REPORT_CONFIG,
      );
      setConfig({
        enabled_live: cfg?.enabled_live ?? DEFAULT_REPORT_CONFIG.enabled_live,
        enabled_concert: cfg?.enabled_concert ?? DEFAULT_REPORT_CONFIG.enabled_concert,
        enabled_duel: cfg?.enabled_duel ?? DEFAULT_REPORT_CONFIG.enabled_duel,
        enabled_competition: cfg?.enabled_competition ?? DEFAULT_REPORT_CONFIG.enabled_competition,
        viewer_threshold: Number(cfg?.viewer_threshold ?? DEFAULT_REPORT_CONFIG.viewer_threshold),
        stop_percentage: Number(cfg?.stop_percentage ?? DEFAULT_REPORT_CONFIG.stop_percentage),
      });
    };
    loadSettings();
  }, [liveId, user?.id]);

  // Check auto-stop condition
  useEffect(() => {
    if (viewerCount >= config.viewer_threshold && reportCount > 0) {
      const percentage = (reportCount / Math.max(1, viewerCount)) * 100;
      if (percentage >= config.stop_percentage && !warningIssued) {
        setWarningIssued(true);
        toast({
          title: "⚠️ Avertissement",
          description: "Cet événement a reçu trop de signalements. Il sera arrêté dans 5 minutes si les signalements persistent.",
          variant: "destructive",
        });
        setTimeout(() => {
          onAutoStop?.();
        }, 5 * 60 * 1000);
      }
    }
  }, [reportCount, viewerCount, config, warningIssued, onAutoStop, toast]);

  const handleReport = async () => {
    if (!user) {
      toast({ title: "Connexion requise", variant: "destructive" });
      return;
    }

    try {
      await reportLive({ liveId, streamType, reason });
      setHasReported(true);
      toast({ title: "Signalement envoyé", description: "Merci pour votre signalement." });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setHasReported(true);
        toast({ title: "Déjà signalé", description: "Vous avez déjà signalé cet événement." });
      } else {
        toast({ title: "Erreur", description: "Impossible de signaler", variant: "destructive" });
      }
    }
    setOpen(false);
  };

  // Hide if disabled by admin for this stream type, or current user is the host.
  const enabledForType =
    streamType === "live"
      ? config.enabled_live
      : streamType === "concert"
      ? config.enabled_concert
      : streamType === "competition"
      ? config.enabled_competition
      : config.enabled_duel;

  if (isArtist || !enabledForType || viewerCount < config.viewer_threshold) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          disabled={hasReported}
          className="text-destructive hover:bg-destructive/10"
        >
          <AlertTriangle className="w-4 h-4 mr-1" />
          {hasReported ? "Signalé" : "Signaler"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signaler cet événement</DialogTitle>
          <DialogDescription>
            Indiquez la raison du signalement. Si suffisamment de spectateurs signalent, l'événement sera arrêté.
          </DialogDescription>
        </DialogHeader>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {REPORT_REASONS.map(r => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="destructive" onClick={handleReport}>Signaler</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
