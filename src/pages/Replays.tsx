import { useState, useMemo } from "react";
import SEO from "@/components/seo/SEO";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { Play, Lock, Clock, Eye, Crown, Video } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useQuery } from "@tanstack/react-query";
import { listReplays } from "@/api/endpoints/replays";
import { batch as batchDuels } from "@/api/endpoints/duels";
import { getDisplayProfiles } from "@/api/endpoints/users";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { formatTz } from "@/lib/datetime";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { useUserSubscription } from "@/hooks/useSubscription";
import { AuthRequiredDialog } from "@/components/auth/AuthRequiredDialog";
import { SearchBar } from "@/components/ui/search-bar";
import { SimplePagination } from "@/components/ui/simple-pagination";
import { usePagination } from "@/hooks/usePagination";

const Replays = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const { rules, isProOrAbove } = useUserSubscription();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [search, setSearch] = useState("");

  const { data: replays, isLoading } = useQuery({
    queryKey: ["replays"],
    queryFn: async () => {
      const data = (await listReplays({ isPublic: "true" })) as any[];

      const duelIds = (data || []).filter(r => r.source_type === "duel" && r.duel_id).map(r => r.duel_id) as string[];
      if (duelIds.length === 0) return data;

      const dRows = ((await batchDuels(duelIds)) as any[]) || [];
      const allArtistIds = [...new Set(dRows.flatMap(d => [d.artist1_id, d.artist2_id]))];
      const profs = await getDisplayProfiles(allArtistIds as string[]);
      const pMap = new Map((profs || []).map(p => [p.id, p]));
      const dMap = new Map((dRows || []).map(d => [d.id, {
        ...d,
        artist1: pMap.get(d.artist1_id) || null,
        artist2: pMap.get(d.artist2_id) || null,
      }]));
      return (data || []).map((r: any) => ({ ...r, duel: r.duel_id ? dMap.get(r.duel_id) : null }));
    },
  });

  const formatCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(0)}K`;
    }
    return count.toString();
  };

  const canAccessPremiumReplay = (isPremium: boolean) => {
    if (!isPremium) return true;
    return rules.premium_replays;
  };

  const filteredReplays = useMemo(() => {
    const list = replays || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r: any) =>
      r.title?.toLowerCase().includes(q) ||
      r.duel?.artist1?.full_name?.toLowerCase().includes(q) ||
      r.duel?.artist2?.full_name?.toLowerCase().includes(q)
    );
  }, [replays, search]);

  const { page, setPage, pageCount, paginated } = usePagination(filteredReplays, 9);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Replays — Dual Music" description="Revivez les meilleurs duels et concerts en replay sur Dual Music." path="/replays" />
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
            {t("replaysPageTitle")}
          </h1>
          <p className="text-xl text-muted-foreground">
            {t("replaysPageSubtitle")}
          </p>
        </div>

        <SearchBar value={search} onChange={setSearch} placeholder={`${t("search") || "Rechercher"}...`} />

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-48 w-full" />
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full mb-4" />
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredReplays.length === 0 ? (
          <EmptyState icon={<Video />} title={t("noReplaysTitle")} description={t("noReplaysDesc")} />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {paginated.map((replay: any) => {
              const hasAccess = canAccessPremiumReplay(replay.is_premium);
              return (
                <Card 
                  key={replay.id} 
                  className="group hover:shadow-glow transition-all bg-card border-border overflow-hidden cursor-pointer" 
                  onClick={() => {
                    if (!currentUserId) { setShowAuthDialog(true); return; }
                    navigate(hasAccess ? `/replay/${replay.id}` : "/pricing");
                  }}
                >
                  <div className="relative">
                    <div className="h-48 relative overflow-hidden bg-gradient-to-br from-primary/20 via-background to-accent/20">
                      {(replay as any).duel?.artist1 || (replay as any).duel?.artist2 ? (
                        <div className="absolute inset-0 flex">
                          <div className="flex-1 relative overflow-hidden">
                            {(replay as any).duel?.artist1?.avatar_url ? (
                              <img
                                src={(replay as any).duel.artist1.avatar_url}
                                alt={(replay as any).duel.artist1.full_name}
                                className="w-full h-full object-cover"
                                style={{ clipPath: "polygon(0 0, 100% 0, 85% 100%, 0 100%)" }}
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-primary" style={{ clipPath: "polygon(0 0, 100% 0, 85% 100%, 0 100%)" }} />
                            )}
                          </div>
                          <div className="flex-1 relative overflow-hidden -ml-6">
                            {(replay as any).duel?.artist2?.avatar_url ? (
                              <img
                                src={(replay as any).duel.artist2.avatar_url}
                                alt={(replay as any).duel.artist2.full_name}
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

                      <div className="absolute inset-0 bg-background/40 group-hover:bg-background/20 transition-all flex items-center justify-center">
                        {replay.is_premium && !hasAccess ? (
                          <Lock className="w-12 h-12 text-foreground opacity-90" />
                        ) : (
                          <div className="rounded-full bg-background/70 backdrop-blur-sm p-4 group-hover:scale-110 transition-transform">
                            <Play className="w-8 h-8 text-foreground" fill="currentColor" />
                          </div>
                        )}
                      </div>
                      <Badge className="absolute top-2 right-2 bg-background/80 text-foreground">
                        <Clock className="w-3 h-3 mr-1" />
                        {replay.duration}
                      </Badge>
                      {(replay as any).source_type === "competition" || (replay as any).competition_id ? (
                        <Badge className="absolute top-2 left-2 bg-amber-600 text-white shadow-lg">
                          🏆 Compétition
                        </Badge>
                      ) : (replay as any).duel ? (
                        <Badge className="absolute top-2 left-2 bg-destructive text-destructive-foreground shadow-lg">
                          ⚔ VS
                        </Badge>
                      ) : replay.is_premium ? (
                        <Badge className="absolute top-2 left-2 bg-accent text-accent-foreground">
                          <Crown className="w-3 h-3 mr-1" />
                          Premium
                        </Badge>
                      ) : null}
                      {(replay as any).duel?.artist1 && (replay as any).duel?.artist2 && (
                        <div className="absolute bottom-2 left-2 right-16 flex items-center gap-1 text-xs text-foreground font-semibold drop-shadow-lg truncate">
                          <span className="truncate max-w-[40%]">{(replay as any).duel.artist1.full_name}</span>
                          <span className="text-accent">⚔</span>
                          <span className="truncate max-w-[40%]">{(replay as any).duel.artist2.full_name}</span>
                        </div>
                      )}
                      {replay.is_premium && !hasAccess && !(replay as any).duel && (
                        <Badge className="absolute bottom-2 left-2 bg-destructive text-destructive-foreground text-xs">
                          <Lock className="w-3 h-3 mr-1" />
                          {t("premiumReplayLocked")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardContent className="p-6">
                    <h3 className="text-xl font-bold mb-2 text-foreground">{replay.title}</h3>
                    <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                      <span>{formatTz(replay.recorded_date, "dd MMMM yyyy", { timezone: tz, language })}</span>
                      <div className="flex items-center gap-1">
                        <Eye className="w-4 h-4" />
                        <span>{formatCount(replay.views_count)} {t("viewsCount")}</span>
                      </div>
                    </div>
                    <Button 
                      className="w-full bg-gradient-primary hover:shadow-glow transition-all"
                      variant={replay.is_premium && !hasAccess ? "outline" : "default"}
                    >
                      {replay.is_premium && !hasAccess ? (
                        <>
                          <Lock className="w-4 h-4 mr-2" />
                          {t("upgradeNow")}
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          {t("watch")}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        {!isLoading && filteredReplays.length > 0 && (
          <SimplePagination page={page} pageCount={pageCount} onPageChange={setPage} />
        )}
      </main>

      <AuthRequiredDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
      <Footer />
    </div>
  );
};

export default Replays;
