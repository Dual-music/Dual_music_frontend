/**
 * Compétition: CompetitionCandidatesList — liste publique des
 * candidats approuvés (utilisée hors live et pendant le live).
 *
 * EN — Public list of approved candidates with avatars and pitch.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { listCandidates } from "@/api/endpoints/competitions";
import { getDisplayProfiles } from "@/api/endpoints/users";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  competitionId: string;
  onSelect?: (candidate: any) => void;
  highlightId?: string | null;
}

export const CompetitionCandidatesList = ({ competitionId, onSelect, highlightId }: Props) => {
  const { t } = useLanguage();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  useEffect(() => {
    (async () => {
      let all: any[] = [];
      try {
        all = (await listCandidates(competitionId)) as any[];
      } catch {
        all = [];
      }
      const list = all.filter((c) => c.status === "approved");
      setCandidates(list);
      if (list.length) {
        const ids = list.map((c: any) => c.artist_id);
        const profs = await getDisplayProfiles(ids);
        const map: Record<string, any> = {};
        (profs || []).forEach((p: any) => { map[p.id] = p; });
        setProfiles(map);
      }
    })();
  }, [competitionId]);

  if (!candidates.length) return <p className="text-muted-foreground text-sm">{t("compNoCompetitions")}</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {candidates.map((c) => {
        const p = profiles[c.artist_id];
        const active = c.id === highlightId;
        return (
          <Card key={c.id} onClick={() => onSelect?.(c)}
            className={`cursor-pointer transition ${active ? "ring-2 ring-primary" : ""}`}>
            <CardContent className="p-3 flex gap-3 items-center">
              <Link to={`/artist/${c.artist_id}`} onClick={(e) => e.stopPropagation()} className="shrink-0 hover:opacity-80 transition-opacity" aria-label={p?.full_name}>
                <Avatar className="cursor-pointer ring-2 ring-transparent hover:ring-primary transition"><AvatarImage src={p?.avatar_url} /><AvatarFallback>{p?.full_name?.[0]}</AvatarFallback></Avatar>
              </Link>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{p?.full_name || "—"}</p>
                {c.pitch && <p className="text-xs text-muted-foreground truncate">{c.pitch}</p>}
              </div>
              {(c.total_votes || c.total_gifts_credits) ? (
                <Badge variant="secondary">{Number(c.total_votes) + Number(c.total_gifts_credits)}</Badge>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default CompetitionCandidatesList;
