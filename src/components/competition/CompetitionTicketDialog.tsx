/**
 * Compétition: CompetitionTicketDialog — achat de billet d'accès au
 * direct lorsque la compétition est marquée payante.
 *
 * EN — Spectator paid-access ticket purchase via the atomic RPC
 * `purchase_competition_ticket`.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import * as competitions from "@/api/endpoints/competitions";

interface Props {
  competition: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPurchased?: () => void;
}

export const CompetitionTicketDialog = ({ competition, open, onOpenChange, onPurchased }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const buy = async () => {
    setBusy(true);
    try {
      await competitions.buyTicket(competition.id, {}, crypto.randomUUID());
      toast({ title: t("compTicketPurchased") });
      onOpenChange(false);
      onPurchased?.();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("compBuyTicket")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">
            {t("compTicketPrice")} : <b>{competition.viewer_ticket_price}</b>
          </p>
          <Button onClick={buy} disabled={busy} className="w-full">{t("compBuyTicket")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CompetitionTicketDialog;
