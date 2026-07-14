/**
 * Wallet: RechargeBreakdown — détail visuel d'une simulation de recharge.
 *
 * Affiche le montant brut, le pourcentage de frais (`fee_pct` global ou
 * override fournisseur), le net en devise locale, l'équivalent USD et le
 * nombre de crédits obtenus. Source : `useRechargePreview` qui reflète
 * fidèlement la logique serveur (`_shared/recharge-credits.ts`).
 */
import type { RechargePreview } from "@/hooks/useRechargePreview";
import { useLanguage } from "@/contexts/LanguageContext";

export const RechargeBreakdown = ({ preview, providerLabel }: { preview: RechargePreview | null; providerLabel: string }) => {
  const { t } = useLanguage();
  if (!preview) return null;
  const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(2));
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm space-y-1">
      <div className="flex justify-between"><span className="text-muted-foreground">{t("breakdownYouPay")}</span><span className="font-medium">{fmt(preview.amountPaid)} {preview.currency}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">{t("breakdownFees")} {providerLabel} ({preview.feePct}%)</span><span>- {fmt(preview.feeAmount)} {preview.currency}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">{t("breakdownNetAfterFees")}</span><span>{fmt(preview.netAmount)} {preview.currency} (~{preview.netUsd.toFixed(2)} USD)</span></div>
      <div className="border-t border-primary/20 my-1" />
      <div className="flex justify-between text-primary font-semibold">
        <span>{t("breakdownCreditsAdded")}</span><span>+{preview.credits.toLocaleString()} {preview.credits > 1 ? t("creditsSuffix") : t("creditSuffix")}</span>
      </div>
      <p className="text-[10px] text-muted-foreground">{t("breakdownAdminRate")} {preview.creditValueUsd} USD</p>
    </div>
  );
};

export default RechargeBreakdown;
