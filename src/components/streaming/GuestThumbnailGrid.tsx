/**
 * Grille de miniatures invités (multi-cam) avec sélection focus.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export interface GuestSlot {
  /** Stable key, typically the guest's user id */
  key: string;
  /** Rendered thumbnail content (already sized to THUMB_W × THUMB_H by the caller) */
  node: ReactNode;
  /** Display name shown in the overflow sheet */
  name?: string;
}

interface GuestThumbnailGridProps {
  /** Container ref of the video stage — used to measure available space */
  containerRef: React.RefObject<HTMLElement>;
  /** Visible thumbnails (already filtered: e.g. exclude focused guest) */
  guests: GuestSlot[];
  /** Px reserved on the right edge for the grid's right-anchor */
  rightInset?: number;
  /** Px reserved on the bottom edge (mobile controls strip on mobile, 16 on desktop) */
  bottomInset?: number;
  /** Px reserved on the top edge (avoid overlap with top badges/share button) */
  topInset?: number;
  /** Single thumbnail width incl. gap. Mobile uses 80, desktop 96. */
  thumbWidth?: number;
  /** Single thumbnail height incl. gap. */
  thumbHeight?: number;
  /** Gap between thumbnails (px) */
  gap?: number;
  /** Whether we're on mobile (smaller thumbnails by default) */
  isMobile?: boolean;
}

/**
 * Responsive guest thumbnail grid anchored to the bottom-right of the video stage.
 *
 * - Adapts column count to container width (small screens → 1 column, wide → multiple).
 * - Caps row count to remaining vertical space, so thumbnails NEVER overflow the video
 *   nor overlap the top badges or bottom controls.
 * - When more guests than slots, shows a "+N" chip that opens a sheet listing them all.
 */
export const GuestThumbnailGrid = ({
  containerRef,
  guests,
  rightInset,
  bottomInset,
  topInset = 64,
  thumbWidth,
  thumbHeight,
  gap = 8,
  isMobile = false,
}: GuestThumbnailGridProps) => {
  const { t } = useLanguage();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sheetOpen, setSheetOpen] = useState(false);

  // Defaults: smaller on mobile to fit more on narrow screens
  const tw = thumbWidth ?? (isMobile ? 80 : 96);
  const th = thumbHeight ?? (isMobile ? 80 : 96);
  const right = rightInset ?? (isMobile ? 8 : 16);
  const bottom = bottomInset ?? (isMobile ? 156 : 16);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("orientationchange", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", update);
    };
  }, [containerRef]);

  // Compute capacity. Reserve at minimum half the container width for the main video.
  const { cols, rows, capacity } = useMemo(() => {
    if (!size.w || !size.h) return { cols: 1, rows: 1, capacity: 1 };

    // Max horizontal area we may use for thumbnails (keep at least 50% of width for the video)
    const maxGridWidth = Math.max(tw, Math.min(size.w * 0.5, size.w - right - 16));
    const maxGridHeight = Math.max(th, size.h - bottom - topInset);

    const colsCalc = Math.max(1, Math.floor((maxGridWidth + gap) / (tw + gap)));
    const rowsCalc = Math.max(1, Math.floor((maxGridHeight + gap) / (th + gap)));
    return { cols: colsCalc, rows: rowsCalc, capacity: colsCalc * rowsCalc };
  }, [size, tw, th, gap, right, bottom, topInset]);

  if (guests.length === 0) return null;

  const hasOverflow = guests.length > capacity;
  // If overflow, reserve last cell for the "+N" chip
  const visibleCount = hasOverflow ? Math.max(0, capacity - 1) : guests.length;
  const visible = guests.slice(0, visibleCount);
  const hidden = guests.slice(visibleCount);

  const gridWidth = cols * tw + (cols - 1) * gap;

  return (
    <>
      <div
        className="absolute z-20 pointer-events-none"
        style={{
          right,
          bottom,
          width: gridWidth,
          maxHeight: rows * th + (rows - 1) * gap,
        }}
      >
        <div
          className="grid gap-2 justify-end"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${tw}px)`,
            gap,
            direction: "rtl", // fill right-to-left so first item sits at the right edge
          }}
        >
          {visible.map((g) => (
            <div
              key={g.key}
              className="pointer-events-auto"
              style={{ width: tw, height: th, direction: "ltr" }}
            >
              {g.node}
            </div>
          ))}

          {hasOverflow && (
            <div
              className="pointer-events-auto"
              style={{ width: tw, height: th, direction: "ltr" }}
            >
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full h-full rounded-lg bg-black/70 hover:bg-black/85 text-white border-2 border-white/20 flex flex-col items-center justify-center gap-1 p-0"
                    aria-label={t("viewAllGuests") || "Voir tous les invités"}
                  >
                    <Users className="w-5 h-5" />
                    <span className="text-xs font-bold tabular-nums">+{hidden.length}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side={isMobile ? "bottom" : "right"} className="w-full sm:max-w-md">
                  <SheetHeader>
                    <SheetTitle>
                      {t("allGuests") || "Tous les invités"} ({guests.length})
                    </SheetTitle>
                  </SheetHeader>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[70vh] overflow-y-auto pr-1">
                    {guests.map((g) => (
                      <div
                        key={g.key}
                        className="flex flex-col items-center gap-1"
                        onClick={() => setSheetOpen(false)}
                      >
                        <div style={{ width: tw, height: th }}>{g.node}</div>
                      </div>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
