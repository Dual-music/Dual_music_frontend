import { useEffect, useState } from "react";
import SEO from "@/components/seo/SEO";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { Flame, Users, Trophy, Calendar, Play, Eye, Clock, Video } from "lucide-react";
import { usePresence } from "@/realtime/useRoom";
import { listDuels, votesBatch } from "@/api/endpoints/duels";
import { listReplays } from "@/api/endpoints/replays";
import { useAuth } from "@/contexts/AuthContext";
import { AuthRequiredDialog } from "@/components/auth/AuthRequiredDialog";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import { SimplePagination } from "@/components/ui/simple-pagination";
import { usePagination } from "@/hooks/usePagination";
import { SearchBar } from "@/components/ui/search-bar";
import { EmptyState } from "@/components/ui/empty-state";

interface DuelVotes {
  [duelId: string]: { artist1: number; artist2: number };
}

const DuelViewerCount = ({ duelId }: { duelId: string }) => {
  const count = usePresence("duel", duelId);
  return <>{count.toLocaleString()}</>;
};

const Duels = () => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const [duels, setDuels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-duel vote tallies, populated from the bulk /duels/votes/batch endpoint.
  const [votes, setVotes] = useState<DuelVotes>({});
  const [replays, setReplays] = useState<Record<string, string>>({});
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [duelReplays, setDuelReplays] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchDuels = async () => {
      // Duel rows come already hydrated with artist1/artist2 display profiles.
      const duelsData = (await listDuels({ limit: 100 })) as any[];

      setDuels(duelsData);

      // Per-duel vote tallies in one bulk call; map each artist tally onto the
      // duel's artist1/artist2 slots. Graceful fallback: keep zeros on failure.
      try {
        const tallies = await votesBatch(duelsData.map((d) => d.id));
        const byDuel: DuelVotes = {};
        duelsData.forEach((d) => { byDuel[d.id] = { artist1: 0, artist2: 0 }; });
        tallies.forEach((t) => {
          const duel = duelsData.find((d) => d.id === t.duel_id);
          if (!duel) return;
          const entry = byDuel[t.duel_id] || { artist1: 0, artist2: 0 };
          if (t.artist_id === duel.artist1_id) entry.artist1 = Number(t.total) || 0;
          else if (t.artist_id === duel.artist2_id) entry.artist2 = Number(t.total) || 0;
          byDuel[t.duel_id] = entry;
        });
        setVotes(byDuel);
      } catch {
        /* non-blocking: vote tallies stay at 0 if the bulk call fails */
      }

      const endedIds = duelsData.filter(d => d.status === "ended").map(d => d.id);
      if (endedIds.length > 0) {
        const endedReplays = (await listReplays({ sourceType: "duel", limit: 100 })) as any[];
        const replayMap: Record<string, string> = {};
        endedReplays.forEach((r: any) => { if (r.duel_id && endedIds.includes(r.duel_id)) replayMap[r.duel_id] = r.id; });
        setReplays(replayMap);
      }

      // Fetch public duel replays + enrich with both artists from the duels list
      const replayData = (await listReplays({ sourceType: "duel", isPublic: "true", limit: 100 })) as any[];

      if (replayData && replayData.length > 0) {
        const duelById = new Map<string, any>(duelsData.map((d: any) => [d.id, d]));
        const enriched = replayData.map((r: any) => ({
          ...r,
          duel: r.duel_id ? duelById.get(r.duel_id) || null : null,
        }));
        setDuelReplays(enriched);
      } else {
        setDuelReplays([]);
      }

      setLoading(false);
    };

    // realtime removed (no backend emit); data loads on mount + on action (list refetches on nav).
    fetchDuels();
  }, []);

  const matchesDuelSearch = (d: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return d.artist1?.full_name?.toLowerCase().includes(q) || d.artist2?.full_name?.toLowerCase().includes(q);
  };
  const liveDuels = duels.filter(d => d.status === "live").filter(matchesDuelSearch);
  const upcomingDuels = duels.filter(d => d.status === "upcoming").filter(matchesDuelSearch);
  const endedDuels = duels.filter(d => d.status === "ended").filter(matchesDuelSearch);
  const filteredDuelReplays = duelReplays.filter((r: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.title?.toLowerCase().includes(q) || r.duel?.artist1?.full_name?.toLowerCase().includes(q) || r.duel?.artist2?.full_name?.toLowerCase().includes(q);
  });

  const dateLocaleStr = language === "fr" ? "fr-FR" : "en-US";

  const renderDuelCard = (duel: any) => {
    const duelVotes = votes[duel.id] || { artist1: 0, artist2: 0 };
    const totalVotes = duelVotes.artist1 + duelVotes.artist2;

    return (
      <Card key={duel.id} className="group hover:shadow-glow transition-all bg-card border-border">
        <CardContent className="p-6">
          {duel.status === "live" && (
            <Badge className="mb-4 bg-destructive text-destructive-foreground animate-pulse">
              <Flame className="w-3 h-3 mr-1" />
              {t("live")}
            </Badge>
          )}
          {duel.status === "upcoming" && (
            <Badge className="mb-4 bg-secondary text-secondary-foreground">
              {t("upcoming")}
            </Badge>
          )}
          {duel.status === "ended" && (
            <Badge className="mb-4" variant="outline">
              {t("ended")}
            </Badge>
          )}

          {duel.scheduled_time && (
            <div className="flex items-center gap-1 mb-2 text-sm text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              {formatTz(duel.scheduled_time, "dd MMM yyyy HH:mm", { timezone: tz, language })}
            </div>
          )}

          <div className="mb-4">
            {Number(duel.ticket_price) > 0 ? (
              <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/40 border">
                {t("duelPaid")} • {Number(duel.ticket_price).toLocaleString()} {t("creditUnit")}
              </Badge>
            ) : (
              <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/40 border">
                {t("duelFree")}
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between mb-6">
            <div className="text-center flex-1">
              {duel.artist1?.avatar_url ? (
                <img src={duel.artist1.avatar_url} alt={duel.artist1.full_name} className="w-16 h-16 mx-auto mb-2 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-gradient-primary" />
              )}
              <h3 className="font-bold text-foreground">{duel.artist1?.full_name || t("artist1Default")}</h3>
              <p className="text-sm font-semibold text-primary">{duelVotes.artist1} {t("votes")}</p>
            </div>

            <div className="px-4">
              <Trophy className="w-8 h-8 text-accent" />
            </div>

            <div className="text-center flex-1">
              {duel.artist2?.avatar_url ? (
                <img src={duel.artist2.avatar_url} alt={duel.artist2.full_name} className="w-16 h-16 mx-auto mb-2 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-gradient-electric" />
              )}
              <h3 className="font-bold text-foreground">{duel.artist2?.full_name || t("artist2Default")}</h3>
              <p className="text-sm font-semibold text-primary">{duelVotes.artist2} {t("votes")}</p>
            </div>
          </div>

          {totalVotes > 0 && (
            <div className="mb-4 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-primary transition-all"
                style={{ width: `${(duelVotes.artist1 / totalVotes) * 100}%` }}
              />
            </div>
          )}

          {duel.status === "live" && (
            <div className="flex items-center justify-center gap-2 mb-4 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span className="text-sm"><DuelViewerCount duelId={duel.id} /> {t("viewers")}</span>
            </div>
          )}

          <Button
            onClick={() => {
              if (!currentUserId) {
                setShowAuthDialog(true);
                return;
              }
              if (duel.status === "ended" && replays[duel.id]) {
                navigate(`/replay/${replays[duel.id]}`);
              } else if (duel.status === "ended") {
                navigate(`/replays`);
              } else {
                navigate(`/duel/${duel.id}`);
              }
            }}
            className="w-full bg-gradient-primary hover:shadow-glow transition-all"
          >
            {duel.status === "live" ? t("vote") : duel.status === "ended" ? t("viewReplay") : t("viewDuel")}
          </Button>
        </CardContent>
      </Card>
    );
  };

  const PaginatedDuelList = ({ list, emptyMessage, emptyIcon }: { list: any[]; emptyMessage: string; emptyIcon?: React.ReactNode }) => {
    const { page, setPage, pageCount, paginated } = usePagination(list, 9);
    if (list.length === 0) {
      return <EmptyState icon={emptyIcon || <Flame />} title={emptyMessage} description={t("duelsEmptyDesc")} />;
    }
    return (
      <>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {paginated.map(renderDuelCard)}
        </div>
        <SimplePagination page={page} pageCount={pageCount} onPageChange={setPage} />
      </>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Duels en direct — Dual Music" description="Découvrez tous les duels musicaux en cours et à venir. Votez en direct pour votre artiste favori et faites-le gagner." path="/duels" />
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
            {t("duelsPageTitle")}
          </h1>
          <p className="text-xl text-muted-foreground">
            {t("duelsPageSubtitle")}
          </p>
          </div>

          <SearchBar value={search} onChange={setSearch} placeholder={`${t("search") || "Rechercher"}...`} />

          {loading ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">{t("loadingDuels")}</p>
          </div>
        ) : (
          <Tabs defaultValue="live" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8">
              <TabsTrigger value="live" className="flex items-center gap-2">
                <Flame className="w-4 h-4" />
                {t("tabLive")} ({liveDuels.length})
              </TabsTrigger>
              <TabsTrigger value="upcoming" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {t("tabUpcoming")} ({upcomingDuels.length})
              </TabsTrigger>
              <TabsTrigger value="replays" className="flex items-center gap-2">
                <Video className="w-4 h-4" />
                {t("tabReplays")} ({filteredDuelReplays.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="live">
              <PaginatedDuelList list={liveDuels} emptyMessage={t("noDuelsLive")} emptyIcon={<Flame />} />
            </TabsContent>
            <TabsContent value="upcoming">
              <PaginatedDuelList list={upcomingDuels} emptyMessage={t("noDuelsUpcoming")} emptyIcon={<Calendar />} />
            </TabsContent>
            <TabsContent value="replays">
              <PaginatedDuelReplays
                replays={filteredDuelReplays}
                navigate={navigate}
                currentUserId={currentUserId}
                setShowAuthDialog={setShowAuthDialog}
                tz={tz}
                language={language}
                t={t}
              />
            </TabsContent>
          </Tabs>
        )}
      </main>

      <AuthRequiredDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
      <Footer />
    </div>
  );
};

const PaginatedDuelReplays = ({ replays, navigate, currentUserId, setShowAuthDialog, tz, language, t }: any) => {
  const { page, setPage, pageCount, paginated } = usePagination(replays, 9);
  if (replays.length === 0) {
    return <EmptyState icon={<Video />} title={t("noDuelReplays")} description={t("duelsEmptyDesc")} />;
  }
  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {paginated.map((replay: any) => (
          <Card
            key={replay.id}
            className="group hover:shadow-glow transition-all bg-card border-border overflow-hidden cursor-pointer"
            onClick={() => {
              if (!currentUserId) { setShowAuthDialog(true); return; }
              navigate(`/replay/${replay.id}`);
            }}
          >
            <div className="relative h-48 overflow-hidden bg-gradient-to-br from-primary/20 via-background to-accent/20">
              {replay.duel?.artist1 || replay.duel?.artist2 ? (
                <div className="absolute inset-0 flex">
                  <div className="flex-1 relative overflow-hidden">
                    {replay.duel?.artist1?.avatar_url ? (
                      <img
                        src={replay.duel.artist1.avatar_url}
                        alt={replay.duel.artist1.full_name}
                        className="w-full h-full object-cover"
                        style={{ clipPath: "polygon(0 0, 100% 0, 85% 100%, 0 100%)" }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-primary" style={{ clipPath: "polygon(0 0, 100% 0, 85% 100%, 0 100%)" }} />
                    )}
                  </div>
                  <div className="flex-1 relative overflow-hidden -ml-6">
                    {replay.duel?.artist2?.avatar_url ? (
                      <img
                        src={replay.duel.artist2.avatar_url}
                        alt={replay.duel.artist2.full_name}
                        className="w-full h-full object-cover"
                        style={{ clipPath: "polygon(15% 0, 100% 0, 100% 100%, 0 100%)" }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-electric" style={{ clipPath: "polygon(15% 0, 100% 0, 100% 100%, 0 100%)" }} />
                    )}
                  </div>
                </div>
              ) : replay.thumbnail_url ? (
                <img src={replay.thumbnail_url} alt={replay.title} className="w-full h-full object-cover" />
              ) : null}

              <div className="absolute inset-0 bg-background/30 group-hover:bg-background/10 transition-all flex items-center justify-center">
                <div className="rounded-full bg-background/70 backdrop-blur-sm p-4 group-hover:scale-110 transition-transform">
                  <Play className="w-8 h-8 text-foreground" fill="currentColor" />
                </div>
              </div>

              <Badge className="absolute top-2 left-2 bg-destructive text-destructive-foreground shadow-lg">
                <Trophy className="w-3 h-3 mr-1" />
                VS
              </Badge>

              <Badge className="absolute bottom-2 right-2 bg-background/80 text-foreground">
                <Clock className="w-3 h-3 mr-1" />
                {replay.duration}
              </Badge>

              {replay.duel?.artist1 && replay.duel?.artist2 && (
                <div className="absolute bottom-2 left-2 right-16 flex items-center gap-1 text-xs text-foreground font-semibold drop-shadow-lg truncate">
                  <span className="truncate max-w-[40%]">{replay.duel.artist1.full_name}</span>
                  <span className="text-accent">⚔</span>
                  <span className="truncate max-w-[40%]">{replay.duel.artist2.full_name}</span>
                </div>
              )}
            </div>
            <CardContent className="p-4">
              <h3 className="font-bold text-lg mb-2 text-foreground line-clamp-1">{replay.title}</h3>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  <span>{replay.views_count || 0} {t("views")}</span>
                </div>
                <span>{formatTz(replay.recorded_date, "d MMM yyyy", { timezone: tz, language })}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <SimplePagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  );
};

export default Duels;
