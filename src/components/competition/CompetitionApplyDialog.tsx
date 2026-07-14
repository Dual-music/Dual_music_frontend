/**
 * Compétition: CompetitionApplyDialog — dialog d'envoi de candidature
 * pour un artiste.
 *
 * Affiche les frais d'inscription requis et débite le portefeuille
 * via la RPC atomique `apply_to_competition` côté DB. Notifie le
 * manager une fois la candidature enregistrée.
 *
 * EN — Candidate application dialog for artists. Uses the atomic
 * `apply_to_competition` RPC to enforce concurrency safety on entry
 * fee deduction.
 *
 * @access role=artist
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apply } from "@/api/endpoints/competitions";
import { ApiError } from "@/api/http";

interface Props {
  competition: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApplied?: () => void;
}

export const CompetitionApplyDialog = ({ competition, open, onOpenChange, onApplied }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [pitch, setPitch] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const handleApply = async () => {
    if (!pitch.trim() || !videoUrl.trim()) {
      toast({ title: t("compApplyRequiredFields") || "Tous les champs sont obligatoires", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apply(competition.id, { pitch: pitch || null, videoDemoUrl: videoUrl || null });
    } catch (err) {
      setBusy(false);
      const raw = (err instanceof ApiError ? (err.details?.reason as string) || err.code : "error") || "error";
      const key = "comp" + String(raw).split("_").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
      const translated = t(key);
      const fallback = err instanceof ApiError ? err.message : "Error";
      toast({ title: translated && translated !== key ? translated : fallback, variant: "destructive" });
      return;
    }
    setBusy(false);
    toast({ title: t("compApplied") });
    onOpenChange(false);
    onApplied?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("compApplyTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {competition.entry_fee_required && competition.entry_fee_amount > 0 && (
            <div className="p-3 rounded bg-amber-500/10 text-sm">
              💰 {t("compEntryFeeAmount")} : <b>{competition.entry_fee_amount}</b>
            </div>
          )}
          <div>
            <Label>{t("compApplyPitch")} <span className="text-destructive">*</span></Label>
            <Textarea value={pitch} onChange={(e) => setPitch(e.target.value)} required />
          </div>
          <div>
            <Label>{t("compApplyVideo")} <span className="text-destructive">*</span></Label>
            <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} required />
          </div>
          <Button onClick={handleApply} disabled={busy || !pitch.trim() || !videoUrl.trim()} className="w-full">
            {t("compApply")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CompetitionApplyDialog;
