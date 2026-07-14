/**
 * Page: Competitions — annuaire public des compétitions musicales
 * (en direct, à venir, replays). Organisation en onglets comme
 * la page Concerts. Les compétitions terminées ne sont plus
 * affichées en carte, seuls leurs replays apparaissent.
 *
 * EN — Public competition directory with Live/Upcoming/Replays tabs.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO from "@/components/seo/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { listCompetitions, myTickets as fetchMyTickets } from "@/api/endpoints/competitions";
import { listReplays } from "@/api/endpoints/replays";
import { formatTz } from "@/lib/datetime";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { Trophy, MapPin, Globe, Radio, Calendar, Video, Play, Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { AuthRequiredDialog } from "@/components/auth/AuthRequiredDialog";
import { PriceBadge } from "@/components/profile/PriceBadge";

const Competitions = () => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const navigate = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [replays, setReplays] = useState<any[]>([]);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [myTickets, setMyTickets] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const [pub, live] = await Promise.all([
          listCompetitions({ status: "published", limit: 100 }),
          listCompetitions({ status: "live", limit: 100 }),
        ]);
        const merged = [...(pub as any[]), ...(live as any[])].sort(
          (a, b) => new Date(a.start_at || 0).getTime() - new Date(b.start_at || 0).getTime(),
        );
        setList(merged);
      } catch {
        setList([]);
      }

      try {
        const reps = await listReplays({ sourceType: "competition", isPublic: "true", limit: 100 });
        setReplays(reps || []);
      } catch {
        setReplays([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!currentUserId) { setMyTickets(new Set()); return; }
    let active = true;
    (async () => {
      try {
        const ids = await fetchMyTickets();
        if (active) setMyTickets(new Set((ids as string[]) || []));
      } catch {
        if (active) setMyTickets(new Set());
      }
    })();
    return () => { active = false; };
  }, [currentUserId]);

  // A competition is considered live if its status is live, or if it's
  // published and the start time has passed (and it hasn't ended yet).
  const isLiveNow = (c: any) => {
    if (c.status === "live") return true;
    if (c.status !== "published") return false;
    const now = Date.now();
    const start = c.start_at ? new Date(c.start_at).getTime() : 0;
    const end = c.end_at ? new Date(c.end_at).getTime() : Number.POSITIVE_INFINITY;
    return start > 0 && start <= now && now < end;
  };

  const hasAccess = (c: any) => {
    const price = Number(c.viewer_ticket_price) || 0;
    if (price <= 0) return true;
    if (c.manager_id && c.manager_id === currentUserId) return true;
    return myTickets.has(c.id);
  };

  const liveList = list.filter(isLiveNow);
  const upcomingList = list.filter((c) => !isLiveNow(c));

  const openCompetition = (c: any) => {
    if (!currentUserId) { setShowAuthDialog(true); return; }
    navigate(isLiveNow(c) ? `/competition/${c.id}/live` : `/competition/${c.id}`);
  };


  const CompetitionCard = ({ c }: { c: any }) => {
    const live = isLiveNow(c);
    const canWatch = hasAccess(c);
    return (
      <Card
        className={`overflow-hidden cursor-pointer hover:border-primary/50 hover:shadow-glow transition-all ${live ? "ring-2 ring-red-500" : ""}`}
        onClick={() => openCompetition(c)}
      >
        <div
          className="h-48 bg-cover bg-center relative"
          style={{ backgroundImage: c.cover_url ? `url(${c.cover_url})` : "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))" }}
        >
          {live && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Play className="w-12 h-12 fill-white text-white" />
            </div>
          )}
          {live ? (
            <Badge className="absolute top-2 left-2 bg-red-500 text-white animate-pulse">
              <Radio className="w-3 h-3 mr-1" />{t("live")}
            </Badge>
          ) : (
            <PriceBadge credits={Number(c.viewer_ticket_price) || 0} variant="overlay" className="absolute top-2 left-2" />
          )}
          <Badge variant="outline" className="absolute top-2 right-2 bg-background/80">
            {c.mode === "online" ? <Globe className="w-3 h-3 mr-1" /> : <MapPin className="w-3 h-3 mr-1" />}
            {t(c.mode === "online" ? "compOnline" : "compOnsite")}
          </Badge>
        </div>
        <CardContent className="p-6 space-y-2">
          <h3 className="text-xl font-bold">{c.title}</h3>
          {c.description && <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>{formatTz(c.start_at, "PPp", { timezone: prefs.timezone, language })}</span>
          </div>
          <Button className={`w-full mt-2 ${live ? "bg-red-500 hover:bg-red-600" : "bg-gradient-primary hover:shadow-glow"} transition-all`}>
            {live || canWatch ? (t("watchLive") || t("watchLiveConcert")) : t("buyTicket")}
          </Button>
        </CardContent>
      </Card>
    );
  };


  const ReplayCard = ({ r }: { r: any }) => {
    const isPremium = !!r.is_premium || Number(r.replay_price) > 0;
    return (
      <Card
        className="overflow-hidden cursor-pointer hover:shadow-glow transition-all"
        onClick={() => {
          if (!currentUserId) { setShowAuthDialog(true); return; }
          navigate(`/replay/${r.id}`);
        }}
      >
        <div
          className="h-48 bg-cover bg-center relative"
          style={{ backgroundImage: r.thumbnail_url ? `url(${r.thumbnail_url})` : "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))" }}
        >
          <div className="absolute inset-0 bg-background/40 hover:bg-background/20 transition-all flex items-center justify-center">
            {isPremium ? <Lock className="w-12 h-12 text-foreground opacity-90" /> : <Play className="w-12 h-12 text-foreground opacity-90" />}
          </div>
          <Badge className="absolute top-2 right-2 bg-green-500/90 text-white">
            <Video className="w-3 h-3 mr-1" />{t("replayAvailable")}
          </Badge>
          {isPremium && (
            <PriceBadge credits={Number(r.replay_price) || 0} variant="overlay" className="absolute top-2 left-2" />
          )}
        </div>
        <CardContent className="p-6 space-y-2">
          <h3 className="text-xl font-bold">{r.title}</h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>{formatTz(r.recorded_date, "dd MMMM yyyy", { timezone: prefs.timezone, language })}</span>
          </div>
          <Button className="w-full mt-2 bg-gradient-primary hover:shadow-glow" variant={isPremium ? "outline" : "default"}>
            {isPremium ? <><Lock className="w-4 h-4 mr-2" />{t("unlockReplay")}</> : <><Play className="w-4 h-4 mr-2" />{t("watch")}</>}
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title={`${t("competitions")} — Synergy Network`} description={t("competitions")} />
      <Header />
      <main className="container mx-auto px-4 pt-24 pb-16 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center gap-3">
            <Trophy className="w-8 h-8 text-primary" /> {t("competitions")}
          </h1>
          <Button onClick={() => navigate("/competition-management")} variant="outline">{t("compManagement")}</Button>
        </div>

        <Tabs defaultValue={liveList.length > 0 ? "live" : "upcoming"} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="live" className="relative">
              {t("tabLive")} ({liveList.length})
              {liveList.length > 0 && <span className="ml-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
            </TabsTrigger>
            <TabsTrigger value="upcoming">{t("tabUpcoming")} ({upcomingList.length})</TabsTrigger>
            <TabsTrigger value="replays" className="flex items-center gap-1">
              <Video className="w-4 h-4" />{t("tabReplays")} ({replays.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="live">
            {liveList.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {liveList.map((c) => <CompetitionCard key={c.id} c={c} />)}
              </div>
            ) : (
              <EmptyState icon={<Radio />} title={t("noConcertsLive")} description={t("compEmptyDesc")} />
            )}
          </TabsContent>

          <TabsContent value="upcoming">
            {upcomingList.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {upcomingList.map((c) => <CompetitionCard key={c.id} c={c} />)}
              </div>
            ) : (
              <EmptyState
                icon={<Trophy />}
                title={t("compNoCompetitions")}
                description={t("compEmptyDesc")}
                action={{ label: t("compManagement"), onClick: () => navigate("/competition-management"), variant: "outline" }}
              />
            )}
          </TabsContent>

          <TabsContent value="replays">
            {replays.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {replays.map((r) => <ReplayCard key={r.id} r={r} />)}
              </div>
            ) : (
              <EmptyState icon={<Video />} title={t("noConcertReplays")} description={t("compEmptyDesc")} />
            )}
          </TabsContent>
        </Tabs>
      </main>
      <AuthRequiredDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
      <Footer />
    </div>
  );
};

export default Competitions;
