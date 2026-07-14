/**
 * useEventChat — threaded chat for an event (duel/concert/competition/live),
 * backed by REST history + Socket.IO realtime, replacing the Supabase channel.
 *
 * Loads the initial history via `GET /:kind/:id/messages`, then joins the
 * `/chat` room `kind:id` and appends every `message` the server broadcasts.
 * Exposes `send` (POST) and `remove` (DELETE). Messages are de-duplicated by id
 * so the sender's own echo doesn't double up.
 *
 * @module realtime/useEventChat
 */

import { useCallback, useEffect, useState } from "react";

import * as chatApi from "@/api/endpoints/chat";
import type { ChatKind } from "@/api/endpoints/chat";

import { useRoomEvent } from "./useRoom";

export interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  parent_id?: string | null;
  created_at: string;
  profile?: { id: string; full_name: string | null; avatar_url: string | null } | null;
  [key: string]: unknown;
}

export function useEventChat(kind: ChatKind, eventId: string | null | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const rows = (await chatApi.listMessages(kind, eventId, { limit: 100 })) as unknown as ChatMessage[];
      setMessages(rows || []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [kind, eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: append broadcast messages, de-duping by id.
  useRoomEvent<ChatMessage>("/chat", kind, eventId, "message", (msg) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  });

  const send = useCallback(
    async (message: string, parentId?: string | null) => {
      if (!eventId) return;
      const created = (await chatApi.postMessage(kind, eventId, { message, parentId })) as unknown as ChatMessage;
      // Optimistic append (realtime echo is de-duped by id).
      setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
      return created;
    },
    [kind, eventId],
  );

  const remove = useCallback(
    async (msgId: string) => {
      if (!eventId) return;
      await chatApi.deleteMessage(kind, eventId, msgId);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    },
    [kind, eventId],
  );

  return { messages, loading, send, remove, reload: load };
}
