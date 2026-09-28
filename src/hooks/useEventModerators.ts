/**
 * useEventModerators
 * -------------------
 * FR — Modérateurs désignés d'un évènement (live/concert/duel/compétition) :
 * l'hôte principal (artiste pour live/concert, manager pour duel/compétition)
 * peut en choisir jusqu'à 2 parmi les spectateurs connectés pour l'aider à
 * modérer (bannir, masquer un message) — jamais le pouvoir d'activer/
 * désactiver le chat, qui reste exclusif à l'hôte.
 *
 * EN — An event's appointed moderators: the primary host (artist for
 * live/concert, manager for duel/competition) may pick up to 2 current
 * viewers to help moderate (ban, hide messages) — never the chat on/off
 * toggle, which stays host-exclusive.
 *
 * Realtime: subscribes to `moderator:appointed` / `moderator:revoked` on the
 * event's `/live` room so every open client's moderator list stays in sync.
 */
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useRoomEvent } from "@/realtime/useRoom";
import type { RoomType } from "@/realtime/socket";
import {
  listCurrentViewers,
  listEventModerators,
  appointModerator as apiAppointModerator,
  revokeModerator as apiRevokeModerator,
  type EventType,
} from "@/api/endpoints/moderation";
import { ApiError } from "@/api/http";

export const MAX_EVENT_MODERATORS = 2;

interface UseEventModeratorsOptions {
  eventType: EventType;
  eventId: string;
  /** Only the host may list current viewers / appoint / revoke. */
  isHost: boolean;
}

export const useEventModerators = ({ eventType, eventId, isHost }: UseEventModeratorsOptions) => {
  const queryClient = useQueryClient();
  const moderatorsKey = ["event-moderators", eventType, eventId];

  const { data: moderators = [] } = useQuery({
    queryKey: moderatorsKey,
    queryFn: () => listEventModerators(eventType, eventId),
    enabled: !!eventId,
  });

  const [viewers, setViewers] = useState<Array<Record<string, unknown>>>([]);
  const [viewersLoading, setViewersLoading] = useState(false);

  const loadViewers = useCallback(async () => {
    if (!isHost || !eventId) return;
    setViewersLoading(true);
    try {
      setViewers(await listCurrentViewers(eventType, eventId));
    } catch {
      setViewers([]);
    } finally {
      setViewersLoading(false);
    }
  }, [eventType, eventId, isHost]);

  const refetchModerators = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: moderatorsKey });
  }, [queryClient, eventType, eventId]);

  // Un autre client (l'hôte, ou l'un des modérateurs déjà désignés) a changé la liste.
  useRoomEvent("/live", eventType as RoomType, eventId, "moderator:appointed", refetchModerators);
  useRoomEvent("/live", eventType as RoomType, eventId, "moderator:revoked", refetchModerators);

  const appoint = useCallback(
    async (userId: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await apiAppointModerator(eventType, eventId, userId);
        refetchModerators();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof ApiError ? e.message : "Error" };
      }
    },
    [eventType, eventId, refetchModerators],
  );

  const revoke = useCallback(
    async (userId: string): Promise<boolean> => {
      try {
        await apiRevokeModerator(eventType, eventId, userId);
        refetchModerators();
        return true;
      } catch {
        return false;
      }
    },
    [eventType, eventId, refetchModerators],
  );

  const isAppointedModerator = useCallback(
    (userId?: string | null) => !!userId && moderators.some((m) => m.user_id === userId),
    [moderators],
  );

  return {
    moderators,
    isAppointedModerator,
    viewers,
    viewersLoading,
    loadViewers,
    appoint,
    revoke,
    atLimit: moderators.length >= MAX_EVENT_MODERATORS,
  };
};
