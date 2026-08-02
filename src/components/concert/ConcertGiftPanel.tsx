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
import { useRoomEvent } from "@/realtime/useRoom";
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
  /** Type de room côté serveur pour écouter l'event `gift` : "concert" (défaut) ou "live". */
  roomType?: "live" | "concert";
}

const ConcertGiftPanel = ({
  concertId,
  artistId,
  artistName = "Artiste",
  roomType = "concert",
}: ConcertGiftPanelProps) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  // Dédup cross-canal (peer web ↔ event serveur `gift`) par signature `expéditeur:prix`.
  const giftSigRef = useRef<Map<string, number>>(new Map());
  const claimGiftSig = (sig: string): boolean => {
    const now = Date.now();
    const map = giftSigRef.current;
    for (const [k, ts] of map) if (now - ts > 5000) map.delete(k);
    if (map.has(sig)) return false;
    map.set(sig, now);
    return true;
  };
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
        // L'endpoint /gifts/inventory renvoie des lignes PLATES { gift_id, name, price, image_url, quantity }
        // (pas de `id` ni de `virtual_gifts`). Sans normaliser `id: gift_id`, les <SelectItem value={undefined}>
        // rendent la sélection impossible → l'envoi échoue avec « sélectionnez un cadeau ».
        setGifts(
          (inv || []).map((ug) => {
            const g = ug.virtual_gifts ?? ug;
            return { ...g, id: g.id ?? ug.gift_id, quantity: ug.quantity ?? 0 };
          }),
        );
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
      // Réserve la signature partagée : bloque l'event serveur `gift` correspondant.
      if (!claimGiftSig(`${p.from_user_id ?? ""}:${Math.round(Number(p.price) || 0)}`)) return;
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

  // Bridge mobile → web : le backend émet l'event serveur `gift` pour tout cadeau (dont ceux
  // envoyés depuis le MOBILE, qui ne diffuse pas sur le canal peer). On l'écoute ici, en
  // ignorant ses propres envois et en dédupliquant via la signature partagée.
  useRoomEvent<{ to_user_id?: string; from_user_id?: string; value?: number }>(
    "/live",
    roomType,
    concertId || null,
    "gift",
    async (p) => {
      const from = p?.from_user_id ?? "";
      if (!from || from === currentUserId) return;
      const price = Math.round(Number(p?.value) || 0);
      if (!claimGiftSig(`${from}:${price}`)) return;
      let senderName = t("userDefault");
      try {
        const sp = await getDisplayProfiles([from]);
        senderName = (sp as any[])?.[0]?.full_name || senderName;
      } catch {
        /* fallback sur le libellé générique */
      }
      showAnimationSafe({
        eventId: crypto.randomUUID(),
        giftName: "Cadeau",
        giftImage: "🎁",
        senderName,
        recipientName: artistName,
        price,
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
          // Permet aux pairs de déduplier contre l'event serveur `gift` (même expéditeur:prix).
          from_user_id: user.id,
        };

        // Mark as seen to prevent duplicate from self-broadcast
        seenEventIdsRef.current.add(animPayload.eventId);
        setTimeout(() => seenEventIdsRef.current.delete(animPayload.eventId), 10000);
        // Réserve la signature (bloque l'event serveur renvoyé à l'expéditeur).
        claimGiftSig(`${user.id}:${Math.round(animPayload.price)}`);

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
