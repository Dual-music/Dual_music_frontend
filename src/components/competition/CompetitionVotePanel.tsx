/**
 * Compétition: CompetitionVotePanel — vote via un champ select
 * (choix du candidat) et un unique bouton "Voter" en bas.
 *
 * Les votes sont atomiques via la RPC `vote_for_competition_candidate`
 * (80% artiste / 20% plateforme).
 *
 * EN — Voting panel with a Select for candidate + single Vote button.
 * Atomic via `vote_for_competition_candidate`.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import * as competitions from "@/api/endpoints/competitions";
import { Vote } from "lucide-react";

interface Props {
  candidates: any[];
  profiles: Record<string, any>;
}

export const CompetitionVotePanel = ({ candidates, profiles }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [credits, setCredits] = useState(1);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selected && candidates.length > 0) setSelected(candidates[0].id);
  }, [candidates, selected]);

  const vote = async () => {
    if (!selected || credits <= 0) return;
    const compId = candidates.find((c) => c.id === selected)?.competition_id;
    if (!compId) return;
    setBusy(true);
    try {
      await competitions.vote(compId, { candidateId: selected, credits }, crypto.randomUUID());
      toast({ title: t("compVoted") });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Vote className="w-4 h-4" /> {t("compVote")}
        </p>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            {t("compVoteFor") || "Voter pour"}
          </label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue placeholder={t("compVoteFor") || "Choisir un artiste"} />
            </SelectTrigger>
            <SelectContent className="z-[10001]">
              {candidates.map((c, idx) => {
                const p = profiles[c.artist_id];
                const name = p?.full_name || `Artiste #${idx + 1}`;
                return (
                  <SelectItem key={c.id} value={c.id}>
                    {name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            {t("compVoteUnit") || "Montant du vote ($) (1 crédit / vote)"}
          </label>
          <Input
            type="number"
            min={1}
            value={credits}
            onChange={(e) => setCredits(Math.max(1, parseInt(e.target.value || "1")))}
          />
          <p className="text-xs text-muted-foreground">
            {t("compVoteTotal") || "Total"}: <b className="text-foreground">{credits} crédit{credits > 1 ? "s" : ""}</b>
          </p>
        </div>

        <div className="pt-1 border-t border-border space-y-2">
          <p className="text-xs text-muted-foreground">{t("compQuickVotes") || "Votes rapides"}</p>
          <div className="grid grid-cols-3 gap-2">
            {[1, 5, 10].map((n) => (
              <Button
                key={n}
                variant="outline"
                size="sm"
                onClick={() => setCredits(n)}
                className={credits === n ? "border-primary" : ""}
              >
                {n} ×
              </Button>
            ))}
          </div>
        </div>

        <Button
          onClick={vote}
          disabled={busy || !selected}
          className="w-full h-11 font-bold text-white bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 hover:opacity-90 border-0 shadow-md"
        >
          <Vote className="w-4 h-4 mr-2" />
          {t("compVoteFor") || "Voter"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default CompetitionVotePanel;
