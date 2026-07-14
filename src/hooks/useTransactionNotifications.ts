/**
 * useTransactionNotifications
 * ---------------------------
 * Souscrit aux évènements Socket.IO du namespace `/notifications` pour afficher
 * des toasts temps réel sur les évènements financiers (recharge confirmée,
 * retrait validé/refusé, cadeau reçu).
 *
 * Le backend émet ces évènements par utilisateur (`emitToUser`) :
 *   - `tx:credit`     { amount, currency }  → recharge de crédits confirmée
 *   - `tx:gift`       { amount }            → cadeau reçu
 *   - `tx:withdrawal` { status, amount }    → changement de statut d'un retrait
 *
 * (Il n'existe pas d'émission `tx:ticket` — le toast d'achat de billet a donc
 * été retiré ; voir GAP report.)
 *
 * Doit être monté UNE seule fois au top-level (Profile page) pour éviter les
 * doublons. `/notifications` rejoint automatiquement la room de l'utilisateur.
 */
import { toast } from "sonner";
import { createElement } from "react";
import { Coins, Gift, Banknote } from "lucide-react";
import { useSocketEvent } from "@/realtime/useRoom";
import { useLanguage } from "@/contexts/LanguageContext";

const fmt = (n: number) =>
  `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/**
 * Subscribes to per-user transaction events over Socket.IO and surfaces a toast
 * when one fires. Covers credit purchases (top-ups), gifts received and
 * withdrawal status changes.
 */
export const useTransactionNotifications = (userId: string | null) => {
  const { t } = useLanguage();
  const enabled = !!userId;

  // Credit purchases (top-ups)
  useSocketEvent<{ amount: number; currency?: string }>(
    "/notifications",
    "tx:credit",
    (p) => {
      toast.success(t("txNotifPurchaseTitle"), {
        description: `+${fmt(p.amount)} ${t("txNotifCredits")}${p.currency ? ` (${p.currency})` : ""}`,
        icon: createElement(Coins, { className: "w-4 h-4" }),
      });
    },
    enabled,
  );

  // Gifts received
  useSocketEvent<{ amount: number }>(
    "/notifications",
    "tx:gift",
    () => {
      toast.success(t("txNotifGiftTitle"), {
        description: t("txNotifGiftDesc"),
        icon: createElement(Gift, { className: "w-4 h-4" }),
      });
    },
    enabled,
  );

  // Withdrawal request status changes (approved / rejected / completed)
  useSocketEvent<{ status: string; amount: number }>(
    "/notifications",
    "tx:withdrawal",
    (p) => {
      const isCompleted = p.status === "completed";
      const isRejected = p.status === "rejected";
      const fn = isRejected ? toast.error : toast.success;
      fn(
        isCompleted
          ? t("txNotifWithdrawalCompletedTitle")
          : isRejected
            ? t("txNotifWithdrawalRejectedTitle")
            : t("txNotifWithdrawalUpdatedTitle"),
        {
          description: `$${fmt(p.amount)} — ${p.status}`,
          icon: createElement(Banknote, { className: "w-4 h-4" }),
        },
      );
    },
    enabled,
  );
};
