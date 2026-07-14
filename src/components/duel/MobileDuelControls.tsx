/**
 * Contrôles host duel mobile : flip cam, mute, demande de fin de tour, stop duel (AlertDialog).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Settings, Pause, Play, Video, VideoOff, Mic, MicOff, X, Radio, SwitchCamera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MobileDuelControlsProps {
  isStreaming: boolean;
  isPaused: boolean;
  isCameraOn: boolean;
  isMicOn: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onSwitchCamera?: () => void;
}

export const MobileDuelControls = ({
  isStreaming, isPaused, isCameraOn, isMicOn,
  onStart, onPause, onResume, onStop, onToggleCamera, onToggleMic, onSwitchCamera,
}: MobileDuelControlsProps) => {
  const [open, setOpen] = useState(false);

  if (!isStreaming) {
    return (
      <button
        onClick={onStart}
        className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg border border-border/30"
      >
        <Radio className="w-5 h-5 text-primary-foreground" />
      </button>
    );
  }

  return (
    <div className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, x: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute left-12 top-1/2 -translate-y-1/2 bg-background/90 backdrop-blur-md rounded-xl border border-border/50 p-3 shadow-xl min-w-[160px] z-50"
          >
            <div className="flex flex-col gap-2">
              {isPaused ? (
                <Button onClick={() => { onResume(); setOpen(false); }} size="sm" className="bg-green-600 hover:bg-green-700 text-white justify-start h-9">
                  <Play className="w-4 h-4 mr-2" /> Reprendre
                </Button>
              ) : (
                <Button onClick={() => { onPause(); setOpen(false); }} size="sm" variant="outline" className="border-yellow-500 text-yellow-500 justify-start h-9">
                  <Pause className="w-4 h-4 mr-2" /> Pause
                </Button>
              )}
              <Button onClick={onToggleCamera} size="sm" variant={isCameraOn ? "secondary" : "outline"} className="justify-start h-9">
                {isCameraOn ? <Video className="w-4 h-4 mr-2" /> : <VideoOff className="w-4 h-4 mr-2" />}
                {isCameraOn ? "Caméra ON" : "Caméra OFF"}
              </Button>
              <Button onClick={onToggleMic} size="sm" variant={isMicOn ? "secondary" : "outline"} className="justify-start h-9">
                {isMicOn ? <Mic className="w-4 h-4 mr-2" /> : <MicOff className="w-4 h-4 mr-2" />}
                {isMicOn ? "Micro ON" : "Micro OFF"}
              </Button>
              {onSwitchCamera && isCameraOn && (
                <Button onClick={onSwitchCamera} size="sm" variant="secondary" className="justify-start h-9">
                  <SwitchCamera className="w-4 h-4 mr-2" /> Retourner caméra
                </Button>
              )}
              <Button onClick={() => { onStop(); setOpen(false); }} size="sm" variant="destructive" className="justify-start h-9">
                <X className="w-4 h-4 mr-2" /> Arrêter
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen(prev => !prev)}
        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors border border-border/30 ${
          open ? "bg-primary" : "bg-background/40 backdrop-blur-sm"
        }`}
      >
        <Settings className={`w-5 h-5 ${open ? "text-primary-foreground" : "text-foreground"}`} />
      </button>
    </div>
  );
};
