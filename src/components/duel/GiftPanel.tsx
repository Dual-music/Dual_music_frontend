/**
 * Panneau cadeaux duel ciblé par artiste : RPC `send_gift_duel`, animation et broadcast top-donor.
 */
/**
 * GiftPanel (Duel)
 * ----------------
 * Panneau d'envoi de cadeaux virtuels pendant un duel. Charge le catalogue
 * depuis `gifts` (filtré par disponibilité admin) et appelle le RPC
 * `send_duel_gift` qui débite le wallet, crédite l'artiste cible (part %),
 * journalise la transaction et diffuse l'animation à tous les spectateurs
 * via un canal Realtime broadcast.
 *
 * Tier d'animation déterminé par `gifts.price_tier` (low/mid/high/legendary)
 * — gère l'intensité visuelle dans GiftAnimationWithSound.
 *
 * @prop duelId    - id du duel
 * @prop artist1   - artiste cible possible (gauche)
 * @prop artist2   - artiste cible possible (droite)
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { getDisplayProfiles } from "@/api/endpoints/users";
import * as wallet from "@/api/endpoints/wallet";
import * as giftsApi from "@/api/endpoints/gifts";
import { ApiError } from "@/api/http";
import { purchaseErrorKey, purchaseErrorTitleKey } from "@/lib/purchaseErrors";
import { GiftShopDialog } from "@/components/shop/GiftShopDialog";
import { ShoppingBag } from "lucide-react";
interface GiftPanelProps {
  duelId: string;
  roomId: string;
  artist1Id: string;
  artist2Id: string;
  onGiftAnimationBroadcast?: (payload: Record<string, unknown>) => Promise<void>;
  managerId?: string;
  artist1Name?: string;
  artist2Name?: string;
  managerName?: string;
}

const GiftPanel = ({
  duelId,
  artist1Id,
  artist2Id,
  onGiftAnimationBroadcast,
  managerId,
  artist1Name = "Artiste 1",
  artist2Name = "Artiste 2",
  managerName = "Manager",
}: GiftPanelProps) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [gifts, setGifts] = useState<any[]>([]);
  const [selectedGift, setSelectedGift] = useState<string>("");
  const [recipient, setRecipient] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [recentGifts, setRecentGifts] = useState<any[]>([]);
  const [shopOpen, setShopOpen] = useState(false);

  useEffect(() => {
    const fetchUserGifts = async () => {
      try {
        if (user) {
          const inventory = (await giftsApi.myInventory()) as any[];
          setGifts(
            inventory.map((ug: any) => ({
              id: ug.gift_id,
              name: ug.name,
              image_url: ug.image_url,
              price: ug.price,
              quantity: ug.quantity,
            })),
          );
        } else {
          const catalog = (await giftsApi.listGifts()) as any[];
          setGifts(catalog.map((gift: any) => ({ ...gift, quantity: 0 })));
        }
      } catch {
        setGifts([]);
      }
    };

    fetchUserGifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelId, user]);

  const handleSendGift = async () => {
    if (!selectedGift || !recipient) {
      toast({
        title: t("incompleteSelection"),
        description: t("chooseGiftAndRecipient"),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      if (!user) {
        toast({
          title: t("loginRequired"),
          description: t("mustBeLoggedToGift"),
          variant: "destructive",
        });
        return;
      }

      try {
        await wallet.sendGift(
          { giftId: selectedGift, toUserId: recipient, duelId },
          crypto.randomUUID(),
        );
      } catch (e) {
        const code = e instanceof ApiError ? e.code : undefined;
        toast({
          title: t(purchaseErrorTitleKey(code)),
          description: t(purchaseErrorKey(code)),
          variant: "destructive",
        });
        return;
      }

      const selectedGiftData = gifts.find((gift) => gift.id === selectedGift);
      const recipientName =
        recipient === artist1Id
          ? artist1Name
          : recipient === artist2Id
            ? artist2Name
            : recipient === managerId
              ? managerName
              : t("recipientLabel");

      const senderProfiles = await getDisplayProfiles([user.id]);

      const senderProfile = (senderProfiles as any[])?.[0];
      const senderName = senderProfile?.full_name || t("userDefault");
      const senderAvatar = senderProfile?.avatar_url || null;
      const animationType = Number(selectedGiftData?.price) >= 5 ? "premium" : "standard";
      const eventId = crypto.randomUUID();

      const payload = {
        eventId,
        event_id: eventId,
        gift_id: selectedGift,
        user_name: senderName,
        user_avatar: senderAvatar,
        animation_type: animationType,
        giftId: selectedGift,
        giftName: selectedGiftData?.name || "Cadeau",
        giftImage: selectedGiftData?.image_url || "🎁",
        user_id: user.id,
        to_user_id: recipient,
        price: Number(selectedGiftData?.price) || 0,
        senderName,
        recipientName,
      };

      if (!onGiftAnimationBroadcast) {
        throw new Error("gift_channel_unavailable");
      }

      await onGiftAnimationBroadcast(payload);

      // Optimistic local decrement so the UI reflects new quantity without reload
      setGifts((prev) =>
        prev
          .map((g: any) => (g.id === selectedGift ? { ...g, quantity: Math.max(0, (g.quantity || 0) - 1) } : g))
          .filter((g: any) => (g.quantity || 0) > 0)
      );

      setRecentGifts((prev) => [{ gift_id: selectedGift, to_user_id: recipient }, ...prev.slice(0, 9)]);

      setSelectedGift("");
      setRecipient("");
    } catch (err) {
      console.error("[GiftPanel] send gift error:", err);
      toast({
        title: t("errorTitle"),
        description: t("cannotSendGift"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-xl">{t("virtualGiftsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">
            {t("yourGifts")}
          </label>
          {gifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noGiftsOwned")}</p>
          ) : (
            <Select value={selectedGift} onValueChange={setSelectedGift}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectGift")} />
              </SelectTrigger>
              <SelectContent>
                {gifts.map((gift: any) => (
                  <SelectItem key={gift.id} value={gift.id}>
                    {gift.image_url} {gift.name} ({gift.quantity || 0} {t("availableShort")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-2 block">
            {t("recipientLabel")}
          </label>
          <Select value={recipient} onValueChange={setRecipient}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectGift")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={artist1Id}>{artist1Name}</SelectItem>
              <SelectItem value={artist2Id}>{artist2Name}</SelectItem>
              {managerId && <SelectItem value={managerId}>{managerName}</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleSendGift}
          disabled={loading}
          className="w-full bg-gradient-primary hover:shadow-glow"
        >
          {t("sendTheGift")}
        </Button>

        <Button
          variant="outline"
          onClick={() => setShopOpen(true)}
          className="w-full gap-2"
        >
          <ShoppingBag className="w-4 h-4" /> {t("giftShop")}
        </Button>

        <GiftShopDialog open={shopOpen} onOpenChange={setShopOpen} />

        {recentGifts.length > 0 && (
          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground mb-2">{t("recentGifts")}</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {recentGifts.map((gift, idx) => {
                const giftData = gifts.find((g) => g.id === gift.gift_id);
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded animate-in fade-in slide-in-from-bottom-2"
                  >
                    <span className="text-2xl">{giftData?.image_url}</span>
                    <span className="text-muted-foreground">{giftData?.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GiftPanel;