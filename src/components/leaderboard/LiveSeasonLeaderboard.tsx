/**
 * Leaderboard live saison courante : top 3 podium animé, logique mystery, basé sur
 * `leaderboard_seasons` + agrégation `gift_transactions`. Fulfillment post-saison via
 * `SeasonWinnersManager`.
 */
import { useEffect, useState } from "react";
import { getLiveRanking } from "@/api/endpoints/leaderboards";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Crown, Medal, TrendingUp, Gift, Heart } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Row {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  stage_name: string | null;
  total_votes: number;
  total_gifts_received: number;
  total_wins: number;
  total_donated: number;
  gifts_sent: number;
  votes_cast: number;
  score: number;
  rank_position: number;
}

interface Reward {
  rank_position: number;
  reward_type: string;
  credits_amount: number | null;
  physical_description: string | null;
}

interface Props {
  seasonId: string;
  seasonType: string;
  rewards: Reward[];
  isMystery: boolean;
  isPast: boolean;
}

const rankIcon = (r: number) => {
  if (r === 1) return <Crown className="w-5 h-5 text-yellow-500" />;
  if (r === 2) return <Medal className="w-5 h-5 text-gray-400" />;
  if (r === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground">#{r}</span>;
};

export const LiveSeasonLeaderboard = ({ seasonId, seasonType, rewards, isMystery, isPast }: Props) => {
  const { t } = useLanguage();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isFirst = true;
    const load = async () => {
      if (isFirst) setLoading(true);
      try {
        const data = await getLiveRanking(seasonId);
        setRows((data as any) ?? []);
      } catch {
        setRows([]);
      }
      setLoading(false);
      isFirst = false;
    };
    load();
    if (!isPast) {
      // realtime removed (no backend emit); data loads on mount + 5s poll.
      const timer = setInterval(load, 5000);
      return () => {
        clearInterval(timer);
      };
    }
  }, [seasonId, isPast]);

  const rewardFor = (rank: number) => {
    const r = rewards.find((x) => x.rank_position === rank);
    if (!r) return null;
    if (isMystery && !isPast) return `🎁 ${t("seasonRewardToDiscover")}`;
    switch (r.reward_type) {
      case "credits": return `💰 ${r.credits_amount} ${t("creditsUnit")}`;
      case "virtual_gift": return `🎁 ${t("adminSeasonsVirtualGift")}`;
      case "physical": return `📦 ${r.physical_description || t("adminSeasonsPhysical")}`;
      case "mystery": return `🎁 ${t("adminSeasonsMysteryType")}`;
      default: return r.reward_type;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> {t("loading")}...
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">{t("adminWinnersAutoEmpty")}</p>;
  }

  return (
    <Card className="bg-muted/20">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isPast ? t("seasonFinalStandings") : t("liveSeasonRanking") || "Classement en direct"}
          </p>
          {!isPast && <Badge variant="outline" className="text-[10px]">{t("autoUpdated") || "Mis à jour automatiquement"}</Badge>}
        </div>
        {rows.map((row) => {
          const reward = rewardFor(row.rank_position);
          const name = row.stage_name || row.full_name || "Anonyme";
          return (
            <div key={row.user_id} className="flex items-center gap-3 p-2 rounded-lg bg-card border">
              <div className="w-8 flex justify-center">{rankIcon(row.rank_position)}</div>
              <Avatar className="w-9 h-9">
                <AvatarImage src={row.avatar_url || ""} />
                <AvatarFallback>{name[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{name}</p>
                <div className="flex gap-2 text-[10px] text-muted-foreground flex-wrap">
                  {seasonType === "artist" ? (
                    <>
                      <span className="inline-flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />{row.total_votes}</span>
                      <span className="inline-flex items-center gap-0.5"><Gift className="w-3 h-3" />{row.total_gifts_received}</span>
                      <span>🏆 {row.total_wins}</span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-0.5"><Heart className="w-3 h-3" />{row.total_donated} don</span>
                      <span>🎁 {row.gifts_sent}</span>
                      <span>🗳️ {row.votes_cast}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-primary">{Math.round(row.score)}</p>
                {reward && <p className="text-[10px] text-amber-600 font-medium">{reward}</p>}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default LiveSeasonLeaderboard;
