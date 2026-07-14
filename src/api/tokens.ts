/**
 * Token storage for the REST backend.
 *
 * The backend issues a short-lived RS256 access token plus a rotating opaque
 * refresh token (see `token.service.js`). We persist both in `localStorage` so a
 * session survives reloads, and expose a tiny pub/sub so the `AuthContext` can
 * react when tokens are cleared out-of-band (e.g. a failed refresh).
 *
 * @module api/tokens
 */

const ACCESS_KEY = "dm.accessToken";
const REFRESH_KEY = "dm.refreshToken";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

type Listener = (tokens: AuthTokens | null) => void;
const listeners = new Set<Listener>();

/** Reads the current access token, or `null` when signed out. */
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

/** Reads the current refresh token, or `null` when signed out. */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

/** Persists a freshly-issued token pair and notifies subscribers. */
export function setTokens(tokens: AuthTokens): void {
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  emit(tokens);
}

/** Clears the session (logout / failed refresh) and notifies subscribers. */
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  emit(null);
}

/** Subscribes to token changes. Returns an unsubscribe function. */
export function onTokensChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(tokens: AuthTokens | null): void {
  for (const listener of listeners) listener(tokens);
}
