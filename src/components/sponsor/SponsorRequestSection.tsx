/**
 * Formulaire demande sponsoring : choix tier (`sponsor_price_tiers`), insert `sponsor_requests`,
 * paiement crédits, validation admin (`AdminSponsorManager`).
 */
import { useEffect, useState } from "react";
import * as sponsors from "@/api/endpoints/sponsors";
import * as uploads from "@/api/endpoints/uploads";
import * as duelsApi from "@/api/endpoints/duels";
import * as concertsApi from "@/api/endpoints/concerts";
import { listCompetitions } from "@/api/endpoints/competitions";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Upload, Clock, CheckCircle2, XCircle, Loader2, CreditCard } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";

interface UpcomingEvent {
  id: string;
  type: "duel" | "concert" | "artist_concert" | "competition";
  label: string;
  date: string;
  submissionDeadline?: string | null;
}


export const SponsorRequestSection = () => {
  const { toast } = useToast();
  const { language, t } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const { user } = useAuth();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [eventKey, setEventKey] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [tiers, setTiers] = useState<{ label: string; min_seconds: number; max_seconds: number; price_credits: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    sponsors.listTiers()
      .then((data) => setTiers((data as any[]) || []))
      .catch(() => setTiers([]));
  }, []);

  // Probe video duration when the user selects a video file (so the admin can apply tier-based pricing).
  // A static image has no intrinsic duration but pricing is duration-tiered, so an
  // image occupies the shortest display slot = the smallest active tier's min_seconds.
  const imageSlotSeconds = tiers.length ? Math.min(...tiers.map((t) => t.min_seconds)) : null;

  const handleFile = (f: File | null) => {
    setFile(f);
    setMediaDuration(null);
    if (f && f.type.startsWith("video")) {
      const url = URL.createObjectURL(f);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = url;
      v.onloadedmetadata = () => {
        setMediaDuration(Math.round(v.duration || 0));
        URL.revokeObjectURL(url);
      };
    } else if (f && f.type.startsWith("image")) {
      // Assign the image display slot so the price preview + request both resolve a tier.
      setMediaDuration(imageSlotSeconds);
    }
  };

  const expectedTier = tiers.find((t) => mediaDuration != null && mediaDuration >= t.min_seconds && mediaDuration <= t.max_seconds);

  const loadEvents = async () => {
    const tomorrow = new Date();
    tomorrow.setHours(tomorrow.getHours() + 24);
    const cutoffMs = tomorrow.getTime();

    // REST list endpoints return raw rows incl. `sponsor_submission_deadline`
    // (except artist_concerts, which has no such column → treated as always open).
    // The >24h cutoff, status and deadline gating are applied client-side.
    const [duels, concerts, aConcerts, competitions] = await Promise.all([
      duelsApi.listDuels({ status: "upcoming", limit: 100 }).catch(() => []),
      concertsApi.listConcerts({ status: "upcoming", limit: 100 }).catch(() => []),
      concertsApi.listArtistConcerts({ limit: 100 }).catch(() => []),
      listCompetitions({ limit: 100 }).catch(() => []),
    ]);

    const now = Date.now();
    const isOpen = (deadline: any) => !deadline || new Date(deadline).getTime() > now;
    const afterCutoff = (d: any) => !!d && new Date(d).getTime() > cutoffMs;

    const list: UpcomingEvent[] = [];
    (duels as any[])?.forEach((d: any) => { if (d.status === "upcoming" && afterCutoff(d.scheduled_time) && isOpen(d.sponsor_submission_deadline)) list.push({ id: d.id, type: "duel", label: `${t("sponsorReqDuelLabel")} — ${formatTz(d.scheduled_time, "dd MMM yyyy", { timezone: tz, language })}`, date: d.scheduled_time, submissionDeadline: d.sponsor_submission_deadline }); });
    (concerts as any[])?.forEach((c: any) => { if (c.status === "upcoming" && afterCutoff(c.scheduled_date) && isOpen(c.sponsor_submission_deadline)) list.push({ id: c.id, type: "concert", label: `${t("sponsorReqConcertLabel")} : ${c.title}`, date: c.scheduled_date, submissionDeadline: c.sponsor_submission_deadline }); });
    (aConcerts as any[])?.forEach((c: any) => { if (c.status === "upcoming" && afterCutoff(c.scheduled_date) && isOpen(c.sponsor_submission_deadline)) list.push({ id: c.id, type: "artist_concert", label: `${t("sponsorReqConcertLabel")} : ${c.title}`, date: c.scheduled_date, submissionDeadline: c.sponsor_submission_deadline }); });
    (competitions as any[])?.forEach((c: any) => { if (["open", "candidates_locked", "published"].includes(c.status) && afterCutoff(c.start_at) && isOpen(c.sponsor_submission_deadline)) list.push({ id: c.id, type: "competition", label: `${t("sponsorReqCompetitionLabel")} : ${c.title}`, date: c.start_at, submissionDeadline: c.sponsor_submission_deadline }); });
    list.sort((a, b) => a.date.localeCompare(b.date));
    setEvents(list);
  };


  const loadRequests = async () => {
    if (!user) return;
    try {
      const data = await sponsors.myRequests();
      setRequests((data as any[]) || []);
    } catch {
      setRequests([]);
    }
  };

  useEffect(() => { loadEvents(); }, []);
  useEffect(() => { loadRequests(); }, [user]);

  const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

  const humanizeUploadError = (err: any, f: File): string => {
    const raw = (err?.message || err?.error || "").toString();
    const status = err?.statusCode || err?.status;
    const lower = raw.toLowerCase();

    if (lower.includes("payload") || lower.includes("too large") || status === 413) {
      return `Le fichier « ${f.name} » (${(f.size / (1024 * 1024)).toFixed(1)} Mo) dépasse la limite autorisée (50 Mo). Compressez la vidéo ou choisissez une version plus courte.`;
    }
    if (lower.includes("network") || lower.includes("failed to fetch") || lower.includes("err_http2") || lower.includes("err_network") || lower.includes("timeout") || lower.includes("aborted")) {
      return `Connexion interrompue pendant l'envoi de « ${f.name} ». Vérifiez votre connexion internet (le Wi-Fi est recommandé pour les vidéos), puis réessayez.`;
    }
    if (lower.includes("mime") || lower.includes("content-type") || lower.includes("invalid")) {
      return `Le format du fichier « ${f.name} » n'est pas accepté. Utilisez une image (JPG, PNG) ou une vidéo (MP4, MOV, WEBM).`;
    }
    if (lower.includes("duplicate") || lower.includes("already exists")) {
      return `Ce fichier a déjà été envoyé. Renommez-le ou réessayez dans un instant.`;
    }
    if (lower.includes("permission") || lower.includes("unauthorized") || lower.includes("not authorized") || status === 401 || status === 403) {
      return `Vous n'êtes pas autorisé à envoyer ce fichier. Reconnectez-vous puis réessayez.`;
    }
    if (lower.includes("bucket") && lower.includes("not found")) {
      return `Stockage indisponible. Merci de réessayer plus tard ou de contacter le support.`;
    }
    return raw ? `Envoi impossible : ${raw}` : `Envoi impossible. Vérifiez votre connexion puis réessayez.`;
  };

  const submit = async () => {
    if (!user || !eventKey || !description || !file) {
      toast({ title: t("sponsorReqRequiredTitle"), description: t("sponsorReqRequiredDesc"), variant: "destructive" });
      return;
    }
    // Pricing is duration-tiered; images fall back to the display slot. Block if
    // no tier covers the media (backend requires mediaDurationSeconds ≥ 1 → would 400).
    const effectiveDuration = file.type.startsWith("image") ? (mediaDuration ?? imageSlotSeconds) : mediaDuration;
    if (effectiveDuration == null || effectiveDuration < 1) {
      toast({ title: t("sponsorReqErrorTitle"), description: t("sponsorReqNoTier"), variant: "destructive" });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({
        title: t("sponsorReqErrorTitle"),
        description: `Le fichier « ${file.name} » fait ${(file.size / (1024 * 1024)).toFixed(1)} Mo. La taille maximale acceptée est de 50 Mo. Compressez ou raccourcissez votre vidéo.`,
        variant: "destructive",
      });
      return;
    }
    const isMedia = file.type.startsWith("image/") || file.type.startsWith("video/");
    if (!isMedia) {
      toast({
        title: t("sponsorReqErrorTitle"),
        description: `Le format du fichier « ${file.name} » n'est pas pris en charge. Utilisez une image (JPG, PNG) ou une vidéo (MP4, MOV, WEBM).`,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const [eventType, eventId] = eventKey.split("|") as [UpcomingEvent["type"], string];
      let mediaUrl: string;
      try {
        mediaUrl = await uploads.uploadFile(file, "sponsor");
      } catch (upErr: any) {
        toast({
          title: "Échec de l'envoi du média",
          description: humanizeUploadError(upErr, file),
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }
      const mediaType = file.type.startsWith("video") ? "video" : "image";

      try {
        await sponsors.createRequest({
          eventType,
          eventId,
          description,
          mediaUrl,
          mediaType,
          mediaDurationSeconds: effectiveDuration,
        });
      } catch (insErr: any) {
        toast({
          title: "Impossible d'enregistrer la demande",
          description: `Le média a été envoyé mais la demande n'a pas pu être enregistrée : ${insErr?.message}. Réessayez ou contactez le support.`,
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      toast({ title: t("sponsorReqSentTitle"), description: t("sponsorReqSentDesc") });
      setDescription(""); setFile(null); setEventKey(""); setMediaDuration(null);
      loadRequests();
    } catch (e: any) {
      // Network-level failures (e.g. ERR_HTTP2_PROTOCOL_ERROR) surface as TypeError: Failed to fetch
      toast({
        title: "Erreur pendant l'envoi",
        description: humanizeUploadError(e, file),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const pay = async (id: string) => {
    setPaying(id);
    try {
      await sponsors.payRequest(id, {}, crypto.randomUUID());
      toast({ title: t("sponsorReqPaidTitle"), description: t("sponsorReqPaidDesc") });
      loadRequests();
    } catch (e: any) {
      toast({ title: t("sponsorReqErrorTitle"), description: e.message, variant: "destructive" });
    } finally {
      setPaying(null);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { labelKey: string; cls: string; icon: any }> = {
      pending: { labelKey: "sponsorStatusPending", cls: "bg-yellow-500/20 text-yellow-700", icon: Clock },
      awaiting_payment: { labelKey: "sponsorStatusAwaitingPayment", cls: "bg-orange-500/20 text-orange-700", icon: CreditCard },
      paid: { labelKey: "sponsorStatusPaid", cls: "bg-blue-500/20 text-blue-700", icon: Clock },
      approved: { labelKey: "sponsorStatusApproved", cls: "bg-green-500/20 text-green-700", icon: CheckCircle2 },
      rejected: { labelKey: "sponsorStatusRejected", cls: "bg-red-500/20 text-red-700", icon: XCircle },
      cancelled: { labelKey: "sponsorStatusCancelled", cls: "bg-gray-500/20 text-gray-700", icon: XCircle },
      active: { labelKey: "sponsorStatusActive", cls: "bg-green-500/20 text-green-700", icon: CheckCircle2 },
      expired: { labelKey: "sponsorStatusExpired", cls: "bg-gray-500/20 text-gray-700", icon: XCircle },
    };
    const v = map[s] || map.pending;
    const Icon = v.icon;
    return <Badge className={v.cls}><Icon className="w-3 h-3 mr-1" />{t(v.labelKey)}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5 text-primary" /> {t("sponsorReqTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t("sponsorReqEventLabel")}</Label>
            <Select value={eventKey} onValueChange={setEventKey}>
              <SelectTrigger><SelectValue placeholder={t("sponsorReqEventPh")} /></SelectTrigger>
              <SelectContent>
                {events.length === 0 && <div className="px-2 py-3 text-sm text-muted-foreground">{t("sponsorReqNoEvents")}</div>}
                {events.map((e) => (
                  <SelectItem key={`${e.type}|${e.id}`} value={`${e.type}|${e.id}`}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("sponsorReqDescLabel")}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("sponsorReqDescPh")} maxLength={500} />
          </div>
          <div>
            <Label>{t("sponsorReqMediaLabel")}</Label>
            <label className="mt-1 flex items-center gap-3 rounded-md border border-input bg-background px-3 py-2 cursor-pointer hover:bg-accent/30 transition-colors">
              <span className="inline-flex items-center px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-medium">
                {t("sponsorReqChooseFile")}
              </span>
              <span className="text-sm text-muted-foreground truncate flex-1">
                {file ? file.name : t("sponsorReqNoFile")}
              </span>
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
              />
            </label>
            {mediaDuration != null && <p className="text-xs text-muted-foreground mt-1">{t("sponsorReqDetectedDuration")} : {mediaDuration}s</p>}
          </div>
          {tiers.length > 0 && (
            <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
              <p className="text-xs font-semibold">{t("sponsorReqTiersTitle")}</p>
              {tiers.map((tier, i) => (
                <p key={i} className={`text-xs ${expectedTier === tier ? "font-bold text-primary" : "text-muted-foreground"}`}>
                  {tier.label} — {tier.price_credits} {t("sponsorReqTiersCredits")}
                  {expectedTier === tier ? ` ${t("sponsorReqTiersYourVideo")}` : ""}
                </p>
              ))}
              <p className="text-[10px] text-muted-foreground italic">{t("sponsorReqTiersFinalNote")}</p>
            </div>
          )}
          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {t("sponsorReqSubmit")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("sponsorReqMyTitle")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {requests.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t("sponsorReqMyEmpty")}</p>}
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.description}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {statusBadge(r.status)}
                  {r.price_credits > 0 && <Badge variant="outline">{r.price_credits} {t("sponsorReqCreditsBadge")}</Badge>}
                </div>
              </div>
              {r.status === "awaiting_payment" && (
                <Button size="sm" onClick={() => pay(r.id)} disabled={paying === r.id}>
                  {paying === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CreditCard className="w-4 h-4 mr-1" /> {t("sponsorReqPayBtn")}</>}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default SponsorRequestSection;
