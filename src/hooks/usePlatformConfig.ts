/**
 * usePlatformConfig
 * -----------------
 * Reads a typed key from `platform_settings` via the backend's public config
 * endpoint (react-query cache). Admin writes go through `PlatformConfigManager`,
 * which invalidates the relevant cache keys.
 *
 * Example keys: `vote_config`, `report_config`, `welcome_config`,
 * `pricing_config`, `economic_config`, `push_config`.
 */
import { useQuery } from "@tanstack/react-query";

import { getPublicSetting } from "@/api/endpoints/settings";

export const usePricingEnabled = () => {
  return useQuery({
    queryKey: ["pricing-config"],
    queryFn: async () => {
      const val = await getPublicSetting<Record<string, unknown> | null>("pricing_config", null);
      if (!val) return true;
      return (val.enabled as boolean) ?? true;
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useReferralEnabled = () => {
  return useQuery({
    queryKey: ["referral-config-enabled"],
    queryFn: async () => {
      const val = await getPublicSetting<Record<string, unknown> | null>("referral_config", null);
      if (!val) return true;
      return (val.enabled as boolean) ?? true;
    },
    staleTime: 60 * 1000,
  });
};
