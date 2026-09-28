/**
 * Compétition: CompetitionCandidateReview — liste de candidatures
 * pour validation manager (approve/reject avec motif), retrait d'un
 * candidat déjà approuvé (avec remboursement éventuel côté serveur),
 * et consultation du détail (pitch + démo vidéo) dans une popup.
 *
 * EN — Manager review list for competition applications: approve/reject
 * with a reason, remove an already-approved candidate (server refunds the
 * entry fee automatically if it was actually charged), and a detail dialog
 * (pitch + demo video) opened from an eye icon per row.
 *
 * @access role=manager
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, Eye, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { usePlatformSetting } from "@/hooks/usePlatformSettings";
import { listCandidates, reviewCandidate, removeCandidate } from "@/api/endpoints/competitions";
import { ApiError } from "@/api/http";
import { getDisplayProfiles } from "@/api/endpoints/users";
import { CompetitionAddCandidateDialog } from "./CompetitionAddCandidateDialog";

interface Props { competitionId: string }

export const CompetitionCandidateReview = ({ competitionId }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: manualCandidatesConfig } = usePlatformSetting("manual_candidates_config", { enabled: false });
  const manualCandidatesEnabled = manualCandidatesConfig?.enabled === true;

  const showError = (err: unknown) => {
    toast({
      title: t("commonError"),
      description: err instanceof ApiError ? err.message : undefined,
      variant: "destructive",
    });
  };

  const fetchCandidates = async () => {
    let list: any[] = [];
    try {
      list = (await listCandidates(competitionId)) as any[];
    } catch {
      list = [];
    }
    // A removed candidate stays in the table (status "removed", for audit/refund history) but
    // has no place in this review list anymore.
    list = list.filter((c: any) => c.status !== "removed");
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
    setBusyId(id);
    try {
      await reviewCandidate(id, {
        approve: decision === "approved",
        rejectionReason: reason[id] || null,
      });
    } catch (err) {
      setBusyId(null);
      showError(err);
      return;
    }
    setBusyId(null);
    // Candidate notification is emitted server-side now.
    toast({ title: t("compReviewedSuccess") });
    setDetailId(null);
    fetchCandidates();
  };

  const handleRemove = async (id: string) => {
    if (!confirm(t("compRemoveCandidateConfirm") || "Retirer ce candidat de la compétition ?")) return;
    setBusyId(id);
    try {
      const res = await removeCandidate(id);
      toast({
        title: res?.refunded
          ? t("compRemovedRefunded") || "Candidat retiré (remboursé)"
          : t("compRemovedNoRefund") || "Candidat retiré",
      });
    } catch (err) {
      showError(err);
      setBusyId(null);
      return;
    }
    setBusyId(null);
    setDetailId(null);
    fetchCandidates();
  };

  const detail = candidates.find((c) => c.id === detailId) || null;
  const detailProfile = detail ? profiles[detail.artist_id] : null;

  return (
    <div className="space-y-3">
      {manualCandidatesEnabled && (
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" /> {t("compAddCandidateBtn") || "Ajouter un candidat"}
        </Button>
      )}
      {!candidates.length && (
        <p className="text-muted-foreground text-sm p-4">{t("compNoCompetitions")}</p>
      )}
      {candidates.map((c) => {
        const p = profiles[c.artist_id];
        return (
          <Card key={c.id}>
            <CardContent className="p-3 flex items-center gap-3">
              <Link to={`/artist/${c.artist_id}`} className="shrink-0 hover:opacity-80 transition-opacity" aria-label={p?.full_name}>
                <Avatar className="cursor-pointer ring-2 ring-transparent hover:ring-primary transition"><AvatarImage src={p?.avatar_url} /><AvatarFallback>{p?.full_name?.[0]}</AvatarFallback></Avatar>
              </Link>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{p?.full_name || c.artist_id.slice(0, 8)}</p>
                <Badge variant={c.status === "approved" ? "default" : c.status === "rejected" ? "destructive" : "secondary"}>
                  {t("comp" + c.status.charAt(0).toUpperCase() + c.status.slice(1))}
                </Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={t("compViewDetail") || "Voir le détail"}
                  title={t("compViewDetail") || "Voir le détail"}
                  onClick={() => setDetailId(c.id)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
                {c.status === "approved" && (
                  <Button
                    size="icon"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    aria-label={t("compRemoveCandidate") || "Retirer"}
                    title={t("compRemoveCandidate") || "Retirer"}
                    disabled={busyId === c.id}
                    onClick={() => handleRemove(c.id)}
                  >
                    <UserMinus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!detail} onOpenChange={(v) => { if (!v) setDetailId(null); }}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={detailProfile?.avatar_url} />
                    <AvatarFallback>{detailProfile?.full_name?.[0]}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{detailProfile?.full_name || detail.artist_id.slice(0, 8)}</span>
                  <Badge variant={detail.status === "approved" ? "default" : detail.status === "rejected" ? "destructive" : "secondary"}>
                    {t("comp" + detail.status.charAt(0).toUpperCase() + detail.status.slice(1))}
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t("compApplyPitch") || "Présentation"}</p>
                  <p className="text-sm whitespace-pre-wrap">{detail.pitch || t("compNoPitch") || "Aucune présentation fournie"}</p>
                </div>
                {detail.video_demo_url && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t("compDemoVideo") || "Vidéo de démonstration"}</p>
                    <video
                      controls
                      src={detail.video_demo_url}
                      className="w-full max-h-72 rounded-md bg-black"
                    />
                    <a
                      href={detail.video_demo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline mt-1 inline-block"
                    >
                      {t("compOpenDemoLink") || "Ouvrir le lien de la démo"}
                    </a>
                  </div>
                )}
                {detail.status === "rejected" && detail.rejection_reason && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t("compRejectReason")}</p>
                    <p className="text-sm">{detail.rejection_reason}</p>
                  </div>
                )}
                {detail.status === "pending" && (
                  <div className="space-y-2 pt-2 border-t">
                    <Input
                      placeholder={t("compRejectReason")}
                      value={reason[detail.id] || ""}
                      onChange={(e) => setReason((r) => ({ ...r, [detail.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busyId === detail.id} onClick={() => review(detail.id, "approved")}>{t("compApprove")}</Button>
                      <Button size="sm" variant="destructive" disabled={busyId === detail.id} onClick={() => review(detail.id, "rejected")}>{t("compReject")}</Button>
                    </div>
                  </div>
                )}
                {detail.status === "approved" && (
                  <div className="pt-2 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={busyId === detail.id}
                      onClick={() => handleRemove(detail.id)}
                    >
                      <UserMinus className="w-4 h-4 mr-2" /> {t("compRemoveCandidate") || "Retirer"}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CompetitionAddCandidateDialog
        competitionId={competitionId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={fetchCandidates}
      />
    </div>
  );
};

export default CompetitionCandidateReview;
