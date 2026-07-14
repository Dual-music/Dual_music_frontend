/**
 * Compétition: MyCompetitions — vue artiste de toutes ses candidatures
 * (statut, classement final, lien vers la compétition).
 *
 * EN — Artist view listing every competition they applied to, with
 * application status, final ranking when available, and quick access.
 *
 * @access role=artist
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Calendar, ExternalLink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatTz } from "@/lib/datetime";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { myCandidacies } from "@/api/endpoints/competitions";

interface Props { userId: string }

export const MyCompetitions = ({ userId }: Props) => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const data = await myCandidacies();
        if (active) setRows((data as any[]) || []);
      } catch {
        if (active) setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [userId]);

  if (loading) return <p className="text-muted-foreground text-sm">{t("artistProfileLoading")}</p>;
  if (!rows.length) return (
    <Card><CardContent className="p-6 text-center text-muted-foreground">{t("compNoCompetitions")}</CardContent></Card>
  );

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.id} className="hover:bg-accent/30 transition-colors">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold truncate">{r.competition?.title || "—"}</h4>
                <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>
                  {t("comp" + r.status.charAt(0).toUpperCase() + r.status.slice(1))}
                </Badge>
                {r.final_rank ? (
                  <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-black">
                    <Trophy className="w-3 h-3 mr-1" />#{r.final_rank}
                  </Badge>
                ) : null}
              </div>
              {r.competition?.start_at && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatTz(r.competition.start_at, "dd MMM yyyy HH:mm", { timezone: prefs.timezone, language })}
                </p>
              )}
              {r.pitch && <p className="text-xs text-muted-foreground mt-1 truncate">{r.pitch}</p>}
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate(`/competition/${r.competition_id}`)}>
              <ExternalLink className="w-3 h-3 mr-1" />{t("compViewCandidates")}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default MyCompetitions;
