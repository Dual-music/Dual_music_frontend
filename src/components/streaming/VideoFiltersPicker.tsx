/**
 * Picker de filtres vidéo temps réel (`useVideoFilter`, `lib/videoFilters`) appliqués au flux local avant publication.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Check } from "lucide-react";
import { getAvailablePresets } from "@/lib/videoFilters";
import { cn } from "@/lib/utils";

interface VideoFiltersPickerProps {
  filterId: string;
  onChange: (id: string) => void;
  /** Optional className for positioning the trigger button */
  className?: string;
  /** Compact icon-only trigger (mobile) */
  compact?: boolean;
}

/**
 * Floating button + bottom-sheet picker for TikTok-style video filters.
 * Trigger is small enough to sit in stream overlays; the sheet itself is
 * portaled to <body> so it never gets clipped by overflow:hidden parents.
 */
export const VideoFiltersPicker = ({
  filterId,
  onChange,
  className,
  compact = false,
}: VideoFiltersPickerProps) => {
  const [open, setOpen] = useState(false);
  const presets = getAvailablePresets();
  const current = presets.find(p => p.id === filterId) || presets[0];

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Filtres vidéo"
        aria-label="Filtres vidéo"
        className={cn(
          "rounded-full bg-background/40 backdrop-blur-sm border border-border/30 flex items-center justify-center text-foreground hover:bg-background/60 transition-colors pointer-events-auto",
          compact ? "w-9 h-9" : "h-9 px-3 gap-1.5 text-xs font-medium",
          className
        )}
      >
        <Sparkles className="w-4 h-4 text-pink-400" />
        {!compact && <span>{current.icon} {current.label}</span>}
      </button>

      {open && createPortal(
        <>
          <div
            className="fixed inset-0 z-[10080] bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="fixed left-1/2 -translate-x-1/2 bottom-0 z-[10090] w-full max-w-lg bg-card border-t border-border rounded-t-2xl shadow-2xl pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-pink-400" />
                <h3 className="font-semibold text-sm">Filtres vidéo</h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Fermer
              </button>
            </div>
            <p className="px-4 pb-3 text-[11px] text-muted-foreground">
              Visible par tous les spectateurs en temps réel.
            </p>
            <div className="px-3 pb-4 grid grid-cols-4 gap-2 max-h-[55vh] overflow-y-auto">
              {presets.map(preset => {
                const active = preset.id === filterId;
                return (
                  <button
                    key={preset.id}
                    onClick={() => { onChange(preset.id); }}
                    className={cn(
                      "relative aspect-square rounded-xl flex flex-col items-center justify-center gap-1 text-[11px] font-medium border transition-all",
                      "bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-amber-500/10",
                      active
                        ? "border-pink-500 ring-2 ring-pink-500/40 shadow-lg"
                        : "border-border/40 hover:border-border"
                    )}
                  >
                    <span className="text-2xl leading-none">{preset.icon}</span>
                    <span className="text-foreground">{preset.label}</span>
                    {active && (
                      <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
};
