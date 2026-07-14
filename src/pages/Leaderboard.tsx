import { useState, useEffect } from "react";
import SEO from "@/components/seo/SEO";
import { useNavigate } from "react-router-dom";
import * as leaderboards from "@/api/endpoints/leaderboards";
import * as giftsApi from "@/api/endpoints/gifts";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Medal, TrendingUp, Gift, Swords, Crown, Heart, Calendar, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import { LiveSeasonLeaderboard } from "@/components/leaderboard/LiveSeasonLeaderboard";

interface LeaderboardEntry {
  user_id: string;
  stage_name: string | null;
  avatar_url: string | null;
  full_name: string | null;
  total_votes: number;
  total_gifts: number;
  total_wins: number;
  score: number;
}

interface DonorEntry {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  total_donated: number;
  gifts_sent: number;
  votes_cast: number;
}

interface SeasonInfo {
  id: string;
  name: string;
  type: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_mystery_reward: boolean;
}

interface SeasonReward {
  id: string;
  season_id: string;
  rank_position: number;
  reward_type: string;
  credits_amount: number | null;
  virtual_gift_id: string | null;
  physical_description: string | null;
}

interface VirtualGift {
  id: string;
  name: string;
  price: number;
}

interface SeasonWinner {
  id: string;
  season_id: string;
  user_id: string;
  rank_position: number;
  reward_status: string;
  user_name?: string;
  avatar_url?: string;
}

