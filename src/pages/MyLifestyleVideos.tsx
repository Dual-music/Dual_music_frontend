import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import { Play, Heart, MessageCircle, Eye, ArrowLeft, Trash2, Edit } from "lucide-react";
import { listVideos, deleteVideo as deleteVideoApi } from "@/api/endpoints/lifestyle";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface LifestyleVideo {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  duration: string;
  views_count: number;
  likes_count: number;
  comments_count: number;
  created_at: string;
}

const MyLifestyleVideos = () => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, ready } = useAuth();
  const [videos, setVideos] = useState<LifestyleVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    loadMyVideos();
  }, [ready, user]);

  const loadMyVideos = async () => {
    if (!user) return;
    try {
      const data = await listVideos({ artistId: user.id });
      setVideos((data || []) as unknown as LifestyleVideo[]);
    } catch (error) {
      console.error("Error loading videos:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteVideo = async (videoId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette vidéo ?")) return;

    try {
      await deleteVideoApi(videoId);

      toast({
        title: "Vidéo supprimée",
        description: "La vidéo a été supprimée avec succès",
      });

      loadMyVideos();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(0)}K`;
    }
    return count.toString();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/profile")}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour au profil
        </Button>

        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
            Mes Vidéos Lifestyle
          </h1>
          <p className="text-xl text-muted-foreground">
            Gérez vos publications vidéo
          </p>
        </div>

        {loading ? (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-[9/16] w-full" />
                <CardContent className="p-3">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-16">
            <Play className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Aucune vidéo publiée</h3>
            <p className="text-muted-foreground mb-4">
              Commencez à partager du contenu avec vos fans
            </p>
            <Button onClick={() => navigate("/profile")}>
              Publier une vidéo
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {videos.map((video) => (
              <Card key={video.id} className="group hover:shadow-glow transition-all bg-card border-border overflow-hidden">
                <div 
                  className="relative cursor-pointer"
                  onClick={() => navigate(`/video/${video.id}`)}
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
                  <p className="text-xs text-muted-foreground mb-2">
                    {formatTz(video.created_at, "d MMM yyyy", { timezone: tz, language })}
                  </p>
                  
                  <div className="flex items-center justify-between text-muted-foreground mb-3">
                    <div className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      <span className="text-xs">{formatCount(video.views_count)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      <span className="text-xs">{formatCount(video.likes_count)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />
                      <span className="text-xs">{video.comments_count}</span>
                    </div>
                  </div>

                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="w-full"
                    onClick={() => deleteVideo(video.id)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Supprimer
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default MyLifestyleVideos;
