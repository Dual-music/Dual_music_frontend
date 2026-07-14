/**
 * Badge prix réutilisable : crédits + équivalent devise locale (`useCurrencyFormatter`).
 */
import { Badge } from "@/components/ui/badge";
import { Coins, Gift } from "lucide-react";
import { useCurrencyFormatter } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";

interface Props {
  credits: number;
  className?: string;
  size?: "sm" | "md";
  variant?: "default" | "overlay";
}

/**
 * Standardized price badge: shows "Gratuit" or "X Crédits (~Y devise)".
 * Reuses the user's currency preference automatically.
 */
export const PriceBadge = ({ credits, className, size = "md", variant = "default" }: Props) => {
  const { formatPrice, creditUnit } = useCurrencyFormatter();
  const isFree = !credits || Number(credits) <= 0;

  const sizeCls = size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  const overlayCls = variant === "overlay" ? "bg-background/85 backdrop-blur-sm border-border" : "";

  if (isFree) {
    return (
      <Badge className={cn("bg-green-500/90 text-white border-0 gap-1", sizeCls, className)}>
        <Gift className="w-3 h-3" />
        Gratuit
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={cn("gap-1 border-accent/60 text-accent-foreground bg-accent/15", sizeCls, overlayCls, className)}>
      <Coins className="w-3 h-3 text-amber-500" />
      <span className="font-semibold">{Number(credits).toLocaleString()} {creditUnit(Number(credits))}</span>
      <span className="text-muted-foreground">≈ {formatPrice(Number(credits))}</span>
    </Badge>
  );
};

export default PriceBadge;
