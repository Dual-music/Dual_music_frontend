/**
 * Platform-settings endpoints.
 *
 * Public reads hit the allow-listed `/settings/public*` routes (replacing the
 * former public `supabase.from('platform_settings')` reads); the admin write
 * hits `PUT /admin/settings/:key`.
 *
 * @module api/endpoints/settings
 */

import { http } from "../http";

/** GET /settings/public/:key — single allow-listed config value (or null). */
export async function getPublicSetting<T = unknown>(
  key: string,
  fallback: T,
): Promise<T> {
  const res = await http.get<{ key: string; value: T | null }>(
    `/settings/public/${key}`,
    { anonymous: true },
  );
  return (res.value ?? fallback) as T;
}

/** GET /settings/public?keys=a,b — batch fetch of allow-listed config. */
export function getPublicSettings(
  keys?: string[],
): Promise<Record<string, unknown>> {
  return http.get<Record<string, unknown>>("/settings/public", {
    anonymous: true,
    query: keys?.length ? { keys: keys.join(",") } : undefined,
  });
}

export interface ExchangeRate {
  currency_code: string;
  name: string | null;
  symbol: string | null;
  rate_per_usd: number;
  updated_at?: string;
}

/** GET /settings/exchange-rates — public USD-pivot exchange-rate table. */
export function getExchangeRates(): Promise<ExchangeRate[]> {
  return http.get<ExchangeRate[]>("/settings/exchange-rates", { anonymous: true });
}

/** PUT /admin/settings/:key — admin upsert of a config value. */
export function upsertSetting(key: string, value: unknown): Promise<unknown> {
  return http.put(`/admin/settings/${key}`, { value });
}
