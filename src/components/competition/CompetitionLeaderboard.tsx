/**
 * Compétition: CompetitionLeaderboard — classement temps réel des
 * candidats (votes + valeur des cadeaux reçus).
 *
 * EN — Realtime leaderboard during the live, ordered by total votes
 * plus gift credits.
 */
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import * as competitionsApi from "@/api/endpoints/competitions";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props { competitionId: string; profiles: Record<string, any> }

export const CompetitionLeaderboard = ({ competitionId, profiles }: Props) => {
  const { t } = useLanguage();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await competitionsApi.listCandidates(competitionId);
        const sorted = ((data as any[]) || [])
          .filter((c: any) => c.status === "approved")
          .map((c: any) => ({
            ...c,
            score: Number(c.total_votes) + Number(c.total_gifts_credits),
          }))
          .sort((a: any, b: any) => b.score - a.score);
        setRows(sorted);
      } catch {
        /* ignore transient errors */
      }
    };
    // realtime removed (no backend emit); data loads on mount + on action.
    load();
  }, [competitionId]);

  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-sm font-semibold flex items-center gap-2 mb-2"><Trophy className="w-4 h-4" /> {t("compLeaderboard")}</p>
        <ol className="space-y-1">
          {rows.map((r: any, i: number) => (
            <li key={r.id} className="flex justify-between text-sm">
              <span>{i + 1}. {profiles[r.artist_id]?.full_name || r.artist_id.slice(0, 6)}</span>
              <b>{r.score}</b>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
};

export default CompetitionLeaderboard;
