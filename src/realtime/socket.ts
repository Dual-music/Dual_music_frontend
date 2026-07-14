/**
 * Socket.IO client singletons — one connection per backend namespace.
 *
 * Backend namespaces (see backend `realtime/index.js`): `/chat`, `/live`,
 * `/notifications`. The JWT access token is sent on the handshake
 * (`auth.token`); `/chat` and `/live` allow anonymous read, `/notifications`
 * requires a token. Connections are lazily created, shared across hooks, and
 * their `auth.token` is refreshed whenever the token store changes (a token
 * change forces a reconnect so the new identity takes effect).
 *
 * This replaces Supabase Realtime (`supabase.channel(...)`).
 *
 * @module realtime/socket
 */

import { io, type Socket } from "socket.io-client";

import { getAccessToken, onTokensChanged } from "@/api/tokens";

export type Namespace = "/chat" | "/live" | "/notifications";

/** Derives the Socket.IO origin from `VITE_API_URL` (strips the `/api/v1` path). */
function socketOrigin(): string {
  const base = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";
  try {
    return new URL(base).origin;
  } catch {
    return "http://localhost:4000";
  }
}

const sockets = new Map<Namespace, Socket>();

/**
 * Returns the shared Socket for a namespace, creating it on first use.
 * The connection carries the current access token and auto-reconnects.
 */
export function getSocket(namespace: Namespace): Socket {
  let socket = sockets.get(namespace);
  if (socket) return socket;

  socket = io(`${socketOrigin()}${namespace}`, {
    transports: ["websocket", "polling"],
    autoConnect: true,
    auth: { token: getAccessToken() ?? undefined },
    reconnection: true,
  });
  sockets.set(namespace, socket);
  return socket;
}

// Keep every live socket's handshake token in sync; reconnect to re-auth.
onTokensChanged((tokens) => {
  for (const socket of sockets.values()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket.auth as any) = { token: tokens?.accessToken ?? undefined };
    if (socket.connected) socket.disconnect().connect();
  }
});

/** Canonical room name for a (type, id) pair — mirrors backend `roomName`. */
export function roomName(type: RoomType, id: string): string {
  return `${type}:${id}`;
}

export type RoomType = "duel" | "concert" | "competition" | "live" | "leaderboard";

/** Disconnects and forgets every socket (e.g. on full sign-out). */
export function disconnectAll(): void {
  for (const socket of sockets.values()) socket.disconnect();
  sockets.clear();
}
