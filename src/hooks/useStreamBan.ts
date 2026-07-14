/**
 * useStreamBan
 * ------------
 * FR — Détecte si l'utilisateur courant est banni pour un stream donné
 * et expose un helper `banUser` à destination des hôtes/managers.
 *
 * EN — Tracks whether the current user is banned from a given stream and
 * exposes a `banUser` helper for hosts/managers.
 *
 * Sources interrogées :
 *  1. `stream_bans` ou `competition_bans` (event-scoped, posé par
 *     artiste/manager) — actif si `stream_id` correspond
 *  2. `platform_bans` (global, posé par admin) — géré ailleurs
 *
 * Souscrit en Realtime pour mettre à jour `BannedAccessGate` instantanément
 * dès qu'un ban est posé ou levé.
 *
 * @param streamType - 'live' | 'concert' | 'duel' | 'competition'
 * @param streamId   - id de l'évènement
 * @param currentUserId - id de l'utilisateur courant (pour le drapeau `isCurrentUserBanned`)
 */
import { useEffect, useState, useCallback } from "react";
import { useRoomEvent } from "@/realtime/useRoom";
import { toast } from "sonner";
import {
  listStreamBans,
  listCompetitionBans,
  createStreamBan,
  createCompetitionBan,
} from "@/api/endpoints/moderation";
import { ApiError } from "@/api/http";

export type StreamType = "live" | "concert" | "duel" | "competition";

interface UseStreamBanOptions {
  streamType: StreamType;
  streamId: string;
  /** Current user id (used to know if the *current* user is banned). */
  currentUserId?: string | null;
}

export const useStreamBan = ({ streamType, streamId, currentUserId }: UseStreamBanOptions) => {
  const [bannedIds, setBannedIds] = useState<Set<string>>(new Set());
  const [isCurrentUserBanned, setIsCurrentUserBanned] = useState(false);

  const fetchBans = useCallback(async () => {
    if (!streamId) return;
    try {
      let rows: Array<Record<string, unknown>>;
      if (streamType === "competition") {
        rows = await listCompetitionBans({ competitionId: streamId });
      } else {
        rows = await listStreamBans({ streamId, streamType });
      }
      const ids = new Set<string>(
        rows.map((r) => r.banned_user_id as string).filter(Boolean),
      );
      setBannedIds(ids);
      setIsCurrentUserBanned(currentUserId ? ids.has(currentUserId) : false);
    } catch (e) {
      console.error("Failed to load stream bans", e);
    }
  }, [streamType, streamId, currentUserId]);

  useEffect(() => {
    fetchBans();
  }, [fetchBans]);

  // Realtime ban updates — backend emits `stream:banned` / `competition:banned`
  // on the /live room for this stream/competition.
  useRoomEvent(
    "/live",
    streamType,
    streamId,
    streamType === "competition" ? "competition:banned" : "stream:banned",
    fetchBans,
  );

  const banUser = useCallback(
    async (targetUserId: string, reason?: string) => {
      if (!currentUserId) return false;
      try {
        if (streamType === "competition") {
          await createCompetitionBan({
            competitionId: streamId,
            bannedUserId: targetUserId,
            reason: reason || null,
          });
        } else {
          await createStreamBan({
            streamId,
            streamType,
            bannedUserId: targetUserId,
            reason: reason || null,
          });
        }
        return true;
      } catch (e) {
        console.error("Failed to ban user", e);
        toast.error(e instanceof ApiError ? e.message : "Failed to ban user");
        return false;
      }
    },
    [streamType, streamId, currentUserId]
  );

  return { bannedIds, isCurrentUserBanned, banUser, refetch: fetchBans };
};
