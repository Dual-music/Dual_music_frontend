import { useState } from "react";
import SEO from "@/components/seo/SEO";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { Calendar, MapPin, Ticket, Radio, Play, Video, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useQuery } from "@tanstack/react-query";
import { usePresence } from "@/realtime/useRoom";
import * as concertsApi from "@/api/endpoints/concerts";
import { listReplays } from "@/api/endpoints/replays";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { formatTz } from "@/lib/datetime";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConcertReplayCard } from "@/components/concert/ConcertReplayCard";
import { ConcertReplayPlayer } from "@/components/concert/ConcertReplayPlayer";
import { AuthRequiredDialog } from "@/components/auth/AuthRequiredDialog";
import { PriceBadge } from "@/components/profile/PriceBadge";
import { SimplePagination } from "@/components/ui/simple-pagination";
import { usePagination } from "@/hooks/usePagination";
import { SearchBar } from "@/components/ui/search-bar";

const Concerts = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const [selectedReplay, setSelectedReplay] = useState<any | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [search, setSearch] = useState("");

  const { data: concerts = [], isLoading: isConcertsLoading } = useQuery({
    queryKey: ["all-concerts", language],
    queryFn: async () => {
      const regularConcerts = (await concertsApi.listConcerts({ limit: 100 })) as any[];
      const artistConcerts = (await concertsApi.listArtistConcerts({ limit: 100 })) as any[];

      const mappedArtistConcerts = artistConcerts.map((c: any) => ({
        id: c.id, title: c.title, artist_name: c.artist?.full_name || t("artistDefault"),
        description: c.description, scheduled_date: c.scheduled_date,
        scheduled_time: new Date(c.scheduled_date).toLocaleTimeString(language === "fr" ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
        location: t("online"), ticket_price: c.ticket_price, max_tickets: c.max_tickets,
        stream_url: c.stream_url, status: c.status, image_url: c.cover_image_url,
        is_artist_concert: true, recording_url: c.recording_url, is_replay_available: c.is_replay_available,
      }));

      return [
        ...regularConcerts.map((c: any) => ({ ...c, is_artist_concert: false, recording_url: c.recording_url, is_replay_available: c.is_replay_available })),
        ...mappedArtistConcerts
      ].sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());
    },
  });

  const { data: publicReplayRows = [], isLoading: isReplayLoading } = useQuery({
    queryKey: ["public-concert-replays"],
    queryFn: async () => {
      const data = (await listReplays({ sourceType: "concert", isPublic: "true", limit: 100 })) as any[];
      return data || [];
    },
  });

  const isLoading = isConcertsLoading || isReplayLoading;

  const liveConcerts = concerts.filter(c => c.status === "live");
  const upcomingConcerts = concerts.filter(c => c.status === "upcoming" || c.status === "scheduled");
  const concertById = new Map(concerts.map((concert) => [concert.id, concert]));
  const replayConcerts = publicReplayRows
    .map((replay) => {
      if (!replay.video_url) return null;
      const sourceConcert = replay.concert_id ? concertById.get(replay.concert_id) : undefined;

      return {
        ...(sourceConcert || {}),
        id: replay.concert_id || replay.id,
        replay_id: replay.id,
        title: replay.title || sourceConcert?.title || "Concert",
        artist_name: sourceConcert?.artist_name || t("artistDefault"),
        scheduled_date: sourceConcert?.scheduled_date || replay.recorded_date,
        ticket_price: replay.replay_price ?? sourceConcert?.ticket_price ?? 0,
        image_url: replay.thumbnail_url || sourceConcert?.image_url,
        recording_url: replay.video_url,
        is_replay_available: true,
      };
    })
    .filter(Boolean) as any[];

  const matchesSearch = (c: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (c.title?.toLowerCase().includes(q) || c.artist_name?.toLowerCase().includes(q));
  };
  const filteredLive = liveConcerts.filter(matchesSearch);
  const filteredUpcoming = upcomingConcerts.filter(matchesSearch);
  const filteredReplays = replayConcerts.filter(matchesSearch);

  const getStatusBadge = (concert: any) => {
    if (concert.status === "live") {
      return <Badge className="bg-red-500 text-white animate-pulse"><Radio className="w-3 h-3 mr-1" />{t("live")}</Badge>;
    }
    return <PriceBadge credits={Number(concert.ticket_price) || 0} variant="overlay" />;
  };

  const ConcertCard = ({ concert }: { concert: any }) => {
    const viewerCount = usePresence("concert", concert.status === "live" ? concert.id : null);
    return (
    <Card
      className={`group hover:shadow-glow transition-all bg-card border-border overflow-hidden cursor-pointer ${concert.status === "live" ? "ring-2 ring-red-500" : ""}`}
      onClick={() => {
        if (!currentUserId) { setShowAuthDialog(true); return; }
        navigate(concert.status === "live" ? `/concert/${concert.id}/live` : `/concert/${concert.id}`);
      }}
    >
      <div className="h-48 bg-cover bg-center relative" style={{ backgroundImage: concert.image_url ? `url(${concert.image_url})` : 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))' }}>
        {concert.status === "live" && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Play className="w-12 h-12 fill-white text-white" />
          </div>
        )}
      </div>
      <CardContent className="p-6">
        {getStatusBadge(concert)}
        <h3 className="text-2xl font-bold mb-2 text-foreground mt-4">{concert.artist_name}</h3>
        <p className="text-lg text-muted-foreground mb-4">{concert.title}</p>
        <div className="space-y-2 mb-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">{formatTz(concert.scheduled_date, "dd MMMM yyyy", { timezone: tz, language })} • {concert.scheduled_time}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span className="text-sm">{concert.location}</span>
          </div>
          {concert.status === "live" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span className="text-sm">{viewerCount} {t("viewers")}</span>
            </div>
          )}
        </div>
        <Button className={`w-full ${concert.status === "live" ? "bg-red-500 hover:bg-red-600" : "bg-gradient-primary hover:shadow-glow"} transition-all`}>
          {concert.status === "live" ? t("watchLiveConcert") : t("buyTicket")}
        </Button>
      </CardContent>
    </Card>
    );
  };

  const handlePlayReplay = (concert: any, hasAccess: boolean) => {
    if (hasAccess && concert.recording_url) { setSelectedReplay(concert); setShowPlayer(true); }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Concerts en direct — Dual Music" description="Tous les concerts live et programmés sur Dual Music. Achetez votre ticket et vivez la musique en temps réel." path="/concerts" />
      <Header />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">{t("concertsPageTitle")}</h1>
          <p className="text-xl text-muted-foreground">{t("concertsPageSubtitle")}</p>
        </div>

        <SearchBar value={search} onChange={setSearch} placeholder={`${t("search") || "Rechercher"}...`} />

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="overflow-hidden"><Skeleton className="h-48 w-full" /><CardContent className="p-6"><Skeleton className="h-6 w-20 mb-4" /><Skeleton className="h-8 w-3/4 mb-2" /><Skeleton className="h-10 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <Tabs defaultValue={filteredLive.length > 0 ? "live" : "upcoming"} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8">
              <TabsTrigger value="live" className="relative">
                {t("tabLive")} ({filteredLive.length})
                {filteredLive.length > 0 && <span className="ml-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
              </TabsTrigger>
              <TabsTrigger value="upcoming">{t("tabUpcoming")} ({filteredUpcoming.length})</TabsTrigger>
              <TabsTrigger value="replays" className="flex items-center gap-1"><Video className="w-4 h-4" />{t("tabReplays")} ({filteredReplays.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="live">
              {filteredLive.length > 0 ? (
                <PaginatedGrid items={filteredLive} render={(c: any) => <ConcertCard key={c.id} concert={c} />} />
              ) : (
                <EmptyState icon={<Radio />} title={t("noConcertsLive")} description={t("concertsLiveEmptyDesc")} />
              )}
            </TabsContent>

            <TabsContent value="upcoming">
              {filteredUpcoming.length > 0 ? (
                <PaginatedGrid items={filteredUpcoming} render={(c: any) => <ConcertCard key={c.id} concert={c} />} />
              ) : (
                <EmptyState icon={<Calendar />} title={t("noConcertsUpcoming")} description={t("concertsUpcomingEmptyDesc")} />
              )}
            </TabsContent>


            <TabsContent value="replays">
              {filteredReplays.length > 0 ? (
                <PaginatedGrid items={filteredReplays} render={(c: any) => <ConcertReplayCard key={c.id} concert={c} onPlay={handlePlayReplay} />} />
              ) : (
                <EmptyState icon={<Video />} title={t("noConcertReplays")} description={t("concertsReplaysEmptyDesc")} />
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>
      <AuthRequiredDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
      <Footer />
      <ConcertReplayPlayer concert={selectedReplay} open={showPlayer} onClose={() => { setShowPlayer(false); setSelectedReplay(null); }} />
    </div>
  );
};

const PaginatedGrid = ({ items, render }: { items: any[]; render: (item: any) => React.ReactNode }) => {
  const { page, setPage, pageCount, paginated } = usePagination(items, 9);
  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{paginated.map(render)}</div>
      <SimplePagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  );
};

export default Concerts;
