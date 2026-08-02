/**
 * Bouton d'enregistrement serveur (LiveKit Egress) pour l'hôte/manager d'un direct.
 *
 * Piloté par le mode admin (`recording_config`) lu via `GET /recordings/status` :
 *  - `off`    : rien affiché.
 *  - `auto`   : simple indicateur « REC » quand l'enregistrement automatique tourne.
 *  - `manual` : bouton Démarrer / Arrêter (l'hôte lance l'enregistrement).
 *
 * Remplace l'ancienne capture navigateur (MediaRecorder) : ici c'est le serveur qui
 * enregistre la room, donc pas besoin du flux local ni de l'onglet resté ouvert.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Circle, Video } from "lucide-react";
import {
  getRecordingStatus,
  startRecording,
  stopRecording,
  type RecordingSource,
  type RecordingStatus,
} from "@/api/endpoints/recordings";

interface RecordingButtonProps {
  sourceType: RecordingSource;
  sourceId: string | null | undefined;
  className?: string;
}

export const RecordingButton = ({ sourceType, sourceId, className }: RecordingButtonProps) => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [status, setStatus] = useState<RecordingStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const label = (fr: string, en: string) => (language === "fr" ? fr : en);

  const refresh = useCallback(async () => {
    if (!sourceId) return;
    try {
      setStatus(await getRecordingStatus(sourceType, sourceId));
    } catch {
      /* transient — on réessaiera */
    }
  }, [sourceType, sourceId]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 6000);
    return () => clearInterval(iv);
  }, [refresh]);

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

  // Mode manuel : l'hôte lance / arrête.
  const toggle = async () => {
    if (!sourceId) return;
    setBusy(true);
    try {
      const next = status.active
        ? await stopRecording(sourceType, sourceId)
        : await startRecording(sourceType, sourceId);
      setStatus(next);
      toast({
        title: next.active
          ? label("Enregistrement démarré", "Recording started")
          : label("Enregistrement arrêté", "Recording stopped"),
      });
    } catch (e: any) {
      toast({ title: t("error") || label("Erreur", "Error"), description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="sm"
      variant={status.active ? "destructive" : "outline"}
      disabled={busy}
      onClick={toggle}
      className={`gap-1.5 ${className ?? ""}`}
    >
      {status.active ? (
        <>
          <Circle className="w-2.5 h-2.5 fill-current animate-pulse" />
          {label("Arrêter", "Stop")}
        </>
      ) : (
        <>
          <Video className="w-4 h-4" />
          {label("Enregistrer", "Record")}
        </>
      )}
    </Button>
  );
};

export default RecordingButton;
