/**
 * Classement donateurs en temps réel du duel (top 10) — Realtime sur `gift_transactions`.
 */
/**
 * GiftLeaderboard
 * ---------------
 * Classement temps réel des top donateurs d'un duel.
 * Souscrit aux changements de `duel_gifts` via Supabase Realtime et agrège
 * par sender_id (somme des prix). Utilise `get_display_profiles` RPC pour
 * obtenir nom + avatar respectant les préférences de visibilité.
 *
 * @prop duelId - id du duel à observer
 * @prop limit  - nombre max de positions affichées (défaut 10)
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";
import { Trophy, Crown, Medal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as leaderboardsApi from "@/api/endpoints/leaderboards";

interface Donor {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  total_gifts: number;
}

interface GiftLeaderboardProps {
  duelId?: string;
  concertId?: string;
  liveId?: string;
  competitionId?: string;
}

const RANK_STYLES = [
  { icon: Crown, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  { icon: Medal, color: "text-gray-400", bg: "bg-gray-400/10", border: "border-gray-400/30" },
  { icon: Medal, color: "text-amber-700", bg: "bg-amber-700/10", border: "border-amber-700/30" },
];

export const GiftLeaderboard = ({ duelId, concertId, liveId, competitionId }: GiftLeaderboardProps) => {
  const { t } = useLanguage();
  const [donors, setDonors] = useState<Donor[]>([]);

  const fetchLeaderboard = async () => {
    // Server-side per-context aggregation (GET /leaderboards/gifts) replaces the
    // former client-side merge of competition_gifts/competition_votes/
    // gift_transactions/duel_votes.
    const ctx = duelId
      ? ({ contextType: "duel", contextId: duelId } as const)
      : competitionId
        ? ({ contextType: "competition", contextId: competitionId } as const)
        : liveId
          ? ({ contextType: "live", contextId: liveId } as const)
          : concertId
            ? ({ contextType: "concert", contextId: concertId } as const)
            : null;
    if (!ctx) {
      setDonors([]);
      return;
    }
    try {
      const rows = await leaderboardsApi.giftEngagement(ctx);
      setDonors(
        (rows ?? []).map((r) => ({
          user_id: r.user_id,
          full_name: r.full_name ?? "?",
          avatar_url: r.avatar_url,
          total_gifts: r.total,
        })),
      );
    } catch {
      setDonors([]);
    }
  };

  useEffect(() => {
    // realtime removed (no backend emit); data loads on mount + on action.
    fetchLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelId, concertId, liveId, competitionId]);

  if (donors.length === 0) return null;

  return (
    <Card className="border-border">
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-500" />
          {t("topDonors")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <AnimatePresence>
          {donors.map((donor, idx) => {
            const style = RANK_STYLES[idx] || { icon: null, color: "text-muted-foreground", bg: "", border: "" };
            const RankIcon = style.icon;

            return (
              <motion.div
                key={donor.user_id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`flex items-center gap-2 px-4 py-2 ${idx < 3 ? style.bg : ""} ${idx === 0 ? "border-l-2 " + style.border : ""}`}
              >
                <span className={`w-5 text-center text-xs font-bold ${style.color}`}>
                  {idx < 3 && RankIcon ? (
                    <RankIcon className="w-4 h-4 inline" />
                  ) : (
                    `#${idx + 1}`
                  )}
                </span>
                <Avatar className="w-6 h-6">
                  <AvatarImage src={donor.avatar_url || ""} />
                  <AvatarFallback className="text-[10px]">
                    {donor.full_name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium truncate flex-1">
                  {donor.full_name}
                </span>
                <span className="text-xs font-bold text-primary">
                  🎁 {donor.total_gifts}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
};
