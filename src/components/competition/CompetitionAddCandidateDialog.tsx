/**
 * Compétition: CompetitionAddCandidateDialog — ajout manuel d'un candidat
 * par le manager (candidature présentiel, sans passer par le flux
 * d'auto-candidature). Verrouillé par le réglage admin
 * `manual_candidates_config` (désactivé par défaut) — voir
 * `PlatformConfigManager.tsx` pour le toggle et
 * `competition.service.js#addCandidateManually` côté backend.
 *
 * @access role=manager|admin
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { listArtists } from "@/api/endpoints/creators";
import { addCandidateManually } from "@/api/endpoints/competitions";
import { ApiError } from "@/api/http";

interface Props {
  competitionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded?: () => void;
}

export const CompetitionAddCandidateDialog = ({ competitionId, open, onOpenChange, onAdded }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [artists, setArtists] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelectedId(null);
    setPitch("");
    listArtists().then(setArtists).catch(() => setArtists([]));
  }, [open]);

  const filtered = artists.filter((a: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (a.stage_name || a.full_name || "").toLowerCase().includes(q);
  });

  const handleAdd = async () => {
    if (!selectedId) {
      toast({ title: t("compAddCandidateSelectRequired") || "Sélectionnez un artiste", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await addCandidateManually(competitionId, { artistId: selectedId, pitch: pitch || undefined });
    } catch (err) {
      setBusy(false);
      const msg =
        err instanceof ApiError && err.code === "MANUAL_CANDIDATES_DISABLED"
          ? t("compAddCandidateDisabled") || "Cette fonctionnalité est désactivée par l'administrateur."
          : err instanceof ApiError && err.details?.reason === "already_candidate"
          ? t("compAddCandidateAlready") || "Cet artiste est déjà candidat."
          : err instanceof ApiError
          ? err.message
          : "Error";
      toast({ title: msg, variant: "destructive" });
      return;
    }
    setBusy(false);
    toast({ title: t("compAddCandidateSuccess") || "Candidat ajouté avec succès" });
    onOpenChange(false);
    onAdded?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("compAddCandidateTitle") || "Ajouter un candidat"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("compAddCandidateSearchLabel") || "Rechercher un artiste"}</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("compAddCandidateSearchPlaceholder") || "Nom de l'artiste..."}
            />
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1 border rounded-md p-1">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground p-2">{t("compAddCandidateNoResults") || "Aucun artiste trouvé"}</p>
            )}
            {filtered.map((a: any) => (
              <button
                key={a.user_id}
                type="button"
                onClick={() => setSelectedId(a.user_id)}
                className={`w-full flex items-center gap-2 p-2 rounded-md text-left transition-colors ${
                  selectedId === a.user_id ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted/50"
                }`}
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage src={a.avatar_url || ""} />
                  <AvatarFallback>{(a.stage_name || a.full_name || "A")[0]}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{a.stage_name || a.full_name || a.user_id?.slice(0, 8)}</span>
              </button>
            ))}
          </div>
          <div>
            <Label>{t("compAddCandidatePitchLabel") || "Note (optionnel)"}</Label>
            <Textarea value={pitch} onChange={(e) => setPitch(e.target.value)} rows={2} />
          </div>
          <Button className="w-full" disabled={busy || !selectedId} onClick={handleAdd}>
            {busy ? t("loading") || "..." : t("compAddCandidateSubmit") || "Ajouter"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CompetitionAddCandidateDialog;
