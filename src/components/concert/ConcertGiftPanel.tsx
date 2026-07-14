/**
 * Panneau cadeaux concert : envoi via `send_gift_concert` RPC (atomique), broadcast Realtime + animations (`GiftAnimationWithSound`).
 */
import { useEffect, useRef, useState } from "react";
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
import * as giftsApi from "@/api/endpoints/gifts";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";
import { getDisplayProfiles } from "@/api/endpoints/users";
import { sendGift } from "@/api/endpoints/wallet";
import { ApiError } from "@/api/http";
import { useAuth } from "@/contexts/AuthContext";
import { GiftAnimationWithSound } from "@/components/animations/GiftAnimationWithSound";
import { StandardGiftNotification } from "@/components/animations/StandardGiftNotification";
import { purchaseErrorKey, purchaseErrorTitleKey } from "@/lib/purchaseErrors";
import { GiftShopDialog } from "@/components/shop/GiftShopDialog";
import { ShoppingBag } from "lucide-react";

interface ConcertGiftPanelProps {
  concertId: string;
  artistId?: string;
  artistName?: string;
}

const ConcertGiftPanel = ({
  concertId,
  artistId,
  artistName = "Artiste",
}: ConcertGiftPanelProps) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [gifts, setGifts] = useState<any[]>([]);
  const [selectedGift, setSelectedGift] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [animationData, setAnimationData] = useState<{
    eventId: string;
    giftName: string;
    giftImage: string;
    senderName: string;
    recipientName: string;
    price: number;
  } | null>(null);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shopOpen, setShopOpen] = useState(false);

  // Failsafe: force-hide animation after max duration
  const showAnimationSafe = (data: typeof animationData) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setAnimationData(data);
    setShowAnimation(true);
    const maxDuration = (data && data.price >= 10)
      ? (data.price >= 50 ? 6500 : 5500)
      : 3500;
    hideTimerRef.current = setTimeout(() => {
      setShowAnimation(false);
      hideTimerRef.current = null;
    }, maxDuration);
  };

  useEffect(() => {
    const fetchUserGifts = async () => {
      if (user) {
        const inv = (await giftsApi.myInventory()) as Array<Record<string, any>>;
        setGifts((inv || []).map((ug) => ({ ...(ug.virtual_gifts ?? ug), quantity: ug.quantity ?? 0 })));
      } else {
        const list = await giftsApi.listGifts();
        setGifts((list || []).map((g) => ({ ...g, quantity: 0 })));
      }
    };

    fetchUserGifts();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [concertId, artistId, artistName, user]);

  // Gift-animation broadcast (Socket.IO), same channel/event/payload as before.
  const { broadcast: broadcastGiftAnim } = useRoomBroadcast(
    concertId ? `gift-anim-${concertId}` : null,
    (event, payload) => {
      if (event !== "gift_animation") return;
      const p = payload as Record<string, any>;
      const eid = p.eventId;
      if (eid && seenEventIdsRef.current.has(eid)) return;
      if (eid) {
        seenEventIdsRef.current.add(eid);
        setTimeout(() => seenEventIdsRef.current.delete(eid), 10000);
      }
      showAnimationSafe({
        eventId: eid || crypto.randomUUID(),
        giftName: p.giftName,
        giftImage: p.giftImage,
        senderName: p.senderName,
        recipientName: p.recipientName,
        price: Number(p.price) || 0,
      });
    },
  );

  const handleSendGift = async () => {
    if (!selectedGift || !artistId) {
      toast({
        title: t("incompleteSelection"),
        description: t("chooseAGift"),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    if (!user) {
      toast({
        title: t("loginRequired"),
        description: t("mustBeLoggedToGift"),
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    let sendOk = true;
    let sendErrCode: string | undefined;
    try {
      await sendGift(
        { giftId: selectedGift, toUserId: artistId, concertId },
        crypto.randomUUID(),
      );
    } catch (e) {
      sendOk = false;
      sendErrCode = e instanceof ApiError ? e.code : undefined;
    }

    if (!sendOk) {
      toast({
        title: t(purchaseErrorTitleKey(sendErrCode)),
        description: t(purchaseErrorKey(sendErrCode)),
        variant: "destructive",
      });
    } else {
      const giftData = gifts.find(g => g.id === selectedGift);
      
      if (giftData) {
        const profiles = await getDisplayProfiles([user.id]);
        const profile = (profiles as any[])?.[0];
        
        const animPayload = {
          giftName: giftData.name,
          giftImage: giftData.image_url || "🎁",
          senderName: profile?.full_name || t("userDefault"),
          recipientName: artistName,
          price: Number(giftData.price) || 0,
          eventId: crypto.randomUUID(),
        };

        // Mark as seen to prevent duplicate from self-broadcast
        seenEventIdsRef.current.add(animPayload.eventId);
        setTimeout(() => seenEventIdsRef.current.delete(animPayload.eventId), 10000);

        // Sender sees animation immediately
        showAnimationSafe({ ...animPayload });

        // Broadcast to other viewers via Socket.IO.
        broadcastGiftAnim("gift_animation", animPayload);
      }

      // Optimistic local decrement to avoid full page reload
      setGifts((prev) =>
        prev
          .map((g: any) => (g.id === selectedGift ? { ...g, quantity: Math.max(0, (g.quantity || 0) - 1) } : g))
          .filter((g: any) => (g.quantity || 0) > 0)
      );

      setSelectedGift("");
    }

    setLoading(false);
  };

  return (
    <>
      {showAnimation && animationData && (
        animationData.price < 10 ? (
          <StandardGiftNotification
            key={animationData.eventId}
            giftName={animationData.giftName}
            giftImage={animationData.giftImage}
            senderName={animationData.senderName}
            recipientName={animationData.recipientName}
            onComplete={() => {
              if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
              setShowAnimation(false);
            }}
          />
        ) : (
          <GiftAnimationWithSound
            key={animationData.eventId}
            giftName={animationData.giftName}
            giftImage={animationData.giftImage}
            senderName={animationData.senderName}
            recipientName={animationData.recipientName}
            enableSound={animationData.price >= 50}
            onComplete={() => {
              if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
              setShowAnimation(false);
            }}
          />
        )
      )}
      
      <Card className="bg-card border-border">
        <CardHeader className="py-3">
          <CardTitle className="text-lg">{t("sendGift")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {gifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noGiftsOwned")}
            </p>
          ) : (
            <Select value={selectedGift} onValueChange={setSelectedGift}>
              <SelectTrigger>
                <SelectValue placeholder={t("chooseGift")} />
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

          <Button
            onClick={handleSendGift}
            disabled={loading || gifts.length === 0}
            className="w-full bg-gradient-primary hover:shadow-glow"
          >
            {t("sendTo")} {artistName} 🎁
          </Button>

          <Button
            variant="outline"
            onClick={() => setShopOpen(true)}
            className="w-full gap-2"
          >
            <ShoppingBag className="w-4 h-4" /> {t("giftShop")}
          </Button>

          <GiftShopDialog open={shopOpen} onOpenChange={setShopOpen} />
        </CardContent>
      </Card>
    </>
  );
};

export default ConcertGiftPanel;
