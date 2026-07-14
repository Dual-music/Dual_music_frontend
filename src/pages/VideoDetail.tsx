import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getVideo, addView, toggleLike as toggleVideoLike } from "@/api/endpoints/lifestyle";
import { listComments } from "@/api/endpoints/comments";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { ArrowLeft, Heart, Eye } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import CommentSection from "@/components/comments/CommentSection";
import { ShareButton } from "@/components/sharing/ShareButton";

const VideoDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [hasLiked, setHasLiked] = useState(false);

  const { data: video, isLoading } = useQuery({
    queryKey: ["video", id],
    queryFn: async () => {
      const data = (await getVideo(id!)) as any;

      // Get real comment count
      const comments = await listComments("lifestyle", id!);

      return { ...data, comments_count: comments.length || data.comments_count };
    },
    refetchInterval: 10000,
  });

  useEffect(() => { setHasLiked(!!(video as any)?.liked); }, [video]);

  useEffect(() => {
    if (video && id) {
      void addView(id).catch(() => {});
    }
  }, [video, id]);

  const toggleLike = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not authenticated");
      await toggleVideoLike(id!);
    },
    onSuccess: () => {
      setHasLiked(!hasLiked);
      queryClient.invalidateQueries({ queryKey: ["video", id] });
    },
    onError: () => { toast.error(t("loginToInteract")); },
  });

  const formatCount = (count: number) => count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count.toString();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 pt-24 pb-16 max-w-4xl">
          <Skeleton className="h-8 w-32 mb-8" />
          <Skeleton className="aspect-[9/16] w-full max-w-md mx-auto rounded-lg mb-6" />
          <Skeleton className="h-8 w-3/4 mb-4" />
          <Skeleton className="h-6 w-1/2" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 pt-24 pb-16">
          <p className="text-center text-muted-foreground">{t("videoNotFound")}</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 pt-24 pb-16 max-w-4xl">
        <Button variant="ghost" onClick={() => navigate("/lifestyle")} className="mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("back")}
        </Button>

        <div className="grid lg:grid-cols-[1fr_2fr] gap-8">
          <div>
            {video.video_url ? (
              <video src={video.video_url} className="aspect-[9/16] rounded-lg w-full object-cover" controls poster={video.thumbnail_url || undefined} />
            ) : (
              <div className="aspect-[9/16] rounded-lg bg-cover bg-center" style={{ backgroundImage: video.thumbnail_url ? `url(${video.thumbnail_url})` : 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))' }} />
            )}
          </div>

          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2 text-foreground">{video.title}</h1>
              <p className="text-xl text-muted-foreground mb-4">{video.artist_name}</p>
              {video.description && <p className="text-muted-foreground mb-4">{video.description}</p>}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  <span>{formatCount(video.views_count)} {t("views")}</span>
                </div>
                <span>•</span>
                <span>{video.duration}</span>
              </div>
            </div>

            <Card className="bg-card/50 border-border">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Button variant={hasLiked ? "default" : "outline"} className="flex-1" onClick={() => toggleLike.mutate()} disabled={toggleLike.isPending}>
                    <Heart className={`w-5 h-5 mr-2 ${hasLiked ? "fill-current" : ""}`} />
                    {formatCount(video.likes_count)}
                  </Button>
                  <ShareButton
                    contentType="lifestyle"
                    contentId={video.id}
                    title={video.title}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="bg-muted/50 rounded-lg p-6">
              <h3 className="font-semibold mb-2">{t("aboutArtist")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("discoverMoreFrom")} <span className="text-foreground font-medium">{video.artist_name}</span>
              </p>
            </div>

            <CommentSection contentType="lifestyle" contentId={id!} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default VideoDetail;
