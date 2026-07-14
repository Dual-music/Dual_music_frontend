/**
 * Typed HTTP client for the Dual Music REST backend.
 *
 * Responsibilities:
 * - Prefix every request with `VITE_API_URL` and attach the Bearer access token.
 * - Unwrap the backend's success envelope `{ data, meta }` → returns `data`,
 *   and surface `meta` (pagination, requestId) via {@link requestWithMeta}.
 * - Translate the error envelope `{ error: { code, message, details } }` into a
 *   typed {@link ApiError} that callers (and TanStack Query) can branch on.
 * - Transparently refresh an expired access token once on `401`, replaying the
 *   original request. Concurrent 401s share a single in-flight refresh.
 *
 * This is the single choke point that replaces the Supabase client's transport.
 *
 * @module api/http
 */

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "./tokens";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";

/** Pagination metadata as emitted by the backend's `buildPaginationMeta`. */
export interface PaginationMeta {
  mode?: "page" | "cursor";
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasMore?: boolean;
  nextCursor?: string | null;
}

export interface ResponseMeta {
  requestId?: string;
  pagination?: PaginationMeta;
  [key: string]: unknown;
}

/** Error thrown for any non-2xx response (or network/parse failure). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON body — serialized automatically. Use `formData` for uploads. */
  body?: unknown;
  /** Multipart body — sent as-is, no `Content-Type` header forced. */
  formData?: FormData;
  /** Query params; `undefined`/`null` entries are skipped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Extra headers (e.g. `Idempotency-Key`). */
  headers?: Record<string, string>;
  /** Skip attaching the access token (public endpoints). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

/** Builds a full URL with an optional query string. */
function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(
    path.startsWith("/") ? `${BASE_URL}${path}` : `${BASE_URL}/${path}`,
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

// --- Single-flight refresh ---------------------------------------------------
let refreshInFlight: Promise<boolean> | null = null;

/** Attempts to rotate the refresh token. Returns `true` on success. */
async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const res = await fetch(buildUrl("/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    return false;
  }
  const json = await res.json();
  const data = json?.data ?? {};
  if (!data.accessToken || !data.refreshToken) {
    clearTokens();
    return false;
  }
  setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return true;
}

/** De-duplicates concurrent refreshes into a single network call. */
function ensureRefreshed(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function execute(
  path: string,
  options: RequestOptions,
  isRetry = false,
): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  if (!options.anonymous) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData; // browser sets multipart boundary
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers,
    body,
    signal: options.signal,
  });

  // Refresh once on an expired/invalid access token, then replay.
  if (res.status === 401 && !isRetry && !options.anonymous && getRefreshToken()) {
    const refreshed = await ensureRefreshed();
    if (refreshed) return execute(path, options, true);
  }
  return res;
}

/** Parses a response, unwrapping the envelope or throwing an {@link ApiError}. */
async function parse<T>(res: Response): Promise<{ data: T; meta: ResponseMeta }> {
  if (res.status === 204) return { data: undefined as T, meta: {} };

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    if (res.ok) return { data: undefined as T, meta: {} };
    throw new ApiError(res.status, "NETWORK_ERROR", res.statusText || "Request failed");
  }

  const payload = json as {
    data?: T;
    meta?: ResponseMeta;
    error?: { code: string; message: string; details?: Record<string, unknown> };
  };

  if (!res.ok || payload.error) {
    const err = payload.error ?? { code: "UNKNOWN", message: res.statusText };
    throw new ApiError(res.status, err.code, err.message, err.details);
  }
  return { data: payload.data as T, meta: payload.meta ?? {} };
}

/** Performs a request and returns just the `data` payload. */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const res = await execute(path, options);
  const { data } = await parse<T>(res);
  return data;
}

/** Like {@link request} but also returns `meta` (pagination, requestId). */
export async function requestWithMeta<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta: ResponseMeta }> {
  const res = await execute(path, options);
  return parse<T>(res);
}

/** Convenience verbs. */
export const http = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...options, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "DELETE" }),
  requestWithMeta,
};

export default http;
