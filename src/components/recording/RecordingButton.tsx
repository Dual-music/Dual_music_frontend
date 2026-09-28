/**
 * Bouton d'enregistrement serveur (LiveKit Egress) pour l'hôte/manager d'un direct.
 *
 * Piloté par le mode admin (`recording_config`) lu via `GET /recordings/status` :
 *  - `off`    : rien affiché.
 *  - `auto`   : simple indicateur « REC » quand l'enregistrement automatique tourne.
 *  - `manual` : chrono + Pause/Reprendre + Annuler + Sauvegarder (l'hôte pilote tout).
 *
 * L'egress LiveKit n'a pas de vraie pause serveur : « Pause » arrête le segment en cours,
 * « Reprendre » en démarre un nouveau sous la même session — le backend les recolle en UNE
 * vidéo à la sauvegarde finale (voir `recording.service.js`). Le chrono ci-dessous ignore ce
 * détail : il additionne juste `accumulatedSeconds` (segments déjà clos) + le temps écoulé
 * depuis `runStartedAt` (segment en cours), et tourne localement entre deux polls de statut.
 *
 * Remplace l'ancienne capture navigateur (MediaRecorder) : ici c'est le serveur qui
 * enregistre la room, donc pas besoin du flux local ni de l'onglet resté ouvert — ça marche
 * pareil que l'hôte publie depuis le web ou depuis mobile.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Circle, Video, Pause, Play, Square, X, Loader2 } from "lucide-react";
import {
  getRecordingStatus,
  startRecording,
  pauseRecording,
  resumeRecording,
  cancelRecording,
  stopRecording,
  type RecordingSource,
  type RecordingStatus,
} from "@/api/endpoints/recordings";

interface RecordingButtonProps {
  sourceType: RecordingSource;
  sourceId: string | null | undefined;
  className?: string;
}

/** `125` → `"02:05"` ; `4000` → `"1:06:40"`. */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const RecordingButton = ({ sourceType, sourceId, className }: RecordingButtonProps) => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [status, setStatus] = useState<RecordingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [liveSeconds, setLiveSeconds] = useState(0);
  // Dédoublonne le toast d'échec : `failed` reste vrai pendant toute la fenêtre de 2 min côté
  // serveur (voir recording.service.js#recordingStatus), sans ça chaque poll de 6 s le
  // réafficherait.
  const failedToastShown = useRef(false);

  const label = (fr: string, en: string) => (language === "fr" ? fr : en);

  const refresh = useCallback(async () => {
    if (!sourceId) return;
    try {
      const next = await getRecordingStatus(sourceType, sourceId);
      setStatus(next);
      if (next.failed && !failedToastShown.current) {
        failedToastShown.current = true;
        toast({
          title: label("Échec de l'enregistrement", "Recording failed"),
          description:
            next.error ||
            label(
              "Aucun segment récupérable — l'enregistrement n'a pas pu être sauvegardé.",
              "No recoverable segment — the recording could not be saved.",
            ),
          variant: "destructive",
        });
      } else if (!next.failed) {
        failedToastShown.current = false;
      }
    } catch {
      /* transient — on réessaiera */
    }
  }, [sourceType, sourceId, toast, language]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 6000);
    return () => clearInterval(iv);
  }, [refresh]);

  // Chrono local : tourne chaque seconde entre deux polls, resynchronisé par `status`.
  useEffect(() => {
    if (!status) return;
    const base = status.accumulatedSeconds + (status.active && status.runStartedAt
      ? (Date.now() - new Date(status.runStartedAt).getTime()) / 1000
      : 0);
    setLiveSeconds(base);
    if (!status.active) return;
    const iv = setInterval(() => setLiveSeconds((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [status]);

  const run = async (action: () => Promise<RecordingStatus>, successMsg?: { title: string; description?: string }) => {
    if (!sourceId) return;
    setBusy(true);
    try {
      const next = await action();
      setStatus(next);
      if (successMsg) toast(successMsg);
    } catch (e: any) {
      toast({ title: t("error") || label("Erreur", "Error"), description: e?.message, variant: "destructive" });
      // Resynchronise : un échec peut survenir APRÈS que le serveur ait déjà changé d'état (ex.
      // l'egress a fini de s'arrêter tout seul entre-temps) — sans ça l'état affiché reste
      // bloqué sur l'ancienne valeur et les boutons suivants semblent ne plus rien faire.
      refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!sourceId || !status || status.mode === "off") return null;

  // Mode auto : l'enregistrement se déclenche seul → on montre juste l'état.
  if (status.mode === "auto") {
    return status.active ? (
      <Badge variant="destructive" className={`gap-1 ${className ?? ""}`}>
        <Circle className="w-2.5 h-2.5 fill-current animate-pulse" />
        {label("Enregistrement", "Recording")}
      </Badge>
    ) : null;
  }

  // Mode manuel, rien en cours : bouton de démarrage.
  if (!status.active && !status.paused && !status.finalizing) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => run(() => startRecording(sourceType, sourceId), { title: label("Enregistrement démarré", "Recording started") })}
        className={`gap-1.5 ${className ?? ""}`}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
        {label("Enregistrer", "Record")}
      </Button>
    );
  }

  // Sauvegarde en cours (dernier segment en clôture / recollage ffmpeg) : indicateur seul.
  if (status.finalizing) {
    return (
      <Badge variant="secondary" className={`gap-1.5 ${className ?? ""}`}>
        <Loader2 className="w-3 h-3 animate-spin" />
        {label("Finalisation…", "Finalizing…")}
      </Badge>
    );
  }

  // Mode manuel, en cours (actif ou en pause) : chrono + Pause/Reprendre + Annuler + Sauvegarder.
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className ?? ""}`}>
      <Badge variant="destructive" className="gap-1.5 font-mono tabular-nums">
        <Circle className={`w-2.5 h-2.5 fill-current ${status.active ? "animate-pulse" : ""}`} />
        {formatDuration(liveSeconds)}
        {status.paused && <span className="opacity-80">· {label("pause", "paused")}</span>}
      </Badge>

      {status.active ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => run(() => pauseRecording(sourceType, sourceId), { title: label("Enregistrement en pause", "Recording paused") })}
          className="gap-1.5"
        >
          <Pause className="w-4 h-4" />
          {label("Pause", "Pause")}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => run(() => resumeRecording(sourceType, sourceId), { title: label("Enregistrement repris", "Recording resumed") })}
          className="gap-1.5"
        >
          <Play className="w-4 h-4" />
          {label("Reprendre", "Resume")}
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => setConfirmCancel(true)}
        className="gap-1.5 text-muted-foreground hover:text-destructive"
      >
        <X className="w-4 h-4" />
        {label("Annuler", "Cancel")}
      </Button>

      <Button
        size="sm"
        variant="default"
        disabled={busy}
        onClick={() => run(() => stopRecording(sourceType, sourceId), { title: label("Enregistrement sauvegardé", "Recording saved") })}
        className="gap-1.5"
      >
        <Square className="w-4 h-4" />
        {label("Sauvegarder", "Save")}
      </Button>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={label("Annuler l'enregistrement ?", "Cancel this recording?")}
        description={label(
          "Tout ce qui a été enregistré jusqu'ici sera définitivement perdu — aucun replay ne sera créé.",
          "Everything recorded so far will be permanently discarded — no replay will be created.",
        )}
        confirmLabel={label("Annuler l'enregistrement", "Discard recording")}
        variant="destructive"
        onConfirm={() => {
          setConfirmCancel(false);
          run(() => cancelRecording(sourceType, sourceId), { title: label("Enregistrement annulé", "Recording cancelled") });
        }}
      />
    </div>
  );
};

export default RecordingButton;
