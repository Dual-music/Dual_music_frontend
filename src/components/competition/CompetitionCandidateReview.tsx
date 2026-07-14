/**
 * Compétition: CompetitionCandidateReview — liste de candidatures
 * pour validation manager (approve/reject avec motif).
 *
 * EN — Manager review list for competition applications.
 *
 * @access role=manager
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { listCandidates, reviewCandidate } from "@/api/endpoints/competitions";
import { ApiError } from "@/api/http";
import { getDisplayProfiles } from "@/api/endpoints/users";

interface Props { competitionId: string }

export const CompetitionCandidateReview = ({ competitionId }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [reason, setReason] = useState<Record<string, string>>({});

  const fetchCandidates = async () => {
    let list: any[] = [];
    try {
      list = (await listCandidates(competitionId)) as any[];
    } catch {
      list = [];
    }
    setCandidates(list);
    if (list.length) {
      const ids = list.map((c: any) => c.artist_id);
      const profs = await getDisplayProfiles(ids);
      const map: Record<string, any> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p; });
      setProfiles(map);
    }
  };

  useEffect(() => { fetchCandidates(); }, [competitionId]);

  const review = async (id: string, decision: "approved" | "rejected") => {
    try {
      await reviewCandidate(id, {
        approve: decision === "approved",
        rejectionReason: reason[id] || null,
      });
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : "Error", variant: "destructive" });
      return;
    }
    // Candidate notification is emitted server-side now.
    toast({ title: t("compReviewedSuccess") });
    fetchCandidates();
  };

  if (!candidates.length) {
    return <p className="text-muted-foreground text-sm p-4">{t("compNoCompetitions")}</p>;
  }

  return (
    <div className="space-y-3">
      {candidates.map((c) => {
        const p = profiles[c.artist_id];
        return (
          <Card key={c.id}>
            <CardContent className="p-3 flex flex-col sm:flex-row gap-3">
              <Link to={`/artist/${c.artist_id}`} className="shrink-0 hover:opacity-80 transition-opacity" aria-label={p?.full_name}>
                <Avatar className="cursor-pointer ring-2 ring-transparent hover:ring-primary transition"><AvatarImage src={p?.avatar_url} /><AvatarFallback>{p?.full_name?.[0]}</AvatarFallback></Avatar>
              </Link>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{p?.full_name || c.artist_id.slice(0, 8)}</p>
                  <Badge variant={c.status === "approved" ? "default" : c.status === "rejected" ? "destructive" : "secondary"}>
                    {t("comp" + c.status.charAt(0).toUpperCase() + c.status.slice(1))}
                  </Badge>
                </div>
                {c.pitch && <p className="text-sm text-muted-foreground mt-1">{c.pitch}</p>}
                {c.video_demo_url && <a href={c.video_demo_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Demo</a>}
                {c.status === "pending" && (
                  <div className="mt-3 space-y-2">
                    <Input placeholder={t("compRejectReason")}
                      value={reason[c.id] || ""}
                      onChange={(e) => setReason((r) => ({ ...r, [c.id]: e.target.value }))} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => review(c.id, "approved")}>{t("compApprove")}</Button>
                      <Button size="sm" variant="destructive" onClick={() => review(c.id, "rejected")}>{t("compReject")}</Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default CompetitionCandidateReview;
