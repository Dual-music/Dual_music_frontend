/**
 * Compétition: CompetitionLeaderboard — classement temps réel des
 * candidats (votes + valeur des cadeaux reçus + voix de jury).
 *
 * Pour l'organisateur, expose aussi trois actions par candidat :
 *  - saisir les voix cumulées d'un jury hors ligne (additionnées au score) ;
 *  - couper/rétablir son micro d'autorité (diffusé à tous, parité duel) ;
 *  - le bannir de la compétition (arrête sa diffusion pour tous, parité concert/live).
 *
 * EN — Realtime leaderboard during the live, ordered by total votes + gift
 * credits + jury votes, with manager-only jury-vote entry, hard-mute and ban.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, Mic, MicOff, Ban } from "lucide-react";
import * as competitionsApi from "@/api/endpoints/competitions";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";

interface Props {
  competitionId: string;
  profiles: Record<string, any>;
  /** Contrôles organisateur (voix de jury, mute, ban) — masqués pour les spectateurs. */
  isManager?: boolean;
  mutedArtistIds?: Set<string>;
  onToggleMute?: (artistId: string) => void;
  onBanCandidate?: (artistId: string) => void;
}

export const CompetitionLeaderboard = ({ competitionId, profiles, isManager, mutedArtistIds, onToggleMute, onBanCandidate }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [juryDrafts, setJuryDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await competitionsApi.listCandidates(competitionId);
      const sorted = ((data as any[]) || [])
        .filter((c: any) => c.status === "approved")
        .map((c: any) => ({
          ...c,
          score: Number(c.total_votes) + Number(c.total_gifts_credits) + Number(c.jury_votes || 0),
        }))
        .sort((a: any, b: any) => b.score - a.score);
      setRows(sorted);
      setJuryDrafts((prev) => {
        const next = { ...prev };
        sorted.forEach((r: any) => { if (next[r.id] === undefined) next[r.id] = String(r.jury_votes || 0); });
        return next;
      });
    } catch {
      /* ignore transient errors */
    }
  }, [competitionId]);

  useEffect(() => {
    // realtime removed (no backend emit); data loads on mount + on action.
    load();
  }, [load]);

  const saveJuryVotes = async (candidateId: string) => {
    const raw = juryDrafts[candidateId];
    const value = Math.max(0, Math.trunc(Number(raw) || 0));
    setSavingId(candidateId);
    try {
      await competitionsApi.setJuryVotes(candidateId, value);
      await load();
    } catch (e: any) {
      toast({ title: e?.message || (t("errorTitle") || "Erreur"), variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-sm font-semibold flex items-center gap-2 mb-2"><Trophy className="w-4 h-4" /> {t("compLeaderboard")}</p>
        <ol className="space-y-2">
          {rows.map((r: any, i: number) => {
            const muted = mutedArtistIds?.has(r.artist_id);
            return (
              <li key={r.id} className="flex flex-col gap-1.5 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <div className="flex justify-between items-center text-sm">
                  <span className="truncate">{i + 1}. {profiles[r.artist_id]?.full_name || r.artist_id.slice(0, 6)}</span>
                  <b>{r.score}</b>
                </div>
                {isManager && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Input
                      type="number"
                      min={0}
                      value={juryDrafts[r.id] ?? "0"}
                      onChange={(e) => setJuryDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      className="h-7 w-20 text-xs"
                      title={t("compJuryVotesLabel") || "Voix du jury"}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2"
                      disabled={savingId === r.id}
                      onClick={() => saveJuryVotes(r.id)}
                    >
                      {t("compJuryVotesSave") || "Voix jury"}
                    </Button>
                    {onToggleMute && (
                      <Button
                        size="icon"
                        variant={muted ? "destructive" : "outline"}
                        className="h-7 w-7"
                        title={muted ? (t("unmute") || "Réactiver le micro") : (t("mute") || "Couper le micro")}
                        onClick={() => onToggleMute(r.artist_id)}
                      >
                        {muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                    {onBanCandidate && (
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        title={t("banUserLabel") || "Bannir"}
                        onClick={() => onBanCandidate(r.artist_id)}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
};

export default CompetitionLeaderboard;
