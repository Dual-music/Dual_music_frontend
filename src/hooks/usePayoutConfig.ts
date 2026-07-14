/**
 * Hook config payout : charge méthodes payout disponibles (Stripe/CinetPay/Moneroo) selon pays,
 * depuis `platform_settings`.
 */
import { useQuery } from "@tanstack/react-query";

import { getPublicSetting } from "@/api/endpoints/settings";

// Payout method codes MUST match the backend enum (withdrawal.validation): mobile_money | bank | paypal.
export type PayoutMethodCode = "mobile_money" | "bank" | "paypal";

export interface PayoutOperator {
  code: string;
  label: string;
}

export interface PayoutConfig {
  methods: PayoutMethodCode[];
  mobile_operators: PayoutOperator[];
}

export const DEFAULT_PAYOUT_CONFIG: PayoutConfig = {
  methods: ["mobile_money", "bank", "paypal"],
  mobile_operators: [
    { code: "orange", label: "Orange Money" },
    { code: "mtn", label: "MTN MoMo" },
    { code: "wave", label: "Wave" },
    { code: "moov", label: "Moov Money" },
    { code: "free", label: "Free Money" },
  ],
};

export const usePayoutConfig = () =>
  useQuery({
    queryKey: ["payout-config"],
    queryFn: async (): Promise<PayoutConfig> => {
      const v = await getPublicSetting<Partial<PayoutConfig> | null>("payout_config", null);
      const methods =
        Array.isArray(v?.methods) && v!.methods!.length > 0
          ? (v!.methods as PayoutMethodCode[])
          : DEFAULT_PAYOUT_CONFIG.methods;
      const ops =
        Array.isArray(v?.mobile_operators) && v!.mobile_operators!.length > 0
          ? (v!.mobile_operators as PayoutOperator[])
          : DEFAULT_PAYOUT_CONFIG.mobile_operators;
      return { methods, mobile_operators: ops };
    },
    staleTime: 60 * 1000,
  });
