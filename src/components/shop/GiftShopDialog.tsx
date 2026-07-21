/**
 * GiftShopDialog — version pop-up scrollable de la boutique de cadeaux.
 *
 * Permet aux spectateurs d'acheter des cadeaux virtuels sans quitter
 * l'évènement en direct (duel, concert, live, compétition). Réutilise
 * la RPC `purchase_gift_from_wallet` comme la page `/gift-shop`.
 *
 * EN — Reusable dialog wrapping the gift shop so viewers can buy
 * virtual gifts without leaving the live event. Scrollable content.
 */
import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogPortal, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gift, ShoppingCart, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useWallet } from "@/hooks/useWallet";
import * as gifts_api from "@/api/endpoints/gifts";
import * as wallet from "@/api/endpoints/wallet";
import { useAuth } from "@/contexts/AuthContext";

interface VirtualGift { id: string; name: string; price: number; image_url: string | null; }
interface UserGift { id: string; gift_id: string; quantity: number; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export const GiftShopDialog = ({ open, onOpenChange }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { balance } = useWallet();
  const { user } = useAuth();
  const [gifts, setGifts] = useState<VirtualGift[]>([]);
  const [userGifts, setUserGifts] = useState<UserGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const g = await gifts_api.listGifts();
      setGifts(
        (g ?? []).map((gift) => ({
          id: gift.id,
          name: gift.name,
          // Backend renvoie `price` (pas `price_credits`) — on lit les deux.
          price: Number(gift.price_credits ?? (gift as { price?: number }).price ?? 0),
          image_url: (gift.image_url as string | null) ?? null,
        })),
      );
      if (user) {
        const ug = await gifts_api.myInventory();
        setUserGifts((ug ?? []) as unknown as UserGift[]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open]);

  const owned = (id: string) => userGifts.find((u) => u.gift_id === id)?.quantity || 0;

  const buy = async (g: VirtualGift) => {
    if (balance < g.price) {
      toast({ title: t("insufficientBalance"), description: t("insufficientBalanceDesc"), variant: "destructive" });
      return;
    }
    setPurchasing(g.id);
    if (!user) { setPurchasing(null); return; }
    try {
      await wallet.purchaseGift({ giftId: g.id, quantity: 1 }, crypto.randomUUID());
      toast({ title: t("purchaseSuccess"), description: `1x ${g.name}` });
      load();
    } catch {
      toast({ title: t("errorTitle") || "Erreur", description: t("purchaseErrGeneric"), variant: "destructive" });
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[9998] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-[9999] flex h-[min(85dvh,760px)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-3xl translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden border bg-background p-0 shadow-lg sm:rounded-lg data-[state=open]:animate-in data-[state=closed]:animate-out"
        >
          <div className="shrink-0 p-4 border-b border-border flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Gift className="w-5 h-5 text-primary" />
                {t("giftShopTitle")}
              </DialogTitle>
              <DialogDescription className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{t("giftShopSubtitle")}</span>
                <span className="inline-flex items-center gap-1 font-bold text-foreground shrink-0">
                  <Wallet className="w-4 h-4 text-primary" /> {balance.toLocaleString("fr-FR")} Crédits
                </span>
              </DialogDescription>
            </div>
            <DialogPrimitive.Close className="rounded-sm opacity-70 hover:opacity-100 shrink-0">
              <X className="w-5 h-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
            {loading ? (
              <p className="text-center text-sm text-muted-foreground py-10">{t("loading")}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-2">
                {gifts.map((g) => {
                  const q = owned(g.id);
                  return (
                    <Card key={g.id} className="overflow-hidden">
                      <div className="aspect-square bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                        <span className="text-5xl">{g.image_url}</span>
                      </div>
                      <CardContent className="p-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <h3 className="text-xs font-bold truncate">{g.name}</h3>
                          {q > 0 && <Badge className="bg-green-500 text-[10px] px-1">x{q}</Badge>}
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-bold text-primary">{g.price.toLocaleString("fr-FR")} Crédits</span>
                          <Button
                            size="sm"
                            onClick={() => buy(g)}
                            disabled={purchasing === g.id || balance < g.price}
                            className="h-7 px-2 gap-1 text-xs"
                          >
                            <ShoppingCart className="w-3 h-3" />
                            {t("buyGift")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
};

export default GiftShopDialog;
