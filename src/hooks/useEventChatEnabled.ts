/**
 * useEventChatEnabled
 * --------------------
 * Tracks whether chat is enabled for a live/concert/duel/competition, kept in
 * sync across every open client via the `settings` realtime event (emitted by
 * each domain service's update function when the host flips `chatEnabled`).
 *
 * @param initial the entity's own `chat_enabled` field (defaults to true if
 *   undefined/null — matches the column's server-side default).
 */
import { useEffect, useState } from "react";

import { useRoomEvent } from "@/realtime/useRoom";
import type { RoomType } from "@/realtime/socket";

export const useEventChatEnabled = (
  eventType: RoomType,
  eventId: string | null | undefined,
  initial: boolean | null | undefined,
): boolean => {
  const [chatEnabled, setChatEnabled] = useState<boolean>(initial !== false);

  useEffect(() => {
    setChatEnabled(initial !== false);
  }, [initial]);

  useRoomEvent<{ chat_enabled?: boolean }>("/live", eventType, eventId, "settings", (payload) => {
    if (payload && "chat_enabled" in payload) setChatEnabled(payload.chat_enabled !== false);
  });

  return chatEnabled;
};
