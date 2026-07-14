/**
 * useWallet
 * ---------
 * Live credit balance for the signed-in user, backed by the REST backend
 * (`GET /wallet`) via TanStack Query. Any financial mutation elsewhere in the
 * app refreshes the balance by invalidating `queryKeys.wallet.balance`
 * (real-time balance pushes are handled later by the Socket.IO layer).
 *
 * The balance is in CREDITS (integer). Conversion to the user's local currency
 * is done by `useCurrency` (1 credit = `credit_value_usd`, from
 * `platform_settings.economic_config`).
 *
 * @returns { balance, isAuthenticated, loading, refresh }
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { getBalance } from "@/api/endpoints/wallet";
import { queryKeys } from "@/api/queryKeys";
import { useAuth } from "@/contexts/AuthContext";

export const useWallet = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.wallet.balance,
    queryFn: getBalance,
    enabled: isAuthenticated,
    staleTime: 15_000,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance }),
    [queryClient],
  );

  return {
    balance: data?.balance ?? 0,
    eurValue: data?.eurValue ?? 0,
    isAuthenticated,
    loading: isAuthenticated && isLoading,
    refresh,
  };
};
