/**
 * Admin: LifestyleManager — modération des vidéos lifestyle artistes.
 *
 * Liste paginée des VODs courts uploadés par les artistes, prévisualisation,
 * suppression ou masquage. Les vues/likes sont mis à jour en temps réel
 * via `useQuery` polling côté public.
 *
 * @access  role=admin
 */
import { useState, useEffect } from "react";
import { listVideos, deleteVideo as deleteVideoApi } from "@/api/endpoints/lifestyle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminTable } from "@/components/admin/AdminTable";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import { Video, Eye, Trash2, Heart, MessageSquare } from "lucide-react";

interface LifestyleVideo {
  id: string;
  title: string;
  artist_name: string;
  artist_id: string;
  views_count: number;
  likes_count: number;
  comments_count: number;
  duration: string;
  created_at: string;
  video_url: string;
}

const LifestyleManager = () => {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const [videos, setVideos] = useState<LifestyleVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadVideos(); }, []);

  const loadVideos = async () => {
    const data = await listVideos();
    setVideos((data || []) as unknown as LifestyleVideo[]);
    setLoading(false);
  };

  const deleteVideo = async (id: string) => {
    await deleteVideoApi(id);
    toast({ title: t("adminLifestyleDeleted") });
    loadVideos();
  };

  const fmt = (dt: string) => formatTz(dt, "dd MMM yyyy HH:mm", { timezone: tz, language });

  if (loading) return <div className="text-center py-8 text-muted-foreground">{t("loading")}...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Video className="w-5 h-5 text-primary" /> {t("adminLifestyleTitle")}</CardTitle>
        <CardDescription>{t("adminLifestyleDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <AdminTable
          data={videos}
          searchKeys={["title", "artist_name"]}
          emptyMessage={t("adminNoLifestyle")}
          columns={[
            { key: "title", label: t("adminColTitle"), sortable: true },
            { key: "artist_name", label: t("adminColArtist"), sortable: true },
            { key: "duration", label: t("adminColDuration") },
            { key: "views_count", label: t("adminColViews"), sortable: true, render: (v) => <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {v.views_count}</span> },
            { key: "likes_count", label: t("adminColLikes"), sortable: true, render: (v) => <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {v.likes_count}</span> },
            { key: "comments_count", label: t("adminColComments"), sortable: true, render: (v) => <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {v.comments_count}</span> },
            { key: "created_at", label: t("adminColDate"), sortable: true, render: (v) => fmt(v.created_at) },
            {
              key: "actions", label: t("adminColActions"),
              render: (video) => (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => window.open(`/lifestyle/${video.id}`, "_blank")}><Eye className="w-3 h-3" /></Button>
                  <Button variant="destructive" size="sm" onClick={() => deleteVideo(video.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              )
            }
          ]}
        />
      </CardContent>
    </Card>
  );
};

export default LifestyleManager;
