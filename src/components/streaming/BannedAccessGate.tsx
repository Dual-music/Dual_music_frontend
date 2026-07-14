/**
 * Garde d'accès si l'utilisateur est banni du stream (`stream_bans` via `useStreamBan`) — affiche raison et expiration.
 */
/**
 * BannedAccessGate
 * ----------------
 * Bloque complètement l'accès (vidéo + chat) à un stream pour un utilisateur banni.
 * S'affiche au-dessus du contenu sous forme d'AlertDialog non-fermable.
 *
 * Trois portées de bannissement gérées :
 *  - `event`     : bannissement local à un live / concert / duel (par l'artiste ou le manager)
 *  - `platform`  : bannissement global appliqué par un admin (temporaire ou définitif)
 *  - `none`      : utilisateur autorisé, le gate ne rend rien
 *
 * Le hook `useStreamBan` interroge la table `stream_bans` (event) et `platform_bans`
 * (global) et met à jour en temps réel via Supabase Realtime.
 *
 * @see src/hooks/useStreamBan.ts
 * @see src/components/admin/PlatformBansManager.tsx
 */
import { useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Ban } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useStreamBan, type StreamType } from "@/hooks/useStreamBan";

interface BannedAccessGateProps {
  streamType: StreamType;
  streamId: string;
  currentUserId?: string | null;
  /** Where to send the user when they acknowledge the ban. */
  fallbackRoute?: string;
}

/**
 * Hard-blocks video + chat access for users banned from a given stream.
 * Mount this once on the stream page. When the current user is banned,
 * it shows a full-screen alert and prevents any interaction with the stream.
 */
export const BannedAccessGate = ({
  streamType,
  streamId,
  currentUserId,
  fallbackRoute,
}: BannedAccessGateProps) => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { isCurrentUserBanned } = useStreamBan({ streamType, streamId, currentUserId });

  if (!isCurrentUserBanned) return null;

  const route =
    fallbackRoute ||
    (streamType === "duel" ? "/duels" : streamType === "concert" ? "/concerts" : "/lives");

  const title = language === "fr" ? "Accès bloqué" : "Access blocked";
  const desc =
    language === "fr"
      ? "Vous avez été banni de cet événement par l'organisateur. Vous ne pouvez plus en voir le contenu ni y écrire."
      : "You have been banned from this event by the host. You can no longer watch or chat here.";
  const cta = language === "fr" ? "Quitter" : "Leave";

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <Ban className="w-5 h-5" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">{desc}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="destructive" onClick={() => navigate(route)}>
            {cta}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default BannedAccessGate;
