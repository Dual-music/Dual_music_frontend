/**
 * Picker compact de devise (icône + dropdown) — variante header/inline du `CurrencySelector`.
 */
import { Coins } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useExchangeRates, useUserCurrency } from "@/hooks/useCurrency";
import { useLanguage } from "@/contexts/LanguageContext";

interface CurrencyPickerProps {
  variant?: "compact" | "full";
}

/**
 * Compact dropdown to switch the user's display currency.
 * Lists every currency available in `exchange_rates`.
 */
export const CurrencyPicker = ({ variant = "compact" }: CurrencyPickerProps) => {
  const { t } = useLanguage();
  const { data: rates } = useExchangeRates();
  const { currency, setCurrency, isLoading } = useUserCurrency();

  const current = rates?.find((r) => r.currency_code === currency);
  const label = current?.symbol || currency;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === "compact" ? "sm" : "default"}
          className="gap-1 px-2"
          disabled={isLoading}
          aria-label={t("currencyPrefTitle")}
        >
          <Coins className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card border-border max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="text-xs">{t("currencyPrefTitle")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {rates?.map((r) => (
          <DropdownMenuItem
            key={r.currency_code}
            onClick={() => setCurrency(r.currency_code)}
            className={`cursor-pointer text-sm ${
              r.currency_code === currency ? "bg-primary/10 text-primary font-semibold" : ""
            }`}
          >
            <span className="w-8 text-center">{r.symbol || r.currency_code}</span>
            <span className="flex-1 truncate">{r.name || r.currency_code}</span>
            <span className="text-xs text-muted-foreground ml-2">{r.currency_code}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
