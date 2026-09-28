/**
 * Dialog commande dédicace (`concert_dedications`) : message + prix en crédits, RPC atomique débit wallet.
 */
import { useEffect, useState } from "react";
import { purchaseDedication, myDedications } from "@/api/endpoints/concerts";
import { getPublicSetting } from "@/api/endpoints/settings";
import { ApiError } from "@/api/http";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Heart, Loader2, Wallet } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useNavigate } from "react-router-dom";
import { useRoomEvent } from "@/realtime/useRoom";

interface Props {
  concertId: string;
  artistName: string;
  concertType?: "artist_concert" | "artist_live";
  disabled?: boolean;
  /** Prix minimum propre à CET événement (surcharge le défaut global si fourni). */
  minPriceOverride?: number | null;
}

const DEFAULT_MIN = 10;

export const DedicationDialog = ({ concertId, artistName, concertType = "artist_concert", disabled, minPriceOverride }: Props) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { balance, isAuthenticated, refresh: refreshWallet } = useWallet();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [price, setPrice] = useState<number>(DEFAULT_MIN);
  const [min, setMin] = useState<number>(DEFAULT_MIN);
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<{ paid: number; delivered: number } | null>(null);
  const eventLabel = concertType === "artist_live" ? "live" : "concert";

  const loadExisting = async () => {
    if (!user) { setExisting(null); return; }
    try {
      const all = (await myDedications()) as any[];
      const list = all.filter((d) => d.concert_id === concertId && d.concert_type === concertType);
      setExisting({
        paid: list.filter((d) => d.status === "paid").length,
        delivered: list.filter((d) => d.status === "delivered").length,
      });
    } catch {
      setExisting(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    // La surcharge propre à l'événement (fixée par l'artiste) prime sur le défaut global —
    // sans elle, le fan pouvait voir un minimum différent de celui réellement appliqué côté serveur.
    if (minPriceOverride != null) {
      setMin(minPriceOverride);
      setPrice((p) => (p < minPriceOverride ? minPriceOverride : p));
    } else {
      getPublicSetting<any>("economic_config", null).then((cfg) => {
        const section = concertType === "artist_live" ? (cfg?.dedication_live ?? cfg?.dedication) : cfg?.dedication;
        const m = Number(section?.min_price_credits ?? DEFAULT_MIN);
        setMin(m);
        setPrice((p) => (p < m ? m : p));
      }).catch(() => {});
    }
    loadExisting();
  }, [open, concertType, minPriceOverride]);

  // Décision de l'artiste (accepté = débité MAINTENANT, rejeté = aucun débit, livré) — synchronisé
  // en direct : le solde et le statut « en attente » se mettent à jour SANS recharger la page,
  // pour ne jamais laisser croire au fan qu'il a encore un solde qu'il n'a plus.
  useRoomEvent<{ fan_id?: string; status?: string; price_credits?: number }>(
    "/live",
    concertType === "artist_live" ? "live" : "concert",
    concertId || null,
    "dedication:update",
    (p) => {
      if (!user || p?.fan_id !== user.id) return;
      if (p.status === "paid") {
        refreshWallet();
        toast({ title: "Dédicace acceptée !", description: `${p.price_credits ?? ""} crédits ont été débités de ton solde.` });
      } else if (p.status === "rejected") {
        toast({ title: "Dédicace refusée", description: "L'artiste n'a pas pu y donner suite — aucun crédit débité." });
      } else if (p.status === "delivered") {
        toast({ title: "🎉 Dédicace interprétée !", description: "L'artiste vient de la faire en direct." });
      }
      loadExisting();
    },
  );

  const submit = async () => {
    if (!isAuthenticated) {
      toast({ title: "Connexion requise", description: "Connecte-toi pour envoyer une dédicace.", variant: "destructive" });
      navigate("/auth");
      return;
    }
    if (message.trim().length < 3) {
      toast({ title: "Message trop court", description: "Écris au moins quelques mots.", variant: "destructive" });
      return;
    }
    if (price < min) {
      toast({ title: "Prix trop bas", description: `Minimum ${min} crédits.`, variant: "destructive" });
      return;
    }
    if (balance < price) {
      toast({ title: "Solde insuffisant", description: "Recharge ton portefeuille.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await purchaseDedication(
        { concertId, concertType, message: message.trim(), priceCredits: price },
        crypto.randomUUID(),
      );
    } catch (e) {
      setBusy(false);
      const code = e instanceof ApiError ? e.code : undefined;
      const desc =
        code === "insufficient_balance" ? "Solde insuffisant." :
        code === "dedications_disabled" ? `Ce ${eventLabel} n'accepte pas les dédicaces.` :
        code === "dedications_closed_live" ? "Les demandes de dédicace pour ce concert doivent être faites avant le direct." :
        code === "concert_not_found" ? "Concert introuvable." :
        code === "live_not_found" ? "Live introuvable." :
        (e instanceof Error ? e.message : "Erreur");
      toast({ title: "Échec", description: desc, variant: "destructive" });
      return;
    }
    setBusy(false);
    toast({
      title: "Dédicace envoyée !",
      description: `L'artiste sera notifié et l'interprétera pendant le ${eventLabel}.`,
    });
    setOpen(false);
    setMessage("");
    loadExisting();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full gap-2" disabled={disabled}>
          <Heart className="w-4 h-4 text-pink-500" /> Demander une dédicace
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dédicace pour {artistName}</DialogTitle>
          <DialogDescription>
            Écris un message personnalisé. Le prix est libre (minimum {min} crédits) et sera débité de ton portefeuille.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {existing && (existing.paid + existing.delivered) > 0 && (
            <div className="rounded-md border border-pink-500/40 bg-pink-500/10 p-2.5 text-xs text-foreground/90">
              Vous avez déjà <strong>{existing.paid + existing.delivered}</strong> demande{(existing.paid + existing.delivered) > 1 ? "s" : ""} pour ce {eventLabel}
              {existing.delivered > 0 && ` (${existing.delivered} acceptée${existing.delivered > 1 ? "s" : ""} par l'artiste)`}
              {existing.paid > 0 && ` (${existing.paid} en attente)`}.
              Vous pouvez en envoyer autant que vous voulez — chaque dédicace sera interprétée pendant le {eventLabel}.
            </div>
          )}
          <div>
            <Label>Ton message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={400} placeholder="Salut, j'adore ta musique ! Peux-tu dire bonjour à..." />
            <p className="text-[10px] text-muted-foreground mt-1">{message.length}/400</p>
          </div>
          <div>
            <Label>Prix (crédits)</Label>
            <Input type="number" min={min} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="w-3.5 h-3.5" /> Solde actuel : <strong>{balance} crédits</strong>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Annuler</Button>
          <Button onClick={submit} disabled={busy} className="bg-gradient-primary">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Envoyer (${price} crédits)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DedicationDialog;
