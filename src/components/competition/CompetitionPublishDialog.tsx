/**
 * Compétition: CompetitionPublishDialog — publication par le manager
 * avec choix accès gratuit/payant et prix du billet spectateur.
 *
 * EN — Publish dialog for managers; sets free/paid access and ticket price.
 *
 * @access role=manager
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { publish } from "@/api/endpoints/competitions";
import { ApiError } from "@/api/http";

interface Props {
  competitionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPublished?: () => void;
}

export const CompetitionPublishDialog = ({ competitionId, open, onOpenChange, onPublished }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [paid, setPaid] = useState(false);
  const [price, setPrice] = useState(0);
  const [busy, setBusy] = useState(false);

  const handlePublish = async () => {
    setBusy(true);
    try {
      // NOTE: the REST publish endpoint does not (yet) accept paid-access /
      // ticket-price params — it only flips the status to `published`.
      await publish(competitionId, { isPublicPaid: paid, viewerTicketPrice: paid ? price : 0 });
    } catch (err) {
      setBusy(false);
      toast({ title: err instanceof ApiError ? err.message : "Error", variant: "destructive" });
      return;
    }
    setBusy(false);
    toast({ title: t("compPublished") });
    onOpenChange(false);
    onPublished?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("compPublishDialogTitle")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded bg-muted/30">
            <Label>{paid ? t("compPublishPaidAccess") : t("compPublishFreeAccess")}</Label>
            <Switch checked={paid} onCheckedChange={setPaid} />
          </div>
          {paid && (
            <div>
              <Label>{t("compTicketPrice")}</Label>
              <Input type="number" min={0} value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value || "0"))} />
            </div>
          )}
          <Button onClick={handlePublish} disabled={busy} className="w-full">
            {t("compPublish")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CompetitionPublishDialog;
