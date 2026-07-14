/**
 * Gestionnaire lives artiste : démarrage live spontané (`lives` table), arrêt, paramètres
 * caméra/micro. Génère token LiveKit via `livekit-token`.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listLives, createLive, endLive as endLiveApi } from "@/api/endpoints/lives";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Radio, Plus, Eye, Users, Calendar, Clock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";

interface ArtistLivesManagerProps {
  userId: string;
  onNavigate: (path: string) => void;
}

export const ArtistLivesManager = ({ userId, onNavigate }: ArtistLivesManagerProps) => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [liveTitle, setLiveTitle] = useState("");
  const [startingLive, setStartingLive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: lives, isLoading } = useQuery({
    queryKey: ["artist-my-lives", userId],
    queryFn: () => listLives({ artistId: userId }),
    enabled: !!userId,
  });

  const activeLive = lives?.find((l: any) => l.status === "live") as any;
  const pastLives = (lives?.filter((l: any) => l.status === "ended") || []) as any[];

  const startLive = async () => {
    if (!userId) return;
    setStartingLive(true);
    try {
      const data = await createLive({ title: liveTitle || t("artLivesDefaultTitle") });
      queryClient.invalidateQueries({ queryKey: ["artist-my-lives"] });
      setDialogOpen(false);
      onNavigate(`/live/${(data as { id: string }).id}`);
    } catch (err: any) {
      toast({ title: t("commonError"), description: err.message, variant: "destructive" });
    } finally {
      setStartingLive(false);
    }
  };

  const endLive = async (liveId: string) => {
    try {
      await endLiveApi(liveId);
      queryClient.invalidateQueries({ queryKey: ["artist-my-lives"] });
      toast({ title: t("artLivesEnded"), description: t("artLivesEndedDesc") });
    } catch (err: any) {
      toast({ title: t("commonError"), description: err.message, variant: "destructive" });
    }
  };

  const formatDuration = (startedAt: string, endedAt?: string | null) => {
    const start = new Date(startedAt);
    const end = endedAt ? new Date(endedAt) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h${minutes % 60}min`;
    return `${minutes}min`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t("artLivesTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("artLivesSubtitle")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white gap-2">
              <Plus className="w-4 h-4" />{t("artLivesStart")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("artLivesStartTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Input placeholder={t("artLivesTitlePlaceholder")} value={liveTitle} onChange={(e) => setLiveTitle(e.target.value)} />
              <p className="text-sm text-muted-foreground">{t("artLivesStartDesc")}</p>
              <Button onClick={startLive} disabled={startingLive} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                {startingLive ? t("artLivesStarting") : t("artLivesStartBtn")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {activeLive && (
        <Card className="border-2 border-red-500/50 bg-red-500/5">
          <CardContent className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <div>
                  <p className="font-bold text-foreground">{activeLive.title || t("artLivesActive")}</p>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {activeLive.viewer_count || 0} {t("artLivesViewers")}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatDuration(activeLive.started_at)}
                    </span>
                  </div>
                </div>
                <Badge className="bg-red-500 text-white animate-pulse">🔴 {t("artConcertLive")}</Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onNavigate(`/live/${activeLive.id}`)} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                  <Eye className="w-4 h-4 mr-1" /> {t("artLivesJoin")}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => endLive(activeLive.id)}>
                  {t("artLivesEndBtn")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!activeLive && (
        <Card className="border-dashed border-2 border-border bg-accent/20">
          <CardContent className="p-8 text-center">
            <Radio className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium text-muted-foreground">{t("artLivesNoActive")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("artLivesNoActiveDesc")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};