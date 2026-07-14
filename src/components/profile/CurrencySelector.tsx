/**
 * Sélecteur devise affichage (`user_currency_preferences`). Persisté, consommé par `useCurrency`/`useCurrencyFormatter`. Conversion via `exchange_rates`.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useExchangeRates, useUserCurrency, useCurrencyFormatter } from "@/hooks/useCurrency";
import { useLanguage } from "@/contexts/LanguageContext";
import { Coins } from "lucide-react";
import { ExchangeRateRefresh } from "./ExchangeRateRefresh";

export const CurrencySelector = () => {
  const { t } = useLanguage();
  const { data: rates } = useExchangeRates();
  const { currency, setCurrency, isLoading } = useUserCurrency();
  const { formatPrice } = useCurrencyFormatter();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="w-5 h-5 text-primary" />
          {t("currencyPrefTitle")}
        </CardTitle>
        <CardDescription>{t("currencyPrefDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={currency} onValueChange={(v) => setCurrency(v)} disabled={isLoading}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {rates?.map((r) => (
              <SelectItem key={r.currency_code} value={r.currency_code}>
                {r.symbol} — {r.name || r.currency_code} ({r.currency_code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground">
          {t("currencyPrefExample")}: 100 Crédits ≈ {formatPrice(100)}
        </div>
        <ExchangeRateRefresh compact />
      </CardContent>
    </Card>
  );
};

