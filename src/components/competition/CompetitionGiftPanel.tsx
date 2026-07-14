/**
 * Compétition: CompetitionGiftPanel — envoi de cadeaux virtuels.
 *
 * Aligné sur la maquette « Cadeaux Virtuels » : deux sélecteurs
 * (vos cadeaux + destinataire) puis un grand bouton CTA. Le
 * destinataire peut être n'importe quel candidat approuvé ainsi
 * que le manager de la compétition.
 *
 * EN — Virtual gifts panel matching the design mockup. Includes a
 * gift Select, a recipient Select (candidates + manager), and a
 * gradient "Send gift" CTA. Atomic via the `send_competition_gift`
 * RPC; broadcasts a `gift_animation` event to all viewers.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { getDisplayProfiles } from "@/api/endpoints/users";
import * as gifts from "@/api/endpoints/gifts";
import * as competitions from "@/api/endpoints/competitions";
import { useAuth } from "@/contexts/AuthContext";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";
import { Gift, ShoppingBag } from "lucide-react";
import { GiftShopDialog } from "@/components/shop/GiftShopDialog";

interface Props {
  candidates: any[];
  profiles: Record<string, any>;
  /** ID de la compétition utilisée pour la diffusion broadcast des animations. */
  competitionId?: string;
  /** Manager de la compétition (pour offrir des cadeaux au manager en présentiel). */
  managerId?: string | null;
  managerName?: string | null;
}

interface InventoryItem {
  quantity: number;
  gift_id: string;
  virtual_gifts: { id: string; name: string; emoji: string; price: number; image_url: string | null };
}

