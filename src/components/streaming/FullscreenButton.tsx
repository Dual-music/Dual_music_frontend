/**
 * Bouton plein écran cross-browser (Fullscreen API + fallbacks iOS/Safari).
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize } from "lucide-react";

interface FullscreenButtonProps {
  targetRef: React.RefObject<HTMLElement>;
  className?: string;
}

export const FullscreenButton = ({ targetRef, className = "" }: FullscreenButtonProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync state when fullscreen changes (e.g. user presses Escape)
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!targetRef.current) return;

    try {
      if (document.fullscreenElement) {
        // Always exit fullscreen when we're in fullscreen
        await document.exitFullscreen();
      } else {
        await targetRef.current.requestFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  }, [targetRef]);

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={(e) => {
        e.stopPropagation();
        toggleFullscreen();
      }}
      className={`bg-black/50 hover:bg-black/70 text-white h-8 w-8 ${className}`}
      title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
    >
      {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
    </Button>
  );
};
