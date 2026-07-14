/**
 * useCurrency
 * -----------
 * Préférence de devise utilisateur (persistée dans `profiles.preferred_currency`
 * et mirroré en localStorage). Combine `exchange_rates` (USD pivot) et
 * `platform_settings.economic_config.credit_value_usd` pour exposer :
 *
 *  - `format(credits)`        : libellé localisé (ex: "1 250 FCFA")
 *  - `creditsToFiat(credits)` : valeur numérique dans la devise courante
 *  - `setCurrency(code)`      : mutation (invalide les queries dépendantes)
 *
 * Taux rafraîchis par CRON via l'edge function `refresh-exchange-rates`.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getExchangeRates, getPublicSetting } from "@/api/endpoints/settings";
import * as usersApi from "@/api/endpoints/users";
import { useAuth } from "@/contexts/AuthContext";

export type { ExchangeRate } from "@/api/endpoints/settings";

const FALLBACK_RATES: ExchangeRate[] = [
  { currency_code: "USD", name: "US Dollar", symbol: "$", rate_per_usd: 1 },
  { currency_code: "EUR", name: "Euro", symbol: "€", rate_per_usd: 0.92 },
  { currency_code: "XOF", name: "CFA franc BCEAO", symbol: "FCFA", rate_per_usd: 605 },
  { currency_code: "XAF", name: "CFA franc BEAC", symbol: "FCFA", rate_per_usd: 605 },
  { currency_code: "NGN", name: "Nigerian Naira", symbol: "₦", rate_per_usd: 1550 },
  { currency_code: "GHS", name: "Ghanaian Cedi", symbol: "₵", rate_per_usd: 15 },
  { currency_code: "KES", name: "Kenyan Shilling", symbol: "KSh", rate_per_usd: 130 },
  { currency_code: "ZAR", name: "South African Rand", symbol: "R", rate_per_usd: 18 },
  { currency_code: "MAD", name: "Moroccan Dirham", symbol: "DH", rate_per_usd: 10 },
  { currency_code: "GBP", name: "British Pound", symbol: "£", rate_per_usd: 0.79 },
  { currency_code: "CAD", name: "Canadian Dollar", symbol: "C$", rate_per_usd: 1.36 },
];

export const useExchangeRates = () => {
  return useQuery({
    queryKey: ["exchange-rates"],
    queryFn: async () => {
      const data = await getExchangeRates();
      if (!data || data.length === 0) return FALLBACK_RATES;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreditValueUsd = () => {
  return useQuery({
    queryKey: ["credit-value-usd"],
    queryFn: async () => {
      const val = await getPublicSetting<Record<string, unknown> | null>("economic_config", null);
      return Number(val?.credit_value_usd ?? 0.01);
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useUserCurrency = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: ["user-currency", userId],
    enabled: !!userId,
    queryFn: async () => {
      const prefs = await usersApi.getPreferences();
      const currency = prefs?.currency as { currency_code?: string } | null;
      return currency?.currency_code || "USD";
    },
  });

  const mutation = useMutation({
    mutationFn: (currency: string) => usersApi.setCurrency(currency),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-currency", userId] });
    },
  });

  return { currency: query.data || "USD", setCurrency: mutation.mutate, isLoading: query.isLoading };
};

export const useCurrencyFormatter = () => {
  const { data: rates } = useExchangeRates();
  const { data: creditValueUsd } = useCreditValueUsd();
  const { currency } = useUserCurrency();

  const rate = rates?.find((r) => r.currency_code === currency) ?? FALLBACK_RATES[0];
  const symbol = rate.symbol || rate.currency_code;
  const valueUsd = creditValueUsd ?? 0.01;

  const formatCredits = (credits: number, options?: { withCredits?: boolean }) => {
    const inUsd = credits * valueUsd;
    const inCurrency = inUsd * Number(rate.rate_per_usd);
    const display = inCurrency >= 100
      ? Math.round(inCurrency).toLocaleString()
      : inCurrency.toFixed(2);
    if (options?.withCredits === false) return `${display} ${symbol}`;
    const unit = credits > 1 ? "Crédits" : "Crédit";
    return `${credits.toLocaleString()} ${unit} (~${display} ${symbol})`;
  };

  const formatPrice = (credits: number) => {
    const inUsd = credits * valueUsd;
    const inCurrency = inUsd * Number(rate.rate_per_usd);
    const display = inCurrency >= 100
      ? Math.round(inCurrency).toLocaleString()
      : inCurrency.toFixed(2);
    return `${display} ${symbol}`;
  };

  const creditUnit = (credits: number) => (Number(credits) > 1 ? "Crédits" : "Crédit");
  const formatCreditsLabel = (credits: number) =>
    `${Number(credits).toLocaleString()} ${creditUnit(credits)}`;

  return { formatCredits, formatPrice, formatCreditsLabel, creditUnit, currency, symbol, rate };
};
