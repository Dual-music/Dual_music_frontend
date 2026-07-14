import { useState } from "react";
import SEO from "@/components/seo/SEO";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { Radio, Users, Video as VideoIcon, Plus, Eye } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useQuery } from "@tanstack/react-query";
import { usePresence } from "@/realtime/useRoom";
import { createLive, listLives } from "@/api/endpoints/lives";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { AuthRequiredDialog } from "@/components/auth/AuthRequiredDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SimplePagination } from "@/components/ui/simple-pagination";
import { usePagination } from "@/hooks/usePagination";
import { SearchBar } from "@/components/ui/search-bar";

const Lives = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, hasRole } = useAuth();
  const currentUserId = user?.id ?? null;
  const isArtist = hasRole("artist");
  const [liveTitle, setLiveTitle] = useState("");
  const [startingLive, setStartingLive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [search, setSearch] = useState("");

  const { data: lives, isLoading } = useQuery({
    queryKey: ["artist-lives"],
    queryFn: async () => {
      // Live rows come already hydrated with the artist's display profile.
      const data = (await listLives({ limit: 100 })) as any[];
      return data.map((l: any) => ({
        ...l,
        artist_name: l.artist?.full_name || t("artistDefault"),
        artist_avatar: l.artist?.avatar_url,
      }));
    },
    refetchInterval: 10000,
  });

  const activeLives = (lives?.filter(l => l.status === "live") || []).filter((l: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return l.artist_name?.toLowerCase().includes(q) || l.title?.toLowerCase().includes(q);
  });

  const startLive = async () => {
    if (!currentUserId) return;
    setStartingLive(true);
    try {
      const data = await createLive({ title: liveTitle || t("liveDefault") });
      setDialogOpen(false);
      navigate(`/live/${(data as { id: string }).id}`);
    } catch (err: any) {
      toast({ title: t("error"), description: err.message, variant: "destructive" });
    } finally {
      setStartingLive(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Lives spontanés — Dual Music" description="Rejoignez les lives spontanés des artistes en ce moment. Chat, cadeaux et soutien direct." path="/lives" />
      <Header />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
              {t("livesPageTitle")}
            </h1>
            <p className="text-muted-foreground">
              {t("livesPageSubtitle")}
            </p>
          </div>

          {isArtist && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-primary hover:shadow-glow gap-2">
                  <Plus className="w-5 h-5" />
                  {t("startLive")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("startLiveTitle")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    placeholder={t("liveTitlePlaceholder")}
                    value={liveTitle}
                    onChange={(e) => setLiveTitle(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("liveFanDescription")}
                  </p>
                  <Button onClick={startLive} disabled={startingLive} className="w-full bg-gradient-primary">
                    {startingLive ? t("startingLive") : t("beginLive")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <SearchBar value={search} onChange={setSearch} placeholder={`${t("search") || "Rechercher"}...`} />

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-48 w-full" />
                <CardContent className="p-4">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {activeLives.length > 0 ? (
              <PaginatedLives
                lives={activeLives}
                navigate={navigate}
                currentUserId={currentUserId}
                setShowAuthDialog={setShowAuthDialog}
                t={t}
              />
            ) : (
              <EmptyState
                icon={<Radio />}
                title={t("noLivesActive")}
                description={isArtist ? t("noLivesArtistHint") : t("noLivesFanHint")}
              />
            )}
          </>
        )}
      </main>
      <AuthRequiredDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
      <Footer />
    </div>
  );
};

const LiveViewerCount = ({ liveId }: { liveId: string }) => {
  const count = usePresence("live", liveId);
  return <>{count}</>;
};

const PaginatedLives = ({ lives, navigate, currentUserId, setShowAuthDialog, t }: any) => {
  const { page, setPage, pageCount, paginated } = usePagination(lives, 9);
  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {paginated.map((live: any) => (
          <Card
            key={live.id}
            className="group hover:shadow-glow transition-all bg-card border-border overflow-hidden cursor-pointer ring-2 ring-red-500/50"
            onClick={() => {
              if (!currentUserId) { setShowAuthDialog(true); return; }
              navigate(`/live/${live.id}`);
            }}
          >
            <div className="relative h-48 bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
              <Avatar className="w-20 h-20 border-4 border-primary">
                <AvatarImage src={live.artist_avatar} />
                <AvatarFallback className="text-2xl">{live.artist_name?.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="absolute top-3 left-3">
                <Badge className="bg-red-500 text-white animate-pulse">🔴 LIVE</Badge>
              </div>
              <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/50 text-white text-xs rounded-full px-2 py-1">
                <Users className="w-3 h-3" /> <LiveViewerCount liveId={live.id} /> {t("viewers")}
              </div>
            </div>
            <CardContent className="p-4">
              <h3 className="font-bold text-lg text-foreground">{live.artist_name}</h3>
              <p className="text-sm text-muted-foreground">{live.title || t("liveInProgress")}</p>
              <Button className="w-full mt-3 bg-red-500 hover:bg-red-600 text-white">
                <Eye className="w-4 h-4 mr-2" /> {t("watchLive")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <SimplePagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  );
};

export default Lives;
