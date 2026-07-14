/**
 * Realtime room + event hooks (Socket.IO), replacing `supabase.channel(...)`.
 *
 * - {@link useRoom} joins a `type:id` room on a namespace for the component's
 *   lifetime (emits `join` on mount / `leave` on unmount).
 * - {@link useRoomEvent} joins the room AND subscribes to one server event,
 *   invoking a callback with the payload. Handler identity is kept in a ref so
 *   callers don't need to memoize it.
 *
 * Backend events per namespace (see backend `realtime`):
 *  - `/chat`: `message`
 *  - `/live`: `performer`, `focus`, `leaderboard:update`, `stream:banned`,
 *    `competition:banned`, `sponsor:ad`, `event:reminder`, `competition:finished`
 *  - `/notifications`: `notification:new` (personal room, see useNotificationsSocket)
 *
 * @module realtime/useRoom
 */

import { useEffect, useRef, useState } from "react";

import { getSocket, roomName, type Namespace, type RoomType } from "./socket";

/** Joins a `type:id` room on a namespace for the component's lifetime. */
export function useRoom(namespace: Namespace, type: RoomType, id: string | null | undefined): void {
  useEffect(() => {
    if (!id) return;
    const socket = getSocket(namespace);
    const join = () => socket.emit("join", { type, id });
    join();
    // Re-join after a reconnect (rooms are per-connection).
    socket.on("connect", join);
    return () => {
      socket.emit("leave", { type, id });
      socket.off("connect", join);
    };
  }, [namespace, type, id]);
}

/**
 * Joins a room and subscribes to a single server event.
 * @param namespace socket namespace
 * @param type room type
 * @param id room id (subscription is inert while null)
 * @param event server event name
 * @param handler called with the event payload
 */
export function useRoomEvent<T = unknown>(
  namespace: Namespace,
  type: RoomType,
  id: string | null | undefined,
  event: string,
  handler: (payload: T) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useRoom(namespace, type, id);

  useEffect(() => {
    if (!id) return;
    const socket = getSocket(namespace);
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [namespace, type, id, event]);
}

/**
 * Live viewer count (presence) for a `/live` room. Joins the room and tracks the
 * backend's `presence` broadcasts ({room, count}). Replaces Supabase presence.
 */
export function usePresence(type: RoomType, id: string | null | undefined): number {
  const [count, setCount] = useState(0);
  useRoom("/live", type, id);
  useEffect(() => {
    if (!id) return;
    const room = roomName(type, id);
    const socket = getSocket("/live");
    const listener = (payload: { room: string; count: number }) => {
      if (payload?.room === room) setCount(payload.count);
    };
    socket.on("presence", listener);
    return () => {
      socket.off("presence", listener);
    };
  }, [type, id]);
  return count;
}

/** Low-level: subscribe to a namespace event without joining a room. */
export function useSocketEvent<T = unknown>(
  namespace: Namespace,
  event: string,
  handler: (payload: T) => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket(namespace);
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [namespace, event, enabled]);
}
