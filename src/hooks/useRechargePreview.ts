/**
 * useRechargePreview
 * ------------------
 * Calcule en temps réel le nombre de crédits que recevra l'utilisateur pour
 * une recharge (montant, devise, provider). Réplique côté client la logique
 * de `supabase/functions/_shared/recharge-credits.ts` : applique les frais
 * provider, convertit en USD, divise par `credit_value_usd`.
 *
 * Utilisé par CinetPayRechargeForm / MonerooRechargeForm pour afficher
 * RechargeBreakdown avant validation.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getPublicSetting } from "@/api/endpoints/settings";
import { useExchangeRates, useCreditValueUsd } from "@/hooks/useCurrency";

export type ProviderKey = "cinetpay" | "moneroo" | "stripe";

const useProviderFees = () =>
  useQuery({
    queryKey: ["recharge-provider-fees"],
    queryFn: async () => {
      const v = ((await getPublicSetting<any>("economic_config", {})) as any) ?? {};
      // Common admin field
      const base = Number(v?.recharge?.fee_pct ?? 0);
      // Optional per-provider overrides
      const per = v?.recharge?.provider_fees ?? {};
      return {
        cinetpay: Number(per.cinetpay ?? base) || 0,
        moneroo: Number(per.moneroo ?? base) || 0,
        stripe: Number(per.stripe ?? base) || 0,
      } as Record<ProviderKey, number>;
    },
    staleTime: 60_000,
  });

export interface RechargePreview {
  amountPaid: number;       // what user pays (entered amount, in `currency`)
  currency: string;
  feePct: number;           // applied %
  feeAmount: number;        // in same currency
  netAmount: number;        // amount - fee (in same currency)
  netUsd: number;           // converted to USD
  creditValueUsd: number;   // 1 credit = X USD
  credits: number;          // credits credited to wallet
}

/**
 * Compute the live preview of fees + credits credited for a recharge.
 * - amount: amount the user types (already in `currency`)
 * - currency: ISO currency code (XOF, EUR, USD…)
 * - provider: which payment provider applies the % fee
 *
 * Coherence rule:
 *   net = amount * (1 - fee%)
 *   netUsd = net / rate_per_usd[currency]
 *   credits = floor(netUsd / credit_value_usd)
 */
export const useRechargePreview = (
  amount: number,
  currency: string,
  provider: ProviderKey,
): RechargePreview | null => {
  const { data: rates } = useExchangeRates();
  const { data: creditValueUsd } = useCreditValueUsd();
  const { data: fees } = useProviderFees();

  return useMemo(() => {
    if (!amount || amount <= 0 || !rates || !fees || !creditValueUsd) return null;
    const rate = rates.find(r => r.currency_code === currency);
    if (!rate) return null;
    const feePct = fees[provider] ?? 0;
    const feeAmount = +(amount * (feePct / 100)).toFixed(2);
    const netAmount = +(amount - feeAmount).toFixed(2);
    const netUsd = netAmount / Number(rate.rate_per_usd || 1);
    const credits = Math.floor(netUsd / Number(creditValueUsd || 0.01));
    return {
      amountPaid: amount,
      currency,
      feePct,
      feeAmount,
      netAmount,
      netUsd,
      creditValueUsd: Number(creditValueUsd),
      credits,
    };
  }, [amount, currency, provider, rates, fees, creditValueUsd]);
};
