/**
 * Ephemeral peer-broadcast over Socket.IO `/live`, replacing Supabase
 * `broadcast` channels (floating hearts/emojis, gift animations, timer sync,
 * mute controls, guest media state).
 *
 * A "channel" is any agreed string (e.g. `duel-hearts-<id>`). Members join it and
 * relay `{event, payload}` to the others (the sender is excluded — senders apply
 * their own effect locally, matching the former `broadcast: { self: true }` +
 * local-echo pattern).
 *
 * @module realtime/useRoomBroadcast
 */

import { useCallback, useEffect, useRef } from "react";

import { getSocket } from "./socket";

type BroadcastMsg = { channel: string; event: string; payload: unknown };

/**
 * Subscribes to a broadcast channel and returns a `broadcast(event, payload)`
 * sender. `onEvent(event, payload)` fires for every message from other peers.
 */
export function useRoomBroadcast(
  channel: string | null,
  onEvent?: (event: string, payload: unknown) => void,
) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!channel) return;
    const socket = getSocket("/live");
    const join = () => socket.emit("broadcast:join", channel);
    join();
    socket.on("connect", join);
    const listener = (msg: BroadcastMsg) => {
      if (msg?.channel === channel) handlerRef.current?.(msg.event, msg.payload);
    };
    socket.on("broadcast", listener);
    return () => {
      socket.emit("broadcast:leave", channel);
      socket.off("broadcast", listener);
      socket.off("connect", join);
    };
  }, [channel]);

  const broadcast = useCallback(
    (event: string, payload?: unknown) => {
      if (!channel) return;
      getSocket("/live").emit("broadcast", { channel, event, payload });
    },
    [channel],
  );

  return { broadcast };
}
