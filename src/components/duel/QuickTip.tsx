/**
 * Pourboire rapide (presets de crédits) pour artiste — variante condensée du GiftPanel.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import * as wallet from "@/api/endpoints/wallet";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Coins } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface QuickTipProps {
  duelId?: string;
  recipientIds: { id: string; name: string }[];
}

const TIP_AMOUNTS = [
  { value: 1, label: "$1", emoji: "💰" },
  { value: 5, label: "$5", emoji: "💎" },
  { value: 10, label: "$10", emoji: "👑" },
];

export const QuickTip = ({ duelId, recipientIds }: QuickTipProps) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);
  const [sentTip, setSentTip] = useState<{ amount: number; recipient: string } | null>(null);

  const handleTip = async (amount: number, recipientId: string) => {
    setSending(true);

    if (!user) {
      toast({ title: t("loginRequired"), description: t("tipLoginDesc"), variant: "destructive" });
      setSending(false);
      return;
    }

    let success = false;
    let error: unknown = null;
    try {
      const res = await wallet.vote(
        { duelId: (duelId ?? null) as unknown as string, artistId: recipientId, amount },
        crypto.randomUUID(),
      );
      success = !!res?.success;
    } catch (e) {
      error = e;
    }

    if (error || !success) {
      const { purchaseErrorKey, purchaseErrorTitleKey } = await import("@/lib/purchaseErrors");
      const code = error ? null : "insufficient_balance";
      toast({
        title: t(purchaseErrorTitleKey(code)),
        description: error ? t("cannotSendTip") : t(purchaseErrorKey(code)),
        variant: "destructive",
      });
    } else {
      const recipientName = recipientIds.find(r => r.id === recipientId)?.name || t("artistDefault");
      setSentTip({ amount, recipient: recipientName });
      setTimeout(() => setSentTip(null), 2000);
      toast({ title: `${t("tipSent")} $${amount}`, description: `${t("sentTo")} ${recipientName}` });
    }

    setSending(false);
    setSelectedRecipient(null);
  };

  return (
    <div className="relative">
      <AnimatePresence>
        {sentTip && (
          <motion.div
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: -30 }}
            exit={{ opacity: 0, y: -60 }}
            className="absolute -top-8 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap"
          >
            <span className="text-sm font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">
              💸 ${sentTip.amount} → {sentTip.recipient}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedRecipient ? (
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
          <span className="text-xs text-muted-foreground px-1 truncate max-w-[60px]">
            {recipientIds.find(r => r.id === selectedRecipient)?.name?.split(" ")[0]}
          </span>
          {TIP_AMOUNTS.map((tip) => (
            <Button
              key={tip.value}
              size="sm"
              variant="ghost"
              disabled={sending}
              onClick={() => handleTip(tip.value, selectedRecipient)}
              className="h-7 px-2 text-xs hover:bg-primary/20"
            >
              {tip.emoji} {tip.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedRecipient(null)}
            className="h-7 px-1 text-xs"
          >
            ✕
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Coins className="w-4 h-4 text-primary shrink-0" />
          {recipientIds.map((r) => (
            <Button
              key={r.id}
              size="sm"
              variant="outline"
              onClick={() => setSelectedRecipient(r.id)}
              className="h-7 px-2 text-xs"
            >
              Tip {r.name.split(" ")[0]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};
