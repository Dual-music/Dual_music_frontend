/**
 * Signalement compte utilisateur (`account_reports`) — modal motif + preuves.
 */
/**
 * AccountReportButton
 * -------------------
 * Signale un profil utilisateur (typiquement un artiste) depuis sa page publique.
 * Empêche l'auto-signalement et les doublons (contrainte unique reporter+target).
 *
 * Insère dans `account_reports`. Les signalements sont traités par
 * `AccountReportsManager` côté admin (statuts: open / reviewed / dismissed).
 *
 * @prop targetUserId - id auth.users du profil signalé
 * @prop className    - classes Tailwind optionnelles pour positionner le bouton
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Flag } from "lucide-react";
import { reportAccount } from "@/api/endpoints/moderation";
import { ApiError } from "@/api/http";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface AccountReportButtonProps {
  reportedUserId: string;
  reportedUserName: string;
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "default" | "icon";
}

const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harcèlement" },
  { value: "fake_profile", label: "Faux profil" },
  { value: "inappropriate", label: "Contenu inapproprié" },
  { value: "other", label: "Autre" },
];

export const AccountReportButton = ({
  reportedUserId,
  reportedUserName,
  variant = "ghost",
  size = "sm",
}: AccountReportButtonProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("inappropriate");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReport = async () => {
    if (!user) {
      toast({ title: "Connexion requise", variant: "destructive" });
      return;
    }

    if (user.id === reportedUserId) {
      toast({ title: "Vous ne pouvez pas vous signaler vous-même", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await reportAccount({ reportedUserId, reason, details: details.trim() || null });
      toast({ title: "Signalement envoyé", description: `${reportedUserName} a été signalé.` });
      // Auto-warning threshold is now enforced server-side by the reportAccount endpoint.
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast({ title: "Déjà signalé", description: "Vous avez déjà signalé ce compte." });
      } else {
        toast({ title: "Erreur", description: "Impossible de signaler", variant: "destructive" });
      }
    } finally {
      setLoading(false);
      setOpen(false);
      setDetails("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant} className="text-destructive hover:bg-destructive/10">
          <Flag className="w-4 h-4 mr-1" />
          Signaler
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signaler {reportedUserName}</DialogTitle>
          <DialogDescription>
            Ce signalement sera examiné par notre équipe de modération.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPORT_REASONS.map(r => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Détails supplémentaires (optionnel)..."
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="destructive" onClick={handleReport} disabled={loading}>
            {loading ? "Envoi..." : "Signaler"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
