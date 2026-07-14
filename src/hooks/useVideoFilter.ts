/**
 * useVideoFilter
 * --------------
 * Applique un filtre vidéo en temps réel sur la track caméra LiveKit
 * (sépia, noir & blanc, blur, beauty, …) via un `TrackProcessor` Canvas.
 *
 * Le filtre est appliqué AVANT publication SFU, donc visible par tous les
 * spectateurs. Bascule à chaud via `setFilter(id)` sans re-publier la track.
 *
 * @see src/lib/videoFilters.ts
 */
import { useEffect, useRef, useState, useCallback } from "react";
import type { Room } from "livekit-client";
import {
  applyFilterToRoom,
  CanvasFilterProcessor,
  DEFAULT_FILTER_ID,
  FILTER_STORAGE_KEY,
} from "@/lib/videoFilters";

/**
 * Manage a TikTok-style video filter on the local LiveKit camera track.
 * The processed track is published, so all viewers see the filter.
 */
export const useVideoFilter = (room: Room | null, enabled: boolean) => {
  const [filterId, setFilterIdState] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_FILTER_ID;
    return localStorage.getItem(FILTER_STORAGE_KEY) || DEFAULT_FILTER_ID;
  });
  const processorRef = useRef<CanvasFilterProcessor | null>(null);

  const setFilterId = useCallback((id: string) => {
    setFilterIdState(id);
    try { localStorage.setItem(FILTER_STORAGE_KEY, id); } catch {}
  }, []);

  // Re-apply whenever filter id, room, or enabled flag changes
  useEffect(() => {
    if (!enabled || !room) return;
    let cancelled = false;
    (async () => {
      const next = await applyFilterToRoom(room, filterId, processorRef.current);
      if (!cancelled) processorRef.current = next;
    })();
    return () => { cancelled = true; };
  }, [room, enabled, filterId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const proc = processorRef.current;
      if (proc) { proc.destroy().catch(() => {}); }
      processorRef.current = null;
    };
  }, []);

  return { filterId, setFilterId };
};
