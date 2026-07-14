/**
 * Compétition: PerformerController — contrôle manager pour désigner
 * le candidat qui passe et lancer le chronomètre partagé.
 *
 * EN — Manager-only control to pick the current performer and start
 * the shared timer.
 *
 * @access role=manager
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import * as competitions from "@/api/endpoints/competitions";

interface Props {
  competitionId: string;
  candidates: any[];
  profiles: Record<string, any>;
}

export const PerformerController = ({ competitionId, candidates, profiles }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [candidateId, setCandidateId] = useState<string>("");
  const [duration, setDuration] = useState(180);

  const set = async (cId: string | null) => {
    try {
      await competitions.setPerformer(competitionId, {
        candidateId: cId,
        ...(cId ? { durationSec: duration } : {}),
      });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <Label>{t("compSetPerformer")}</Label>
        <Select value={candidateId} onValueChange={setCandidateId}>
          <SelectTrigger><SelectValue placeholder={t("compChooseCandidate")} /></SelectTrigger>
          <SelectContent>
            {candidates.map((c) => (
              <SelectItem key={c.id} value={c.id}>{profiles[c.artist_id]?.full_name || c.artist_id.slice(0, 8)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div>
          <Label>{t("compDuration")}</Label>
          <Input type="number" min={10} value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value || "60"))} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => candidateId && set(candidateId)} size="sm">{t("compSetPerformer")}</Button>
          <Button onClick={() => set(null)} size="sm" variant="outline">{t("compStopPerformer")}</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PerformerController;
