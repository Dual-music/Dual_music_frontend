/**
 * Shared credit-computation helper for wallet recharges.
 *
 * Honors the admin-controlled `platform_settings.economic_config`:
 *   - `credit_value_usd`        — USD price of 1 credit (default 0.01).
 *   - `recharge.fee_pct`        — global fee % deducted before conversion.
 *   - `recharge.provider_fees`  — per-provider overrides (cinetpay/moneroo/stripe).
 *
 * Conversion: USD-equivalent is derived from `exchange_rates(currency_code, rate_per_usd)`,
 * then floored to the nearest credit. Used by every `*-payin-init` and the
 * `RechargeBreakdown.tsx` preview.
 *
 * @returns { credits, feePct, netAmount, netUsd, creditValueUsd }
 * @see      src/components/wallet/RechargeBreakdown.tsx, src/hooks/useRechargePreview.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export type ProviderKey = "cinetpay" | "moneroo" | "stripe";

export async function computeCreditsForRecharge(
  supa: ReturnType<typeof createClient>,
  amount: number,
  currency: string,
  provider: ProviderKey,
): Promise<{ credits: number; feePct: number; netAmount: number; netUsd: number; creditValueUsd: number }> {
  // 1) admin config
  const { data: cfg } = await supa
    .from("platform_settings")
    .select("value")
    .eq("key", "economic_config")
    .maybeSingle();
  const v: any = cfg?.value ?? {};
  const creditValueUsd = Number(v?.credit_value_usd ?? 0.01) || 0.01;
  const base = Number(v?.recharge?.fee_pct ?? 0) || 0;
  const per = v?.recharge?.provider_fees ?? {};
  const feePct = Number(per[provider] ?? base) || 0;

  // 2) exchange rate (currency per USD)
  const { data: rates } = await supa
    .from("exchange_rates")
    .select("currency_code,rate_per_usd")
    .in("currency_code", [currency, "USD"]);
  const rate = Number(rates?.find((r: any) => r.currency_code === currency)?.rate_per_usd ?? 1) || 1;

  // 3) compute
  const netAmount = amount * (1 - feePct / 100);
  const netUsd = netAmount / rate;
  const credits = Math.floor(netUsd / creditValueUsd);
  return { credits: Math.max(0, credits), feePct, netAmount, netUsd, creditValueUsd };
}
