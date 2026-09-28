import { useState } from "react";
import SEO from "@/components/seo/SEO";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { Play, Heart, MessageCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listVideos, toggleLike as toggleVideoLike, likedByMe } from "@/api/endpoints/lifestyle";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { AuthRequiredDialog } from "@/components/auth/AuthRequiredDialog";
import { ShareButton } from "@/components/sharing/ShareButton";
import { toast } from "sonner";
import { SimplePagination } from "@/components/ui/simple-pagination";
import { usePagination } from "@/hooks/usePagination";
import { SearchBar } from "@/components/ui/search-bar";
import { EmptyState } from "@/components/ui/empty-state";

const Lifestyle = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [likingVideoId, setLikingVideoId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: videos, isLoading } = useQuery({
    queryKey: ["lifestyle-videos"],
    queryFn: async () => {
      // `comments_count` (par vidéo, via listVideos) est maintenant tenu à jour côté serveur à
      // chaque création/suppression de commentaire (voir comment.service.js) — auparavant figé
      // à 0 à la création de la vidéo et jamais incrémenté.
      return (await listVideos()) as any[];
    },
    refetchInterval: 15000,
  });

  // Ids of videos the signed-in user has liked, to pre-highlight liked cards.
  const { data: likedVideoIds = [] } = useQuery({
    queryKey: ["lifestyle-liked-mine", currentUserId],
    queryFn: () => likedByMe(),
    enabled: !!currentUserId,
  });

  const toggleLike = async (videoId: string, _currentLikes: number) => {
    if (!currentUserId) {
      setShowAuthDialog(true);
      return;
    }
    if (likingVideoId) return;
    setLikingVideoId(videoId);

    try {
      await toggleVideoLike(videoId);
      queryClient.invalidateQueries({ queryKey: ["lifestyle-videos"] });
      queryClient.invalidateQueries({ queryKey: ["lifestyle-liked-mine", currentUserId] });
    } catch {
      toast.error(t("loginToInteract"));
    } finally {
      setLikingVideoId(null);
    }
  };

  const formatCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(0)}K`;
    }
    return count.toString();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO title="Lifestyle — Vidéos courtes des artistes" description="Découvrez les vidéos lifestyle exclusives de vos artistes préférés sur Dual Music." path="/lifestyle" />
      <Header />
      
      <main className="flex-1 container mx-auto px-4 pt-24 pb-16 min-h-[80vh]">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
            {t("lifestylePageTitle")}
          </h1>
          <p className="text-xl text-muted-foreground">
            {t("lifestylePageSubtitle")}
          </p>
        </div>

        <SearchBar value={search} onChange={setSearch} placeholder={`${t("search") || "Rechercher"}...`} />

        {isLoading ? (
          <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-[9/16] w-full" />
                <CardContent className="p-3">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2 mb-2" />
                  <Skeleton className="h-3 w-1/3 mb-3" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <PaginatedVideos
            videos={(videos || []).filter((v: any) => {
              const q = search.trim().toLowerCase();
              if (!q) return true;
              return v.title?.toLowerCase().includes(q) || v.artist_name?.toLowerCase().includes(q);
            })}
            currentUserId={currentUserId}
            setShowAuthDialog={setShowAuthDialog}
            navigate={navigate}
            likedVideoIds={likedVideoIds}
            likingVideoId={likingVideoId}
            toggleLike={toggleLike}
            formatCount={formatCount}
            t={t}
          />
        )}
      </main>

      <AuthRequiredDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
      <Footer />
    </div>
  );
};

const PaginatedVideos = ({ videos, currentUserId, setShowAuthDialog, navigate, likedVideoIds, likingVideoId, toggleLike, formatCount, t }: any) => {
  const { page, setPage, pageCount, paginated } = usePagination(videos, 12);
  if (videos.length === 0) {
    return <EmptyState icon={<Play />} title={t("noLifestyleTitle")} description={t("noLifestyleDesc")} />;
  }
  return (
    <>
      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {paginated.map((video: any) => {
          const isLiked = likedVideoIds?.includes(video.id);
          return (
            <Card key={video.id} className="group hover:shadow-glow transition-all bg-card border-border overflow-hidden">
              <div
                className="relative cursor-pointer"
                onClick={() => { if (!currentUserId) { setShowAuthDialog(true); return; } navigate(`/video/${video.id}`); }}
              >
                <div
                  className="aspect-[9/16] relative bg-cover bg-center"
                  style={{
                    backgroundImage: video.thumbnail_url ? `url(${video.thumbnail_url})` : 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))'
                  }}
                >
                  <div className="absolute inset-0 bg-background/40 group-hover:bg-background/20 transition-all flex items-center justify-center">
                    <Play className="w-12 h-12 text-foreground opacity-90" />
                  </div>
                  <Badge className="absolute bottom-2 right-2 bg-background/80 text-foreground">
                    {video.duration}
                  </Badge>
                </div>
              </div>
              <CardContent className="p-3">
                <h3 className="font-bold text-sm mb-1 text-foreground truncate">{video.title}</h3>
                <p className="text-xs text-muted-foreground mb-2">{video.artist_name}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                  <Eye className="w-3 h-3" />
                  <span>{formatCount(video.views_count)} {t("viewsCount")}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1 text-muted-foreground">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-8 px-2 ${isLiked ? "text-red-500" : ""}`}
                    disabled={likingVideoId === video.id}
                    onClick={(e) => { e.stopPropagation(); toggleLike(video.id, video.likes_count); }}
                  >
                    <Heart className={`w-4 h-4 ${isLiked ? "fill-red-500 text-red-500" : ""}`} />
                    <span className="text-xs ml-1">{formatCount(video.likes_count)}</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={(e) => { e.stopPropagation(); if (!currentUserId) { setShowAuthDialog(true); return; } navigate(`/video/${video.id}`); }}>
                    <MessageCircle className="w-4 h-4" />
                    <span className="text-xs ml-1">{video.comments_count}</span>
                  </Button>
                  <div onClick={(e) => e.stopPropagation()}>
                    <ShareButton contentType="lifestyle" contentId={video.id} title={video.title} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <SimplePagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  );
};

export default Lifestyle;
