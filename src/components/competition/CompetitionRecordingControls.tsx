/**
 * Contrôles d'enregistrement composite pour les compétitions.
 * Réutilise `useMediaRecorder` (canvas + audio mix) et insère le replay
 * dans `replay_videos` avec `source_type='competition'`.
 *
 * Réservé au manager propriétaire pendant que le direct est actif.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Video, Square, Loader2, Pause, Play, Clock } from "lucide-react";
import { useMediaRecorder } from "@/hooks/useMediaRecorder";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { createReplay } from "@/api/endpoints/replays";

interface Props {
  stream: MediaStream | null;
  competitionId: string;
  competitionTitle: string;
  userId: string;
}

export const CompetitionRecordingControls = ({
  stream,
  competitionId,
  competitionTitle,
  userId,
}: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const {
    isRecording,
    isPaused,
    isUploading,
    formattedDuration,
    recordingDuration,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopAndUpload,
  } = useMediaRecorder({
    stream,
    concertId: competitionId,
    userId,
    onRecordingComplete: async (url) => {
      if (url) await saveReplay(url);
    },
  });

  const saveReplay = async (url: string) => {
    setIsSaving(true);
    try {
      const minutes = Math.max(1, Math.round(recordingDuration / 60));
      await createReplay({
        sourceType: "competition",
        eventId: competitionId,
        title: `${t("compReplayPrefix")}: ${competitionTitle}`,
        description: `${t("compReplayDescription")} "${competitionTitle}"`,
        videoUrl: url,
        thumbnailUrl: "",
        duration: minutes,
        recordedDate: new Date().toISOString(),
        isPremium: false,
        isPublic: false,
        replayPrice: 0,
      });
      toast({ title: t("recordingSavedTitle"), description: t("recordingSavedDesc") });
    } catch (e: any) {
      console.error(e);
      toast({ title: t("errorTitle"), description: t("recordingSaveError"), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const onStart = () => {
    const ok = startRecording();
    if (ok) toast({ title: t("recordingStartedTitle"), description: t("compRecordingStartedDesc") });
    else toast({ title: t("errorTitle"), description: t("recordingStartError"), variant: "destructive" });
  };

  const onStop = async () => {
    toast({ title: t("recordingFinalizing"), description: t("recordingFinalizingDesc") });
    const url = await stopAndUpload();
    if (!url) toast({ title: t("errorTitle"), description: t("recordingSaveError"), variant: "destructive" });
  };

  if (!stream) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {!isRecording ? (
        <Button
          onClick={onStart}
          variant="outline"
          size="sm"
          className="border-red-500 text-red-500 hover:bg-red-500/10"
          disabled={isUploading || isSaving}
        >
          <Video className="w-4 h-4 mr-2" />
          {t("recordBtn")}
        </Button>
      ) : (
        <>
          {isPaused ? (
            <Button
              onClick={resumeRecording}
              variant="outline"
              size="sm"
              className="border-green-500 text-green-500 hover:bg-green-500/10"
              disabled={isUploading || isSaving}
            >
              <Play className="w-4 h-4 mr-2" />
              {t("resumeBtn")}
            </Button>
          ) : (
            <Button
              onClick={pauseRecording}
              variant="outline"
              size="sm"
              className="border-yellow-500 text-yellow-500 hover:bg-yellow-500/10"
              disabled={isUploading || isSaving}
            >
              <Pause className="w-4 h-4 mr-2" />
              {t("pauseBtn")}
            </Button>
          )}
          <Button
            onClick={onStop}
            variant="destructive"
            size="sm"
            disabled={isUploading || isSaving}
          >
            {isUploading || isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("savingShort")}
              </>
            ) : (
              <>
                <Square className="w-4 h-4 mr-2" />
                {t("stopBtn")}
              </>
            )}
          </Button>
        </>
      )}

      {isRecording && (
        <div className="flex items-center gap-2 text-red-500 text-sm">
          <span className={`w-2 h-2 bg-red-500 rounded-full ${isPaused ? "" : "animate-pulse"}`} />
          <Clock className="w-3 h-3" />
          <span>{formattedDuration}</span>
          <span className="text-muted-foreground">
            {isPaused ? t("pausedShort") : t("recLabel")}
          </span>
        </div>
      )}
    </div>
  );
};

export default CompetitionRecordingControls;