const Leaderboard = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const [artists, setArtists] = useState<LeaderboardEntry[]>([]);
  const [donors, setDonors] = useState<DonorEntry[]>([]);
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [rewards, setRewards] = useState<SeasonReward[]>([]);
  const [gifts, setGifts] = useState<VirtualGift[]>([]);
  const [seasonWinners, setSeasonWinners] = useState<SeasonWinner[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("artists");
  const [seasonsSubTab, setSeasonsSubTab] = useState<"active" | "ended">("active");
  const [activeSeasonsPage, setActiveSeasonsPage] = useState(1);
  const [endedSeasonsPage, setEndedSeasonsPage] = useState(1);
  const SEASONS_PAGE_SIZE = 5;

  useEffect(() => {
    Promise.all([loadArtistLeaderboard(), loadDonorLeaderboard(), loadSeasons()])
      .finally(() => setLoading(false));
  }, []);

  const loadArtistLeaderboard = async () => {
    // Precomputed all-time artist leaderboard (aggregation is now server-side).
    const data = await leaderboards.allTimeArtists({ limit: 100 });
    const leaderboard: LeaderboardEntry[] = (data || []).map((a) => ({
      user_id: a.id,
      stage_name: a.name,
      avatar_url: a.avatar_url,
      full_name: null,
      total_votes: 0,
      total_gifts: 0,
      total_wins: 0,
      score: a.score,
    }));
    setArtists(leaderboard);
  };

  const loadDonorLeaderboard = async () => {
    // Precomputed all-time donor leaderboard (aggregation is now server-side).
    const data = await leaderboards.allTimeDonors({ limit: 50 });
    const donorList: DonorEntry[] = (data || []).map((d) => ({
      user_id: d.id,
      full_name: d.name,
      avatar_url: d.avatar_url,
      total_donated: d.score,
      gifts_sent: 0,
      votes_cast: 0,
    }));
    setDonors(donorList);
  };

  const loadSeasons = async () => {
    const [seasonsData, giftsList, winnersData] = await Promise.all([
      leaderboards.listSeasons(),
      giftsApi.listGifts(),
      leaderboards.allWinners(),
    ]);
    setSeasons((seasonsData || []) as unknown as SeasonInfo[]);

    // Rewards are embedded per-season by the API (`season.rewards`).
    const allRewards = (seasonsData || []).flatMap(
      (s) => ((s as { rewards?: unknown[] }).rewards || []),
    ) as unknown as SeasonReward[];
    setRewards(allRewards);

    setGifts(
      (giftsList || []).map((g) => ({
        id: g.id,
        name: g.name,
        price: Number(g.price_credits ?? 0),
      })),
    );

    // Winners come enriched with `.user` { id, full_name, avatar_url }.
    const winnersList = (winnersData || []).map((row) => {
      const w = row as SeasonWinner & {
        user?: { full_name?: string | null; avatar_url?: string | null };
      };
      return {
        ...w,
        user_name: w.user?.full_name || "Inconnu",
        avatar_url: w.user?.avatar_url || null,
      };
    }) as SeasonWinner[];
    setSeasonWinners(winnersList);
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="w-8 h-8 text-yellow-500" />;
      case 2: return <Medal className="w-7 h-7 text-gray-400" />;
      case 3: return <Medal className="w-6 h-6 text-amber-600" />;
      default: return <span className="text-xl font-bold text-muted-foreground">#{rank}</span>;
    }
  };

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1: return "bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border-yellow-500/50 ring-2 ring-yellow-500/30";
      case 2: return "bg-gradient-to-r from-gray-400/20 to-gray-300/10 border-gray-400/50";
      case 3: return "bg-gradient-to-r from-amber-600/20 to-orange-500/10 border-amber-600/50";
      default: return "";
    }
  };

  const Podium = ({ entries, type }: { entries: { name: string; avatar: string | null; score: number; id: string; subtitle?: string }[]; type: "artist" | "donor" }) => {
    if (entries.length < 3) return null;
    const podiumOrder = [entries[1], entries[0], entries[2]];
    const sizes = [
      { avatar: "w-16 h-16", pt: "pt-8", ring: "ring-2 ring-gray-400" },
      { avatar: "w-20 h-20", pt: "", ring: "ring-4 ring-yellow-500" },
      { avatar: "w-14 h-14", pt: "pt-12", ring: "ring-2 ring-amber-600" },
    ];
    const ranks = [2, 1, 3];

    return (
      <div className="grid grid-cols-3 gap-4 mb-8">
        {podiumOrder.map((entry, i) => (
          <div key={entry.id} className={sizes[i].pt}>
            <Card className={`p-4 md:p-6 text-center ${getRankStyle(ranks[i])} cursor-pointer`} onClick={() => type === "artist" && navigate(`/artist/${entry.id}`)}>
              <div className="flex justify-center mb-3">{getRankIcon(ranks[i])}</div>
              <Avatar className={`${sizes[i].avatar} mx-auto mb-3 ${sizes[i].ring}`}>
                <AvatarImage src={entry.avatar || ""} />
                <AvatarFallback className={ranks[i] === 1 ? "text-2xl" : ""}>{entry.name[0]}</AvatarFallback>
              </Avatar>
              <h3 className="font-bold text-sm md:text-base truncate">{entry.name}</h3>
              {entry.subtitle && <p className="text-xs text-muted-foreground truncate">{entry.subtitle}</p>}
              <p className={`font-bold text-primary mt-2 ${ranks[i] === 1 ? "text-3xl" : ranks[i] === 2 ? "text-2xl" : "text-xl"}`}>{entry.score}</p>
              <p className="text-xs text-muted-foreground">{type === "artist" ? t("points") : t("creditsUnit")}</p>
            </Card>
          </div>
        ))}
      </div>
    );
  };

  const getRewardDisplay = (reward: SeasonReward, isMystery: boolean, isPast: boolean) => {
    if (isMystery && !isPast) return `🎁 ${t("seasonRewardToDiscover")}`;
    switch (reward.reward_type) {
      case "credits": return `💰 ${reward.credits_amount} ${t("creditsUnit")}`;
      case "virtual_gift": {
        const gift = gifts.find(g => g.id === reward.virtual_gift_id);
        return `🎁 ${gift?.name || t("adminSeasonsVirtualGift")}`;
      }
      case "physical": return `📦 ${reward.physical_description || t("adminSeasonsPhysical")}`;
      case "mystery": return isMystery && !isPast ? `🎁 ${t("seasonRewardToDiscover")}` : `🎁 ${t("adminSeasonsMysteryType")}`;
      default: return reward.reward_type;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEO title="Classement des artistes — Dual Music" description="Top artistes, fans et donateurs de la saison. Suivez le podium en direct sur Dual Music." path="/leaderboard" />
      <Header />
        <div className="flex-1 container mx-auto px-4 pt-24 pb-16 flex items-center justify-center min-h-[60vh]">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <Footer />
      </div>
    );
  }

  const artistPodium = artists.slice(0, 3).map(a => ({ name: a.stage_name || a.full_name || t("artistDefault"), avatar: a.avatar_url, score: a.score, id: a.user_id }));
  const donorPodium = donors.slice(0, 3).map(d => ({ name: d.full_name || t("donorDefault"), avatar: d.avatar_url, score: d.total_donated, id: d.user_id }));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 pt-24 pb-16 min-h-[80vh]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Trophy className="w-10 h-10 text-primary" />
              <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">{t("leaderboardTitle")}</h1>
            </div>
            <p className="text-muted-foreground">{t("leaderboardSubtitle")}</p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8">
              <TabsTrigger value="artists" className="flex items-center gap-2">
                <Swords className="w-4 h-4" />
                <span className="hidden sm:inline">{t("artists")}</span>
                <span className="sm:hidden">Top</span>
              </TabsTrigger>
              <TabsTrigger value="donors" className="flex items-center gap-2">
                <Heart className="w-4 h-4" />
                <span className="hidden sm:inline">{t("donorsTabLabel")}</span>
                <span className="sm:hidden">{t("donorsTabShort")}</span>
              </TabsTrigger>
              <TabsTrigger value="seasons" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span className="hidden sm:inline">{t("seasonsTabLabel")}</span>
                <span className="sm:hidden">{t("seasonsTabShort")}</span>
              </TabsTrigger>
            </TabsList>

            {/* Artists Tab */}
            <TabsContent value="artists">
              <Podium entries={artistPodium} type="artist" />
              <Card className="overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h2 className="font-semibold">{t("allArtists")}</h2>
                </div>
                <div className="divide-y divide-border">
                  {artists.map((artist, index) => (
                    <div key={artist.user_id} className={`flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors cursor-pointer ${getRankStyle(index + 1)}`} onClick={() => navigate(`/artist/${artist.user_id}`)}>
                      <div className="w-12 flex justify-center">{getRankIcon(index + 1)}</div>
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={artist.avatar_url || ""} />
                        <AvatarFallback>{(artist.stage_name || artist.full_name || "A")[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{artist.stage_name || artist.full_name || t("artistDefault")}</p>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {artist.total_votes} {t("votes")}</span>
                          <span className="flex items-center gap-1"><Gift className="w-3 h-3" /> {artist.total_gifts} {t("gifts")}</span>
                          <span className="flex items-center gap-1"><Swords className="w-3 h-3" /> {artist.total_wins} {t("wins")}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-primary">{artist.score}</p>
                        <p className="text-xs text-muted-foreground">{t("points")}</p>
                      </div>
                    </div>
                  ))}
                  {artists.length === 0 && <div className="p-8 text-center text-muted-foreground">{t("noArtistsLeaderboard")}</div>}
                </div>
              </Card>
            </TabsContent>

            {/* Donors Tab */}
            <TabsContent value="donors">
              <Podium entries={donorPodium} type="donor" />
              <Card className="overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h2 className="font-semibold">{t("topDonorsHeading")}</h2>
                </div>
                <div className="divide-y divide-border">
                  {donors.map((donor, index) => (
                    <div key={donor.user_id} className={`flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors ${getRankStyle(index + 1)}`}>
                      <div className="w-12 flex justify-center">{getRankIcon(index + 1)}</div>
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={donor.avatar_url || ""} />
                        <AvatarFallback>{(donor.full_name || "D")[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{donor.full_name || t("anonymousDonor")}</p>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Gift className="w-3 h-3" /> {donor.gifts_sent} {t("giftsCount")}</span>
                          <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {donor.votes_cast} {t("votes")}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-primary">{donor.total_donated}</p>
                        <p className="text-xs text-muted-foreground">{t("creditsUnit")}</p>
                      </div>
                    </div>
                  ))}
                  {donors.length === 0 && <div className="p-8 text-center text-muted-foreground">{t("noDonorsYet")}</div>}
                </div>
              </Card>
            </TabsContent>

            {/* Seasons Tab */}
            <TabsContent value="seasons">
              {(() => {
                const now = new Date();
                const activeSeasons = seasons.filter(s => {
                  const start = new Date(s.start_date);
                  const end = new Date(s.end_date);
                  return now >= start && now <= end && s.is_active;
                });
                const endedSeasons = seasons.filter(s => new Date(s.end_date) < now);

                const renderSeasonCard = (season: SeasonInfo) => {
                  const start = new Date(season.start_date);
                  const end = new Date(season.end_date);
                  const isActive = now >= start && now <= end && season.is_active;
                  const isPast = now > end;
                  const seasonRewards = rewards.filter(r => r.season_id === season.id).sort((a, b) => a.rank_position - b.rank_position);

                  return (
                    <Card key={season.id} className={`overflow-hidden ${isActive ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}>
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-3 gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-bold text-lg text-foreground">{season.name}</h3>
                              {isActive && <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{t("seasonActive")}</Badge>}
                              {isPast && <Badge variant="secondary">{t("seasonEnded")}</Badge>}
                              {!isActive && !isPast && <Badge variant="outline">{t("seasonUpcoming")}</Badge>}
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {season.type === "artist" ? t("seasonTypeArtist") : t("seasonTypeDonor")}
                            </Badge>
                          </div>
                          <div className="text-right text-xs sm:text-sm text-muted-foreground shrink-0">
                            <p>{formatTz(season.start_date, "d MMM yyyy HH:mm", { timezone: tz, language })}</p>
                            <p>→ {formatTz(season.end_date, "d MMM yyyy HH:mm", { timezone: tz, language })}</p>
                          </div>
                        </div>

                        {isActive && (
                          <div className="mt-3 mb-4">
                            <div className="w-full bg-muted rounded-full h-2">
                              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${Math.min(100, ((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100)}%` }} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))} {t("daysRemaining")}
                            </p>
                          </div>
                        )}

                        {seasonRewards.length > 0 && (
                          <div className="mt-4">
                            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                              <Star className="w-4 h-4 text-yellow-500" /> {t("seasonRewardsTitle")}
                            </h4>
                            <div className="space-y-2">
                              {seasonRewards.map(reward => (
                                <div key={reward.id} className={`flex items-center gap-3 p-3 rounded-lg ${reward.rank_position <= 3 ? getRankStyle(reward.rank_position) : "bg-muted/30"}`}>
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                                    {getRankIcon(reward.rank_position)}
                                  </div>
                                  <span className="text-sm font-medium w-8">#{reward.rank_position}</span>
                                  <span className="text-sm flex-1">
                                    {getRewardDisplay(reward, season.is_mystery_reward, isPast)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(isActive || isPast) && (
                          <div className="mt-4 border-t border-border pt-4">
                            <LiveSeasonLeaderboard
                              seasonId={season.id}
                              seasonType={season.type}
                              rewards={seasonRewards.map(r => ({ rank_position: r.rank_position, reward_type: r.reward_type, credits_amount: r.credits_amount, physical_description: r.physical_description }))}
                              isMystery={season.is_mystery_reward}
                              isPast={isPast}
                            />
                          </div>
                        )}

                        {isPast && (() => {
                          const sw = seasonWinners.filter(w => w.season_id === season.id);
                          if (sw.length === 0) return null;
                          return (
                            <div className="mt-4 border-t border-border pt-4">
                              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                <Trophy className="w-4 h-4 text-primary" /> {t("seasonWinnersHeading")}
                              </h4>
                              <div className="space-y-2">
                                {sw.map(winner => {
                                  const reward = seasonRewards.find(r => r.rank_position === winner.rank_position);
                                  return (
                                    <div key={winner.id} className={`flex items-center gap-3 p-3 rounded-lg ${winner.rank_position <= 3 ? getRankStyle(winner.rank_position) : "bg-muted/30"}`}>
                                      <div className="w-8 flex justify-center">{getRankIcon(winner.rank_position)}</div>
                                      <Avatar className="w-8 h-8">
                                        <AvatarImage src={winner.avatar_url || ""} />
                                        <AvatarFallback>{(winner.user_name || "?")[0]}</AvatarFallback>
                                      </Avatar>
                                      <span className="text-sm font-medium flex-1 truncate">{winner.user_name}</span>
                                      {reward && <span className="text-xs text-muted-foreground">{getRewardDisplay(reward, false, true)}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </Card>
                  );
                };

                const Pager = ({ page, setPage, total }: { page: number; setPage: (p: number) => void; total: number }) => {
                  const totalPages = Math.max(1, Math.ceil(total / SEASONS_PAGE_SIZE));
                  if (totalPages <= 1) return null;
                  return (
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(Math.max(1, page - 1))}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground px-3">{page} / {totalPages}</span>
                      <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(Math.min(totalPages, page + 1))}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                };

                if (seasons.length === 0) {
                  return <Card className="p-8 text-center text-muted-foreground">{t("noSeasonsYet")}</Card>;
                }

                const activePage = activeSeasons.slice((activeSeasonsPage - 1) * SEASONS_PAGE_SIZE, activeSeasonsPage * SEASONS_PAGE_SIZE);
                const endedPage = endedSeasons.slice((endedSeasonsPage - 1) * SEASONS_PAGE_SIZE, endedSeasonsPage * SEASONS_PAGE_SIZE);

                return (
                  <Tabs value={seasonsSubTab} onValueChange={(v) => setSeasonsSubTab(v as "active" | "ended")}>
                    <TabsList className="grid w-full grid-cols-2 mb-6">
                      <TabsTrigger value="active">{t("tabLive")} ({activeSeasons.length})</TabsTrigger>
                      <TabsTrigger value="ended">{t("seasonEnded")} ({endedSeasons.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="active">
                      {activeSeasons.length === 0 ? (
                        <Card className="p-8 text-center text-muted-foreground">{t("noSeasonsYet")}</Card>
                      ) : (
                        <>
                          <div className="space-y-6">{activePage.map(renderSeasonCard)}</div>
                          <Pager page={activeSeasonsPage} setPage={setActiveSeasonsPage} total={activeSeasons.length} />
                        </>
                      )}
                    </TabsContent>
                    <TabsContent value="ended">
                      {endedSeasons.length === 0 ? (
                        <Card className="p-8 text-center text-muted-foreground">{t("noSeasonsYet")}</Card>
                      ) : (
                        <>
                          <div className="space-y-6">{endedPage.map(renderSeasonCard)}</div>
                          <Pager page={endedSeasonsPage} setPage={setEndedSeasonsPage} total={endedSeasons.length} />
                        </>
                      )}
                    </TabsContent>
                  </Tabs>
                );
              })()}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Leaderboard;
