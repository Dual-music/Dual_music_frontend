/**
 * Wallet: RechargeReceipt — reçu post-paiement affiché au retour fournisseur.
 *
 * Lit les query params (`session_id` Stripe / `transaction_id` CinetPay /
 * `payment_id` Moneroo), interroge la table de transactions correspondante
 * et affiche un état clair : succès, en attente, échec — avec montant,
 * crédits versés et bouton de retour wallet.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as payments from "@/api/endpoints/payments";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Download, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { format } from "date-fns";
import { fr as frLocale, enUS } from "date-fns/locale";
import jsPDF from "jspdf";
import duelLogo from "@/assets/logo-tr.png";

const BRAND_NAME = "Dual Music";

export type ReceiptProvider = "stripe" | "cinetpay" | "moneroo";

export interface ReceiptData {
  provider: ReceiptProvider;
  transactionId: string;
  amount: number;
  currency: string;
  credits?: number;
  fee?: number;
  status: "success" | "pending";
  date: Date;
  customerName?: string;
  customerEmail?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: ReceiptData | null;
}

const providerLabelKey: Record<ReceiptProvider, string> = {
  stripe: "receiptProviderStripe",
  cinetpay: "receiptProviderCinetpay",
  moneroo: "receiptProviderMoneroo",
};

// Sanitize: jsPDF's default Helvetica can't render narrow/non-breaking spaces
// (U+202F, U+00A0) that Intl.NumberFormat inserts in fr-FR — they appear as
// odd gaps/slashes. Replace with a regular space and normalize.
const sanitizePdfText = (s: string) =>
  s.replace(/[\u00A0\u202F\u2009]/g, " ").replace(/\s+/g, " ").trim();

const formatMoney = (amount: number, currency: string, locale?: string) => {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

export const RechargeReceipt = ({ open, onClose, data: rawData }: Props) => {
  const { t, language } = useLanguage();
  const dateLocale = language === "fr" ? frLocale : enUS;
  const [downloading, setDownloading] = useState(false);

  // Enrich the redirect-param receipt with the authoritative DB row (amount /
  // currency / credits / status / date) when available, scoped to the caller.
  // CinetPay/Moneroo only — Stripe has no by-merchant lookup here. Falls back to
  // the redirect params when the lookup returns nothing.
  const merchantId = rawData?.transactionId ?? "";
  const canLookup = !!rawData && (rawData.provider === "cinetpay" || rawData.provider === "moneroo");
  const { data: dbTx } = useQuery({
    queryKey: ["payment-tx-by-merchant", merchantId],
    queryFn: () => payments.transactionByMerchant(merchantId),
    enabled: open && canLookup && !!merchantId,
    retry: false,
    staleTime: 60_000,
  });

  if (!rawData) return null;

  const data: ReceiptData = dbTx
    ? {
        ...rawData,
        amount: typeof dbTx.amount === "number" ? dbTx.amount : rawData.amount,
        currency: (dbTx.currency || rawData.currency).toUpperCase(),
        credits: typeof dbTx.credits === "number" ? dbTx.credits : rawData.credits,
        status: dbTx.status === "success" ? "success" : "pending",
        date: dbTx.created_at ? new Date(dbTx.created_at) : rawData.date,
      }
    : rawData;

  const numberLocale = language === "fr" ? "fr-FR" : "en-US";
  const dateStr = format(data.date, "PPPp", { locale: dateLocale });

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const W = doc.internal.pageSize.getWidth();

      // Header band
      doc.setFillColor(124, 58, 237); // primary purple
      doc.rect(0, 0, W, 110, "F");

      // Brand text (left)
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      doc.text(BRAND_NAME, 40, 55);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(sanitizePdfText(t("receiptCompanyTagline")), 40, 78);

      // Logo (top-right, inside a clean white rounded frame)
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = duelLogo;
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej();
        });
        const boxSize = 72;
        const boxX = W - 40 - boxSize;
        const boxY = (110 - boxSize) / 2;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(boxX, boxY, boxSize, boxSize, 12, 12, "F");
        // Fit image inside box with padding, preserve aspect ratio
        const pad = 8;
        const inner = boxSize - pad * 2;
        const ratio = (img.naturalWidth || 1) / (img.naturalHeight || 1);
        let iw = inner, ih = inner;
        if (ratio > 1) ih = inner / ratio; else iw = inner * ratio;
        const ix = boxX + (boxSize - iw) / 2;
        const iy = boxY + (boxSize - ih) / 2;
        doc.addImage(img, "PNG", ix, iy, iw, ih);
      } catch {
        /* ignore logo failure */
      }

      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(sanitizePdfText(t("receiptTitle")), 40, 145);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(110, 110, 110);
      doc.text(sanitizePdfText(t("receiptSubtitle")), 40, 165);

      // Status pill
      const statusText = sanitizePdfText(
        data.status === "success" ? t("receiptStatusSuccess") : t("receiptStatusPending")
      );
      if (data.status === "success") doc.setFillColor(34, 197, 94);
      else doc.setFillColor(234, 179, 8);
      doc.roundedRect(40, 180, 180, 22, 6, 6, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(statusText, 50, 195);

      // Details
      let y = 235;
      const row = (label: string, value: string, accent = false) => {
        doc.setTextColor(120, 120, 120);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text(sanitizePdfText(label), 40, y);
        doc.setTextColor(20, 20, 20);
        doc.setFont("helvetica", accent ? "bold" : "normal");
        doc.setFontSize(accent ? 13 : 11);
        doc.text(sanitizePdfText(value), W - 40, y, { align: "right" });
        y += 26;
        doc.setDrawColor(230, 230, 230);
        doc.line(40, y - 14, W - 40, y - 14);
      };

      row(t("receiptTransactionId"), data.transactionId);
      row(t("receiptProvider"), t(providerLabelKey[data.provider]));
      row(t("receiptDate"), dateStr);
      if (data.customerName) row(t("receiptCustomer"), data.customerName);
      if (data.customerEmail) row(t("receiptEmail"), data.customerEmail);
      if (typeof data.fee === "number" && data.fee > 0) {
        row(t("receiptFee"), formatMoney(data.fee, data.currency, numberLocale));
      }
      row(t("receiptAmountPaid"), formatMoney(data.amount, data.currency, numberLocale), true);
      if (typeof data.credits === "number") {
        const suffix = data.credits > 1 ? t("creditsSuffix") : t("creditSuffix");
        row(
          t("receiptCreditsAdded"),
          `${data.credits.toLocaleString(numberLocale)} ${suffix}`,
          true
        );
      }

      // Footer
      doc.setFontSize(9);
      doc.setTextColor(140, 140, 140);
      doc.text(sanitizePdfText(t("receiptFooterNote")), 40, 800);
      doc.text(`#${data.transactionId}`, W - 40, 800, { align: "right" });

      doc.save(`receipt-${data.transactionId}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary to-purple-600 p-6 text-primary-foreground">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="text-xl font-bold leading-tight truncate">{BRAND_NAME}</p>
              <p className="text-xs opacity-90">{t("receiptCompanyTagline")}</p>
            </div>
            <div className="shrink-0 bg-white/95 rounded-xl p-1.5 shadow-md ring-1 ring-white/40">
              <img
                src={duelLogo}
                alt={BRAND_NAME}
                className="h-12 w-12 object-contain"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {data.status === "success" ? (
              <CheckCircle2 className="w-10 h-10" />
            ) : (
              <Clock className="w-10 h-10" />
            )}
            <div>
              <DialogTitle className="text-xl text-primary-foreground">{t("receiptTitle")}</DialogTitle>
              <p className="text-sm opacity-90">{t("receiptSubtitle")}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-3">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
              data.status === "success" ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500"
            }`}
          >
            {data.status === "success" ? t("receiptStatusSuccess") : t("receiptStatusPending")}
          </div>

          <div className="divide-y border rounded-lg">
            <Row label={t("receiptTransactionId")} value={data.transactionId} mono />
            <Row label={t("receiptProvider")} value={t(providerLabelKey[data.provider])} />
            <Row label={t("receiptDate")} value={dateStr} />
            {data.customerName && <Row label={t("receiptCustomer")} value={data.customerName} />}
            {data.customerEmail && <Row label={t("receiptEmail")} value={data.customerEmail} />}
            {typeof data.fee === "number" && data.fee > 0 && (
              <Row label={t("receiptFee")} value={formatMoney(data.fee, data.currency, numberLocale)} />
            )}
            <Row label={t("receiptAmountPaid")} value={formatMoney(data.amount, data.currency, numberLocale)} accent />
            {typeof data.credits === "number" && (
              <Row
                label={t("receiptCreditsAdded")}
                value={`${data.credits.toLocaleString(numberLocale)} ${data.credits > 1 ? t("creditsSuffix") : t("creditSuffix")}`}
                accent
              />
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              <X className="w-4 h-4 mr-1" /> {t("receiptClose")}
            </Button>
            <Button className="flex-1" onClick={downloadPdf} disabled={downloading}>
              <Download className="w-4 h-4 mr-1" /> {t("receiptDownloadPdf")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center pt-1">{t("receiptFooterNote")}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Row = ({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent?: boolean;
  mono?: boolean;
}) => (
  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span
      className={`${accent ? "font-bold text-base" : "font-medium"} ${mono ? "font-mono text-xs" : ""} text-right max-w-[60%] truncate`}
      title={value}
    >
      {value}
    </span>
  </div>
);

/**
 * Helper: load receipt data from query params after a provider redirect.
 *
 * The provider return flow carries `amount`, `credits` and `currency` on the URL,
 * and the webhook credits the wallet server-side. `customer` (name/email) is
 * supplied by the caller from the auth context.
 *
 * This builds the initial receipt from the redirect params; the
 * {@link RechargeReceipt} component then enriches it with the authoritative DB
 * row (ownership-scoped `GET /payments/transaction?merchantId=`) for
 * CinetPay/Moneroo when available, falling back to these params otherwise.
 */
export function loadReceiptFromParams(
  params: URLSearchParams,
  customer?: { name?: string | null; email?: string | null },
): ReceiptData | null {
  const provider = (params.get("provider") || "").toLowerCase() as ReceiptProvider;
  const mid = params.get("mid") || params.get("sid") || "";
  if (!provider || !mid) return null;

  const customerName = customer?.name || undefined;
  const customerEmail = customer?.email || undefined;

  const amount = Number(params.get("amount") || "0");
  const credits = Number(params.get("credits") || "0");
  const defaultCurrency = provider === "stripe" ? "EUR" : "XOF";
  const currency = (params.get("currency") || defaultCurrency).toUpperCase();

  if (provider === "cinetpay" || provider === "moneroo" || provider === "stripe") {
    return {
      provider,
      transactionId: mid,
      amount,
      currency,
      credits: credits || undefined,
      status: "success",
      date: new Date(),
      customerName,
      customerEmail,
    };
  }

  return null;
}

export default RechargeReceipt;
