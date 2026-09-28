import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as comments from "@/api/endpoints/comments";
import * as replays from "@/api/endpoints/replays";
import * as wallet from "@/api/endpoints/wallet";
import { uploadFile } from "@/api/endpoints/uploads";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { ArrowLeft, Clock, Eye, Lock, Play, Heart, MessageCircle, Settings, Download, Upload, Loader2 } from "lucide-react";
import { formatTz } from "@/lib/datetime";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { toast } from "sonner";
import { useEffect, useState, useRef } from "react";
import CommentSection from "@/components/comments/CommentSection";
import SEO from "@/components/seo/SEO";

/** Panneau de gestion (propriétaire ou staff) : prix, publication, remplacement vidéo, téléchargement. */
const ReplayOwnerPanel = ({ replay, onSaved }: { replay: any; onSaved: () => void }) => {
  const { t } = useLanguage();
  const [price, setPrice] = useState(String(replay.replay_price ?? 0));
  const [isPublic, setIsPublic] = useState(Boolean(replay.is_public));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty = Number(price) !== Number(replay.replay_price ?? 0) || isPublic !== Boolean(replay.is_public);

  const save = async () => {
    setSaving(true);
    try {
      await replays.updateReplay(replay.id, {
        replay_price: Math.max(0, Number(price) || 0),
        is_public: isPublic,
        // Un prix > 0 implique premium (accès payant) ; gratuit sinon.
        is_premium: Number(price) > 0,
      });
      toast.success(t("saved") || "Enregistré");
      onSaved();
    } catch {
      toast.error(t("errorTitle") || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, "replay");
      await replays.updateReplay(replay.id, { video_url: url });
      toast.success("Vidéo remplacée");
      onSaved();
    } catch {
      toast.error("Échec du téléversement");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="bg-card/50 border-primary/30">
      <CardContent className="p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary" /> Gestion du replay
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="replay-public">Rendre public</Label>
            <p className="text-xs text-muted-foreground">Visible sur la page des replays une fois activé.</p>
          </div>
          <Switch id="replay-public" checked={isPublic} onCheckedChange={setIsPublic} />
        </div>

        <div>
          <Label htmlFor="replay-price">Prix (crédits — 0 = gratuit)</Label>
          <Input
            id="replay-price"
            type="number"
            min={0}
            step={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1"
          />
        </div>

        <Button onClick={save} disabled={!dirty || saving || uploading} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Enregistrer les réglages
        </Button>

        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" asChild className="flex-1">
            <a href={replay.video_url} download target="_blank" rel="noreferrer">
              <Download className="w-4 h-4 mr-2" /> Télécharger
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={onPickFile} disabled={uploading} className="flex-1">
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Remplacer la vidéo
          </Button>
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={onFileChosen} />
        </div>
      </CardContent>
    </Card>
  );
};

const ReplayDetail = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const { user, isAdmin, hasRole } = useAuth();
  const currentUserId = user?.id ?? null;
  const isStaff = isAdmin || hasRole("moderator");

  const { data: replay, isLoading } = useQuery({
    queryKey: ["replay", id],
    queryFn: async () => (await replays.getReplay(id!)) as any,
  });

  const isOwner = !!currentUserId && !!replay && (replay.artist_id === currentUserId || replay.created_by === currentUserId);
  const canManage = isOwner || isStaff;

  const { data: hasAccess } = useQuery({
    queryKey: ["replay-access", id],
    queryFn: async () => {
      if (!currentUserId) return false;
      const res = await replays.getAccess(id!);
      return res.hasAccess;
    },
  });

  // Likes come embedded in getReplay() (`likes` + per-caller `liked`).
  const likesCount = Number(replay?.likes ?? 0);
  const userLiked = Boolean(replay?.liked);

  const toggleLike = useMutation({
    mutationFn: async () => {
      if (!currentUserId) throw new Error("Not authenticated");
      await replays.likeReplay(id!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replay", id] });
    },
  });

  // Comments count
  const { data: commentsCount = 0 } = useQuery({
    queryKey: ["replay-comments-count", id],
    queryFn: async () => {
      const rows = await comments.listComments("replay", id!);
      return rows.length;
    },
  });

  // Increment views once
  const viewIncrementedRef = useRef(false);
  useEffect(() => {
    if (replay && (!replay.is_premium || hasAccess) && !viewIncrementedRef.current) {
      viewIncrementedRef.current = true;
      replays.addView(id!).then(() => {
        queryClient.invalidateQueries({ queryKey: ["replay", id] });
      });
    }
  }, [replay, hasAccess, id]);

  const unlockReplay = useMutation({
    mutationFn: async () => {
      await wallet.unlockReplay({ replayId: id! }, crypto.randomUUID());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replay-access", id] });
      toast.success(t("replayUnlocked"));
    },
    onError: () => { toast.error(t("unlockError")); },
  });

  const formatCount = (count: number) => count >= 1000 ? `${(count / 1000).toFixed(0)}K` : count.toString();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 pt-24 pb-16">
          <Skeleton className="h-8 w-32 mb-8" />
          <div className="grid lg:grid-cols-2 gap-8">
            <Skeleton className="h-96 w-full rounded-lg" />
            <div className="space-y-6"><Skeleton className="h-12 w-3/4" /><Skeleton className="h-6 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-12 w-full" /></div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!replay) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 pt-24 pb-16">
          <p className="text-center text-muted-foreground">{t("replayNotFound")}</p>
        </main>
        <Footer />
      </div>
    );
  }

  const canWatch = !replay.is_premium || hasAccess;

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${(replay as any).title || "Replay"} — Dual Music`}
        description={((replay as any).description || `Revivez ce moment sur Dual Music`).slice(0, 160)}
        path={`/replay/${(replay as any).id}`}
        image={(replay as any).thumbnail_url || undefined}
        type="video.other"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: (replay as any).title,
          description: (replay as any).description || undefined,
          thumbnailUrl: (replay as any).thumbnail_url || undefined,
          uploadDate: (replay as any).created_at,
          contentUrl: (replay as any).video_url,
        }}
      />
      <Header />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("back")}
        </Button>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="relative">
            {canWatch && isPlaying ? (
              <div className="rounded-lg overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  src={replay.video_url}
                  controls
                  autoPlay
                  className="w-full max-h-[500px] object-contain"
                  poster={replay.thumbnail_url || undefined}
                  onEnded={() => setIsPlaying(false)}
                />
              </div>
            ) : (
              <div className="h-96 rounded-lg bg-cover bg-center relative" style={{ backgroundImage: replay.thumbnail_url ? `url(${replay.thumbnail_url})` : 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))' }}>
                {!canWatch && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center rounded-lg"><Lock className="w-16 h-16 text-muted-foreground" /></div>
                )}
                {canWatch && (
                  <div
                    className="absolute inset-0 bg-background/20 hover:bg-background/10 transition-all flex items-center justify-center rounded-lg cursor-pointer"
                    onClick={() => setIsPlaying(true)}
                  >
                    <Play className="w-16 h-16 text-foreground" />
                  </div>
                )}
              </div>
            )}
            {replay.is_premium && <Badge className="absolute top-4 left-4 bg-accent text-accent-foreground">Premium</Badge>}
            <Badge className="absolute top-4 right-4 bg-background/80 text-foreground"><Clock className="w-3 h-3 mr-1" />{replay.duration}</Badge>
          </div>

          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">{replay.title}</h1>
              {replay.description && <p className="text-muted-foreground mb-4">{replay.description}</p>}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1"><Eye className="w-4 h-4" /><span>{formatCount(replay.views_count)} {t("views")}</span></div>
                <span>•</span>
                <button
                  onClick={() => currentUserId ? toggleLike.mutate() : toast.error(t("loginRequired"))}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <Heart className={`w-4 h-4 ${userLiked ? "fill-red-500 text-red-500" : ""}`} />
                  <span>{formatCount(likesCount)}</span>
                </button>
                <span>•</span>
                <div className="flex items-center gap-1"><MessageCircle className="w-4 h-4" /><span>{formatCount(commentsCount)}</span></div>
                <span>•</span>
                <span>{formatTz(replay.recorded_date, "dd MMMM yyyy", { timezone: tz, language })}</span>
              </div>
            </div>

            <Card className="bg-card/50 border-border">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">{t("information")}</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("duration")}</span><span className="font-medium">{replay.duration}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("recordingDate")}</span><span className="font-medium">{formatTz(replay.recorded_date, "dd MMMM yyyy", { timezone: tz, language })}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("viewsCount")}</span><span className="font-medium">{formatCount(replay.views_count)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("access")}</span><Badge variant={replay.is_premium ? "default" : "secondary"}>{replay.is_premium ? "Premium" : t("free")}</Badge></div>
                </div>
              </CardContent>
            </Card>

            {canWatch ? (
              <Button size="lg" className="w-full bg-gradient-primary hover:shadow-glow transition-all text-lg" onClick={() => setIsPlaying(true)}><Play className="w-5 h-5 mr-2" />{t("watch")}</Button>
            ) : (
              <Button size="lg" className="w-full bg-gradient-primary hover:shadow-glow transition-all text-lg" onClick={() => unlockReplay.mutate()} disabled={unlockReplay.isPending}>
                <Lock className="w-5 h-5 mr-2" />
                {unlockReplay.isPending ? t("unlocking") : t("unlockPremium")}
              </Button>
            )}

            {canManage && (
              <ReplayOwnerPanel replay={replay} onSaved={() => queryClient.invalidateQueries({ queryKey: ["replay", id] })} />
            )}
          </div>
        </div>

        {/* Comments section */}
        {canWatch && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold mb-6">{t("comments")} ({commentsCount})</h2>
            <CommentSection contentId={id!} contentType="replay" />
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default ReplayDetail;