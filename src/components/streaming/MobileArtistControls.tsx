/**
 * Barre de contrôles artiste mobile : flip cam (`replaceTrack`), mute audio, filtres vidéo, stop live (AlertDialog).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { Settings, Pause, Play, Video, VideoOff, Mic, MicOff, X, SwitchCamera } from "lucide-react";

interface MobileArtistControlsProps {
  isStreaming: boolean;
  isPaused: boolean;
  isCameraOn: boolean;
  isMicOn: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onSwitchCamera?: () => void;
}

export const MobileArtistControls = ({
  isStreaming, isPaused, isCameraOn, isMicOn,
  onPause, onResume, onStop, onToggleCamera, onToggleMic, onSwitchCamera,
}: MobileArtistControlsProps) => {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  if (!isStreaming) return null;

  return (
    <div className="absolute top-3 right-14 z-50 pointer-events-auto">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="w-9 h-9 rounded-full bg-background/40 backdrop-blur-sm flex items-center justify-center border border-border/30">
            <Settings className="w-5 h-5 text-foreground" />
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[50vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t("liveControlsTitle")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {isPaused ? (
              <Button onClick={() => { onResume(); setOpen(false); }} className="bg-green-600 hover:bg-green-700 text-white h-14">
                <Play className="w-5 h-5 mr-2" /> {t("resumeBtn")}
              </Button>
            ) : (
              <Button onClick={() => { onPause(); setOpen(false); }} variant="outline" className="border-yellow-500 text-yellow-500 h-14">
                <Pause className="w-5 h-5 mr-2" /> {t("pauseBtn")}
              </Button>
            )}
            <Button onClick={() => { onStop(); setOpen(false); }} variant="destructive" className="h-14">
              <X className="w-5 h-5 mr-2" /> {t("stopBtn")}
            </Button>
            <Button onClick={onToggleCamera} variant={isCameraOn ? "secondary" : "outline"} className="h-14">
              {isCameraOn ? <Video className="w-5 h-5 mr-2" /> : <VideoOff className="w-5 h-5 mr-2" />}
              {isCameraOn ? t("cameraOn") : t("cameraOff")}
            </Button>
            <Button onClick={onToggleMic} variant={isMicOn ? "secondary" : "outline"} className="h-14">
              {isMicOn ? <Mic className="w-5 h-5 mr-2" /> : <MicOff className="w-5 h-5 mr-2" />}
              {isMicOn ? t("micOn") : t("micOff")}
            </Button>
            {onSwitchCamera && (
              <Button onClick={onSwitchCamera} variant="secondary" className="h-14 col-span-2">
                <SwitchCamera className="w-5 h-5 mr-2" />
                {t("switchCamera")}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