export const CompetitionGiftPanel = ({ candidates, profiles, competitionId, managerId, managerName }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedCandidate, setSelectedCandidate] = useState<string>("");
  const [selectedGiftId, setSelectedGiftId] = useState<string>("");
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sending, setSending] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  // Gift-animation broadcast (Socket.IO) — same channel the live page listens on.
  const { broadcast: broadcastGiftAnim } = useRoomBroadcast(
    competitionId ? `room_comp-${competitionId}` : null,
  );


  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const inv = (await gifts.myInventory()) as any[];
        // Endpoint returns flat rows { gift_id, quantity, name, price, image_url };
        // reshape into the nested `virtual_gifts` form this panel renders.
        setInventory(
          (inv || []).map((r) => ({
            quantity: r.quantity,
            gift_id: r.gift_id,
            virtual_gifts: {
              id: r.gift_id,
              name: r.name,
              emoji: r.emoji ?? "🎁",
              price: r.price,
              image_url: r.image_url ?? null,
            },
          })),
        );
      } catch {
        setInventory([]);
      }
    })();
  }, [user]);

  const send = async () => {
    if (!selectedCandidate) { toast({ title: t("compChooseCandidate"), variant: "destructive" }); return; }
    if (!selectedGiftId) { toast({ title: t("compChooseRecipient") || "Choisir un cadeau", variant: "destructive" }); return; }

    // Manager isn't a candidate row: send_competition_gift expects a candidate_id.
    // We only support sending to manager when present as ":manager" placeholder; for now skip server send and only broadcast.
    const isManagerTarget = selectedCandidate === "__manager__";
    const gift = inventory.find((g) => g.gift_id === selectedGiftId);
    if (!gift) return;

    setSending(true);
    try {
      // Candidate gift feeds the ranking tally; manager gift (recipientUserId) is
      // an in-person tip distributed to the manager via the revenue engine.
      const payload = isManagerTarget
        ? { recipientUserId: managerId!, giftId: selectedGiftId, credits: Number(gift.virtual_gifts?.price) || 0 }
        : { candidateId: selectedCandidate, giftId: selectedGiftId, credits: Number(gift.virtual_gifts?.price) || 0 };
      await competitions.sendGift(competitionId!, payload, crypto.randomUUID());
    } catch (e) {
      setSending(false);
      toast({ title: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
      return;
    }
    setSending(false);

    toast({ title: t("compGiftSent") });

    setInventory((prev) =>
      prev
        .map((it) => (it.gift_id === selectedGiftId ? { ...it, quantity: Math.max(0, (it.quantity || 1) - 1) } : it))
        .filter((it) => it.quantity > 0),
    );

    // Broadcast gift animation so all viewers see it
    if (competitionId) {
      try {
        const senderId = user?.id;
        let senderName = t("userDefault") || "Fan";
        if (senderId) {
          const profs = await getDisplayProfiles([senderId]);
          senderName = (profs as any[])?.[0]?.full_name || senderName;
        }
        let recipientName: string;
        if (isManagerTarget) {
          recipientName = managerName || (t("recipientLabel") || "Manager");
        } else {
          const candidate = candidates.find((c) => c.id === selectedCandidate);
          const recipientId = candidate?.artist_id;
          recipientName = recipientId
            ? profiles[recipientId]?.full_name || (t("recipientLabel") || "Artiste")
            : (t("recipientLabel") || "Artiste");
        }

        broadcastGiftAnim("gift_animation", {
          event_id: crypto.randomUUID(),
          gift_id: selectedGiftId,
          gift_name: gift.virtual_gifts?.name,
          gift_image: gift.virtual_gifts?.image_url || gift.virtual_gifts?.emoji || "🎁",
          price: Number(gift.virtual_gifts?.price) || 0,
          user_id: senderId,
          user_name: senderName,
          recipient_name: recipientName,
        });
      } catch (err) {
        console.warn("[CompetitionGiftPanel] broadcast failed:", err);
      }
    }
  };

  const selectedGift = inventory.find((g) => g.gift_id === selectedGiftId);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <p className="text-base font-bold flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary" /> {t("compVirtualGifts") || "Cadeaux Virtuels"}
        </p>

        {/* Vos cadeaux */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{t("compMyGifts") || "Vos cadeaux"}</label>
          <Select value={selectedGiftId} onValueChange={setSelectedGiftId}>
            <SelectTrigger>
              <SelectValue placeholder={t("compSelectRecipient") || "Sélectionner..."} />
            </SelectTrigger>
            <SelectContent>
              {inventory.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {t("noGiftsInInventory") || "Aucun cadeau dans votre inventaire"}
                </div>
              ) : inventory.map((g) => (
                <SelectItem key={g.gift_id} value={g.gift_id}>
                  <span className="inline-flex items-center gap-2">
                    <span className="text-base">{g.virtual_gifts?.emoji}</span>
                    <span>{g.virtual_gifts?.name}</span>
                    <span className="text-muted-foreground">×{g.quantity}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Destinataire */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{t("compChooseRecipient") || "Destinataire"}</label>
          <Select value={selectedCandidate} onValueChange={setSelectedCandidate}>
            <SelectTrigger className="ring-1 ring-primary/40">
              <SelectValue placeholder={t("compSelectRecipient") || "Sélectionner..."} />
            </SelectTrigger>
            <SelectContent>
              {managerId && (
                <SelectItem value="__manager__">
                  👑 {managerName || (t("manager") || "Manager")}
                </SelectItem>
              )}
              {candidates.map((c) => {
                const p = profiles[c.artist_id];
                return (
                  <SelectItem key={c.id} value={c.id}>
                    🎤 {p?.full_name || c.artist_id.slice(0, 8)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={send}
          disabled={sending || !selectedCandidate || !selectedGiftId}
          className="w-full h-12 font-bold text-white bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 hover:opacity-90 border-0 shadow-md"
        >
          {t("compSendGiftCta") || "Envoyer le cadeau 🎁"}
        </Button>

        <Button
          variant="outline"
          onClick={() => setShopOpen(true)}
          className="w-full gap-2"
        >
          <ShoppingBag className="w-4 h-4" /> {t("giftShop") || "Boutique"}
        </Button>

        <GiftShopDialog open={shopOpen} onOpenChange={setShopOpen} />
      </CardContent>
    </Card>
  );
};

export default CompetitionGiftPanel;
