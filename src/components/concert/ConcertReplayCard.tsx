/**
 * Carte replay concert (`replay_videos`) : vignette, durée, likes, accès payant via `replay_access`.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Lock, Calendar } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import * as replays from "@/api/endpoints/replays";
import * as wallet from "@/api/endpoints/wallet";
import { ApiError } from "@/api/http";
import { useAuth } from "@/contexts/AuthContext";
import { formatTz } from "@/lib/datetime";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { toast } from "sonner";
import { PriceBadge } from "@/components/profile/PriceBadge";
import { useCurrencyFormatter } from "@/hooks/useCurrency";
import { useNavigate } from "react-router-dom";

interface ConcertReplayCardProps {
  concert: {
    id: string;
    title: string;
    artist_name: string;
    description?: string;
    scheduled_date: string;
    ticket_price: number;
    image_url?: string;
    recording_url?: string;
    is_replay_available?: boolean;
    is_artist_concert?: boolean;
  };
  onPlay: (concert: any, hasAccess: boolean) => void;
}

export const ConcertReplayCard = ({ concert, onPlay }: ConcertReplayCardProps) => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const { formatPrice } = useCurrencyFormatter();
  const tz = prefs.timezone;
  const [isUnlocking, setIsUnlocking] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: hasAccess, refetch: refetchAccess } = useQuery({
    queryKey: ["concert-replay-access", concert.id],
    queryFn: async () => {
      if (!user) return false;
      try {
        const reps = (await replays.listReplays({ concertId: concert.id, limit: 1 })) as any[];
        const rid = reps?.[0]?.id;
        if (!rid) return false;
        const { hasAccess } = await replays.getAccess(rid);
        return !!hasAccess;
      } catch {
        return false;
      }
    },
  });

  const isPremium = concert.ticket_price > 0;
  const canWatch = !isPremium || hasAccess;

  const handleUnlock = async () => {
    if (!user) {
      toast.error(t("mustLoginToUnlock"));
      return;
    }
    setIsUnlocking(true);
    try {
      const reps = (await replays.listReplays({ concertId: concert.id, limit: 1 })) as any[];
      const replayId = reps?.[0]?.id;
      if (!replayId) {
        toast.error(t("unlockReplayError"));
        return;
      }
      await wallet.unlockReplay({ replayId }, crypto.randomUUID());
      toast.success(t("replayUnlockedOk"));
      refetchAccess();
    } catch (error: any) {
      if (error instanceof ApiError && error.code === "ALREADY_TICKETED") {
        toast.success(t("replayUnlockedOk"));
        refetchAccess();
      } else {
        toast.error(t("unlockReplayError"));
      }
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleClick = async () => {
    if (!concert.recording_url) return;
    if (!canWatch) {
      handleUnlock();
      return;
    }
    // Navigate to the unified replay detail page (same layout as duel replays)
    try {
      const reps = (await replays.listReplays({ concertId: concert.id, limit: 1 })) as any[];
      const replayId = reps?.[0]?.id;
      if (replayId) {
        navigate(`/replay/${replayId}`);
        return;
      }
    } catch {
      /* fall through to in-place player */
    }
    // Fallback to in-place player if no replay row was created
    onPlay(concert, true);
  };

  return (
    <Card 
      className="group hover:shadow-glow transition-all bg-card border-border overflow-hidden cursor-pointer"
      onClick={handleClick}
    >
      <div className="relative">
        <div 
          className="h-48 bg-cover bg-center relative" 
          style={{ 
            backgroundImage: concert.image_url 
              ? `url(${concert.image_url})` 
              : 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))' 
          }}
        >
          <div className="absolute inset-0 bg-background/40 group-hover:bg-background/20 transition-all flex items-center justify-center">
            {isPremium && !canWatch ? (
              <Lock className="w-12 h-12 text-foreground opacity-90" />
            ) : (
              <Play className="w-12 h-12 text-foreground opacity-90" />
            )}
          </div>
          
          {concert.recording_url && (
            <Badge className="absolute top-2 right-2 bg-green-500/90 text-white">
              <Play className="w-3 h-3 mr-1" />
              {t("replayAvailable")}
            </Badge>
          )}

          <PriceBadge credits={Number(concert.ticket_price ?? 0)} variant="overlay" className="absolute top-2 left-2" />

          {hasAccess && isPremium && (
            <Badge className="absolute bottom-2 left-2 bg-green-500 text-white">
              {t("accessUnlocked")}
            </Badge>
          )}
        </div>
      </div>
      <CardContent className="p-6">
        <h3 className="text-xl font-bold mb-2 text-foreground">{concert.title}</h3>
        <p className="text-muted-foreground mb-2">{concert.artist_name}</p>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Calendar className="w-4 h-4" />
          <span>{formatTz(concert.scheduled_date, "dd MMMM yyyy", { timezone: tz, language })}</span>
        </div>
        
        <Button 
          className="w-full bg-gradient-primary hover:shadow-glow transition-all"
          variant={isPremium && !canWatch ? "outline" : "default"}
          disabled={!concert.recording_url || isUnlocking}
        >
          {!concert.recording_url ? (
            t("replayNotAvailable")
          ) : isPremium && !canWatch ? (
            isUnlocking ? t("unlockingReplay") : `${t("unlockReplay")} — ${Number(concert.ticket_price).toLocaleString()} Crédits (≈ ${formatPrice(Number(concert.ticket_price))})`
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
};
