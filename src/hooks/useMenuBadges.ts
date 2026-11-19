/**
 * Pastilles (compteurs) des menus latéraux — source unique, tenue à jour automatiquement.
 *
 * Avant : chaque page calculait ses compteurs une seule fois à l'ouverture, et les autres pages
 * passaient des zéros → la pastille n'apparaissait qu'après avoir cliqué sur le menu ou actualisé.
 * Maintenant les menus lisent ces hooks, qui se rafraîchissent :
 *  - toutes les 30 s ;
 *  - au retour sur l'onglet du navigateur ;
 *  - dès qu'une notification temps réel arrive (`notification:new`) ;
 *  - juste après toute action de l'utilisateur (événement `MUTATION_EVENT` émis par `api/http`).
 * react-query mutualise les appels : plusieurs menus montés = une seule requête.
 */
import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSocketEvent } from "@/realtime/useRoom";
import { MUTATION_EVENT } from "@/api/http";
import { getBadgeCounts, type AdminBadgeCounts } from "@/api/endpoints/admin";
import { myDuelRequests } from "@/api/endpoints/duels";
import { myPendingCandidatesCount } from "@/api/endpoints/competitions";

const KEY = "menu-badges";
const REFRESH_MS = 30_000;
const QUERY_OPTIONS = {
  refetchInterval: REFRESH_MS,
  refetchOnWindowFocus: true,
  staleTime: 5_000,
  retry: false,
} as const;

/** Rafraîchit immédiatement toutes les pastilles (à appeler après une action locale). */
export function useRefreshMenuBadges(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [KEY] });
  }, [queryClient]);
}

/** Branche les déclencheurs temps réel (notification reçue, action effectuée). */
function useBadgeTriggers(enabled: boolean) {
  const refresh = useRefreshMenuBadges();
  useSocketEvent("/notifications", "notification:new", refresh, enabled);
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    // Léger délai : laisse le serveur terminer l'écriture, et regroupe les actions en rafale.
    const onMutation = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 400);
    };
    window.addEventListener(MUTATION_EVENT, onMutation);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(MUTATION_EVENT, onMutation);
    };
  }, [enabled, refresh]);
}

/** Compteurs du menu admin ; `undefined` tant que non chargés (ou si l'utilisateur n'est pas admin). */
export function useAdminBadgeCounts(): AdminBadgeCounts | undefined {
  const { user, isAdmin } = useAuth();
  const enabled = !!user && isAdmin;
  useBadgeTriggers(enabled);
  const { data } = useQuery({
    queryKey: [KEY, "admin", user?.id],
    queryFn: getBadgeCounts,
    enabled,
    ...QUERY_OPTIONS,
  });
  return enabled ? data : undefined;
}

/** Compteurs du menu profil, par valeur d'onglet (`duels`, `competitions`). */
export function useProfileBadgeCounts(): Record<string, number> {
  const { user, roles } = useAuth();
  const userId = user?.id;
  const isArtist = !!userId && (roles as string[]).includes("artist");
  const isManager = !!userId && (roles as string[]).includes("manager");
  useBadgeTriggers(isArtist || isManager);

  // Artiste : invitations de duel reçues, encore en attente de sa réponse.
  const { data: duels = 0 } = useQuery({
    queryKey: [KEY, "duel-invites", userId],
    queryFn: async () => {
      const all = (await myDuelRequests()) as Array<Record<string, unknown>>;
      return all.filter((r) => r.opponent_id === userId && r.status === "pending").length;
    },
    enabled: isArtist,
    ...QUERY_OPTIONS,
  });

  // Manager : candidatures en attente sur l'ensemble de ses compétitions.
  const { data: competitions = 0 } = useQuery({
    queryKey: [KEY, "candidates", userId],
    queryFn: async () => (await myPendingCandidatesCount())?.count || 0,
    enabled: isManager,
    ...QUERY_OPTIONS,
  });

  return { duels: isArtist ? duels : 0, competitions: isManager ? competitions : 0 };
}
