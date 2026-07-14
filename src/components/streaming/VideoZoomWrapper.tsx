/**
 * Wrapper pinch-to-zoom / double-tap pour vidéo mobile.
 */
import { useState, useRef, useCallback } from "react";
import { Maximize, Minimize, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

interface VideoZoomWrapperProps {
  children: React.ReactNode;
  label?: string;
  /** Called when user clicks to select/focus this video */
  onSelect?: () => void;
  /** Is this the currently focused/enlarged video */
  isFocused?: boolean;
  /** Called to exit focused view */
  onDeselect?: () => void;
  className?: string;
}

/**
 * Wraps a video stream with zoom (click-to-enlarge) and fullscreen capabilities.
 * Works on both mobile and desktop.
 */
export const VideoZoomWrapper = ({
  children,
  label,
  onSelect,
  isFocused = false,
  onDeselect,
  className = "",
}: VideoZoomWrapperProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  }, []);

  // Listen for fullscreen exit via Escape
  const handleFullscreenChange = useCallback(() => {
    if (!document.fullscreenElement) {
      setIsFullscreen(false);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative group ${!isFocused ? "cursor-pointer" : ""} ${className}`}
      onClick={!isFocused ? onSelect : undefined}
      onDoubleClick={toggleFullscreen}
    >
      {children}

      {/* Hover overlay with label & actions */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10" />

      {/* Label */}
      {label && !isFocused && (
        <div className="absolute bottom-2 left-2 z-20 pointer-events-none">
          <span className="bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm">
            {label}
          </span>
        </div>
      )}

      {/* Tap to enlarge hint on non-focused videos */}
      {!isFocused && onSelect && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm rounded-full p-2">
            <Maximize className="w-5 h-5 text-white" />
          </div>
        </div>
      )}

      {/* Controls for focused video */}
      {isFocused && (
        <div className={`absolute z-30 flex gap-1 ${isMobile ? "top-3 right-[3.5rem]" : "top-2 right-2"}`}>
          <Button
            size="icon"
            variant="ghost"
            className="w-8 h-8 bg-black/50 hover:bg-black/70 text-white"
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
            title={isFullscreen ? "Quitter plein écran" : "Plein écran"}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </Button>
          {onDeselect && (
            <Button
              size="icon"
              variant="ghost"
              className="w-8 h-8 bg-black/50 hover:bg-black/70 text-white"
              onClick={(e) => { e.stopPropagation(); onDeselect(); }}
              title="Voir tout"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {/* Fullscreen button always visible on hover for any video */}
      {!isFocused && (
        <div className={`absolute z-30 opacity-0 group-hover:opacity-100 transition-opacity ${isMobile ? "top-3 right-[3.5rem] opacity-100" : "top-2 right-2"}`}>
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7 bg-black/50 hover:bg-black/70 text-white"
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
            title="Plein écran"
          >
            <Maximize className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
};
