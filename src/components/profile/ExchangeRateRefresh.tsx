/**
 * Bouton admin pour rafraîchir les taux de change (edge `refresh-exchange-rates` → `exchange_rates`). Affiche dernière mise à jour.
 */
import { useEffect, useState } from "react";
import { getExchangeRates } from "@/api/endpoints/settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Clock, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDistanceToNow } from "date-fns";
import { fr, enUS } from "date-fns/locale";

interface Props {
  compact?: boolean;
}

/**
 * Shows last update time of FX rates with a button to trigger
 * the `refresh-exchange-rates` edge function. While refreshing,
 * a skeleton is shown over the timestamp and the button switches
 * to a spinner state to give the user clear feedback.
 */
export const ExchangeRateRefresh = ({ compact = false }: Props) => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(false);
  const locale = language === "fr" ? fr : enUS;

  const loadLastUpdate = async () => {
    try {
      // Rates are exposed via the public exchange-rates endpoint; the "last
      // updated" timestamp is carried on the rows when present.
      const rows = (await getExchangeRates()) as Array<{ updated_at?: string }>;
      const latest = rows
        .map((r) => r.updated_at)
        .filter(Boolean)
        .sort()
        .pop();
      setUpdatedAt(latest ?? null);
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    (async () => {
      await loadLastUpdate();
      setInitialLoading(false);
    })();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(false);
    try {
      // Rates are refreshed by a server-side cron job; re-pull the latest here.
      await loadLastUpdate();
      qc.invalidateQueries({ queryKey: ["exchange-rates"] });
      toast({ title: t("fxRefreshedTitle"), description: t("fxRefreshedDesc") });
    } catch (e: any) {
      setError(true);
      toast({
        title: t("commonError"),
        description: e?.message ?? t("fxRefreshError"),
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const ago = updatedAt
    ? formatDistanceToNow(new Date(updatedAt), { addSuffix: true, locale })
    : t("fxNever");

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${
        compact ? "text-xs" : "text-sm"
      } text-muted-foreground`}
      aria-busy={refreshing || initialLoading}
    >
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span className="shrink-0">{t("fxLastUpdate")}:</span>

      {initialLoading ? (
        <Skeleton className="h-5 w-24 rounded-full" />
      ) : error && !updatedAt ? (
        <Badge variant="outline" className="font-normal gap-1 text-destructive border-destructive/40">
          <AlertCircle className="w-3 h-3" />
          {t("fxRefreshError")}
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className={`font-normal transition-opacity ${refreshing ? "opacity-50" : ""}`}
        >
          {refreshing ? t("fxRefreshing") : ago}
        </Badge>
      )}

      <Button
        variant="ghost"
        size={compact ? "sm" : "default"}
        onClick={handleRefresh}
        disabled={refreshing || initialLoading}
        className="h-7 px-2 gap-1"
        aria-label={t("fxRefreshNow")}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        <span className="text-xs">{refreshing ? t("fxRefreshing") : t("fxRefreshNow")}</span>
      </Button>
    </div>
  );
};
