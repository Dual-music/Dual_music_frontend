/**
 * Page: ConcertLive (/concerts/:id/live)
 *
 * Diffusion live d'un concert programmé (table `concerts`). L'hôte (artiste)
 * publie via `WebRTCHost` (LiveKit SFU) ; les spectateurs consomment via
 * `WebRTCViewer`. Inclut chat, cadeaux (`ConcertGiftPanel`), pourboires
 * rapides (`QuickTip`), classement donateurs (`GiftLeaderboard`), minuteur
 * de durée (`ConcertDurationTimer`), enregistrement (`ConcertRecordingControls`)
 * et persistance des likes (`live_likes`).
 *
 * Garde-fous d'accès :
 *   - `ScheduledAccessGate` : bloque l'entrée hors fenêtre programmée.
 *   - `BannedAccessGate`    : bloque les utilisateurs bannis du stream.
 *   - `LiveReportButton`    : signalement → modération (auto-stop à 75%).
 *
 * Le compteur de viewers s'appuie sur Supabase Presence ; identité affichée
 * via la RPC `get_display_profiles`.
 *
 * @route   /concerts/:id/live
 * @see     src/components/concert/WebRTCHost.tsx, WebRTCViewer.tsx
 * @see     supabase/functions/notify-concert-start, concert-reminders
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as concertsApi from "@/api/endpoints/concerts";
import * as livesApi from "@/api/endpoints/lives";
import { useAuth } from "@/contexts/AuthContext";
import { useEventChat } from "@/realtime/useEventChat";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";
import { usePresence, useRoomEvent } from "@/realtime/useRoom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Heart, ArrowLeft, LogOut, Users } from "lucide-react";
import { ShareButton } from "@/components/sharing/ShareButton";
import Header from "@/components/Header";
import { FollowArtistButton } from "@/components/artist/FollowArtistButton";
import Footer from "@/components/Footer";
import ConcertGiftPanel from "@/components/concert/ConcertGiftPanel";
import { QuickTip } from "@/components/duel/QuickTip";
import { GiftLeaderboard } from "@/components/duel/GiftLeaderboard";
import { ConcertDurationTimer } from "@/components/concert/ConcertDurationTimer";
import { ConcertRecordingControls } from "@/components/concert/ConcertRecordingControls";
import { WebRTCHost } from "@/components/concert/WebRTCHost";
import { WebRTCViewer } from "@/components/concert/WebRTCViewer";
import { FloatingHearts, useBroadcastHearts, formatLikeCount } from "@/components/animations/FloatingHearts";
import { FloatingEmojis, EmojiReactionBar, useBroadcastEmojis } from "@/components/animations/FloatingEmojis";
import { TopDonorBubble } from "@/components/animations/TopDonorBubble";
import { SponsorAdBroadcast } from "@/components/sponsor/SponsorAdBroadcast";
import { ScheduledAccessGate } from "@/components/scheduling/ScheduledAccessGate";
import { BannedAccessGate } from "@/components/streaming/BannedAccessGate";
import { LiveReportButton } from "@/components/streaming/LiveReportButton";
import { SponsorAdHistoryPanel } from "@/components/sponsor/SponsorAdHistoryPanel";
import { FullscreenButton } from "@/components/streaming/FullscreenButton";
import { SpeakingTimerOverlay } from "@/components/streaming/SpeakingTimerOverlay";
import { VideoZoomWrapper } from "@/components/streaming/VideoZoomWrapper";
import { MobileStreamOverlay } from "@/components/streaming/MobileStreamOverlay";
import { ThreadedChat } from "@/components/chat/ThreadedChat";
import { useIsMobile } from "@/hooks/use-mobile";
import { WebRTCHostControls } from "@/components/concert/WebRTCHost";

const ConcertLive = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const { user, roles } = useAuth();
  const currentUserId = user?.id ?? null;
  const isArtist = roles.includes("artist") || roles.includes("admin");
  const artistId = isArtist ? user?.id : undefined;
  const [hostStream, setHostStream] = useState<MediaStream | null>(null);
  const [likes, setLikes] = useState(0);
  const viewerCount = usePresence("concert", id ?? null);
  const likesLoadedRef = useRef(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const { hearts, broadcastHeart: addHeart } = useBroadcastHearts(id ? `concert-hearts-${id}` : null);
  const { emojis: floatingEmojis, broadcastEmoji: addEmoji } = useBroadcastEmojis(id ? `concert-emojis-${id}` : null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [hostControls, setHostControls] = useState<WebRTCHostControls | null>(null);
  const [hasTicket, setHasTicket] = useState(false);
  // Realtime like sync — ephemeral peer broadcast (kept channel name/event/payload).
  const { broadcast: broadcastLike } = useRoomBroadcast(
    id ? `concert-likes-${id}` : null,
    (event, payload) => {
      if (event === "like") setLikes((payload as { count: number }).count);
    },
  );
  // Mobile chat: REST history + Socket.IO realtime (was concert_chat_messages + channel).
  const chat = useEventChat("concert", isMobile && id ? id : null);
  const mobileChatMessages = useMemo(() => {
    const byId = new Map(chat.messages.map((m) => [m.id, m]));
    return chat.messages.map((m) => {
      const parent = m.parent_id ? byId.get(m.parent_id) : undefined;
      const e: any = {
        ...m,
        user_name: m.profile?.full_name || "Anonyme",
        avatar_url: m.profile?.avatar_url,
      };
      if (parent) {
        e.reply_to_name = parent.profile?.full_name || "Anonyme";
        e.reply_to_message = parent.message;
      }
      return e;
    });
  }, [chat.messages]);

  // Check if user already has a ticket for this concert
  useEffect(() => {
    if (!id || !currentUserId) return;
    (async () => {
      try {
        const info = await concertsApi.ticketInfo(id);
        setHasTicket(!!info.ticket);
      } catch {
        setHasTicket(false);
      }
    })();
  }, [id, currentUserId]);

  // Load persisted likes count via REST (realtime like sync stays on the
  // peer broadcast above — the backend `likes` emit targets the live room).
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { likes: count } = await livesApi.getLikes(id);
        setLikes(count);
      } catch {
        /* non-blocking */
      }
      likesLoadedRef.current = true;
    })();
  }, [id]);

  const { data: concert, isLoading, refetch } = useQuery({
    queryKey: ["concert-live", id],
    queryFn: async () => {
      // First try artist-created concerts (approved list, matched by id).
      try {
        const artistConcerts = (await concertsApi.listArtistConcerts()) as any[];
        const artistConcert = artistConcerts.find((c) => c.id === id);
        if (artistConcert) {
          return {
            id: artistConcert.id,
            title: artistConcert.title,
            artist_name: "",
            artist_id: artistConcert.artist_id,
            description: artistConcert.description,
            scheduled_date: artistConcert.scheduled_date,
            scheduled_time: new Date(artistConcert.scheduled_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            location: "En ligne",
            ticket_price: artistConcert.ticket_price,
            max_tickets: artistConcert.max_tickets,
            stream_url: artistConcert.stream_url,
            status: artistConcert.status,
            image_url: artistConcert.cover_image_url,
            is_artist_concert: true,
            started_at: artistConcert.started_at,
            recording_url: artistConcert.recording_url,
            is_replay_available: artistConcert.is_replay_available,
          };
        }
      } catch {
        /* fall through to admin concerts */
      }

      // If not found, try admin-programmed concerts.
      try {
        const data = (await concertsApi.getConcert(id!)) as any;
        return data ? {
          ...data,
          is_artist_concert: false,
          started_at: data.started_at,
          recording_url: data.recording_url,
          is_replay_available: data.is_replay_available,
        } : null;
      } catch {
        return null;
      }
    },
    refetchInterval: 5000, // Poll every 5 seconds to catch status changes
  });

  // Realtime concert status — backend emits `status` on the /live concert room.
  useRoomEvent("/live", "concert", id ?? null, "status", () => { refetch(); });

  // Update startedAt when concert data changes
  useEffect(() => {
    if (concert?.started_at) {
      setStartedAt(concert.started_at);
    }
  }, [concert?.started_at]);

  // Check if the current user is the concert organizer
  const isOrganizer = currentUserId && concert?.artist_id === currentUserId;

  // Eject all non-organizer viewers when the concert is ended by the host.
  const ejectedRef = useRef(false);
  useEffect(() => {
    if (!concert || ejectedRef.current) return;
    if (concert.status !== "ended") return;
    if (isOrganizer) return; // host navigates themselves
    ejectedRef.current = true;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    toast({
      title: t("concertEndedByHostTitle"),
      description: t("concertEndedByHostDesc"),
    });
    navigate("/concerts");
  }, [concert?.status, isOrganizer, navigate, t, toast, concert]);


  // Room ID for WebRTC
  const roomId = `concert-${id}`;

  // Handle stream events from WebRTC components
  const handleStreamStart = async () => {
    const now = new Date().toISOString();
    setStartedAt(now);
    
    // Update the correct concert type via REST. `started_at` is set
    // server-side when the status flips to `live`.
    try {
      if (concert?.is_artist_concert) {
        await concertsApi.updateArtistConcert(id!, { status: "live" });
      } else {
        await concertsApi.updateConcert(id!, { status: "live" });
      }
    } catch {
      /* non-blocking — local UI already reflects the started state */
    }

    // Notifications to ticket holders/followers are now emitted server-side
    // (the former notify-user-event invoke was removed).
  };

  const handleStreamStop = async () => {
    // Update the correct concert type via REST. `ended_at` is set
    // server-side when the status flips to `ended`.
    try {
      if (concert?.is_artist_concert) {
        await concertsApi.updateArtistConcert(id!, { status: "ended" });
      } else {
        await concertsApi.updateConcert(id!, { status: "ended" });
      }
    } catch {
      /* non-blocking */
    }
  };

  const sendLike = async () => {
    const newCount = likes + 1;
    setLikes(newCount);
    addHeart();
    broadcastLike("like", { count: newCount });

    // Persist likes count.
    if (id) {
      try {
        await livesApi.likeLive(id);
      } catch {
        /* non-blocking */
      }
    }
  };

  const sendMobileChatMessage = async (msg: string, parentId?: string | null) => {
    await chat.send(msg, parentId);
  };

  const handleLeaveConcert = () => {
    toast({ title: t("leftConcert") });
    navigate("/concerts");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-primary/30 rounded-full" />
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin absolute inset-0" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-foreground">🎵</span>
            <p className="text-muted-foreground font-medium animate-pulse">{t("loadingConcert") || "Chargement du concert..."}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!concert) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <p className="text-foreground">{t("concertNotFound")}</p>
        </div>
        <Footer />
      </div>
    );
  }

  // Determine if concert is live
  const isLive = concert.status === "live";

  // ===== MOBILE LAYOUT =====
  if (isMobile) {
    return (
      <div className="fixed inset-0 bg-black z-50">
        <ScheduledAccessGate
          type="concert"
          scheduledAt={concert.scheduled_date}
          status={concert.status}
          eventId={concert.id}
          ticketPrice={Number((concert as any).ticket_price) || 0}
          isActor={!!isOrganizer || isArtist}
          hasTicket={hasTicket}
          isAuthenticated={!!currentUserId}
          onPurchased={() => setHasTicket(true)}
        />
        <BannedAccessGate streamType="concert" streamId={id!} currentUserId={currentUserId} />
        <div className="relative w-full h-full" ref={videoContainerRef}>
          {/* Video stream */}
          {isOrganizer && currentUserId ? (
            <WebRTCHost
              roomId={roomId}
              hostId={currentUserId}
              hostName={concert.artist_name}
              hideMobileControls={true}
              onStreamStart={handleStreamStart}
              onStreamStop={handleStreamStop}
              onStreamReady={(stream) => setHostStream(stream)}
              onControlsReady={(c) => setHostControls(c)}
            />
          ) : currentUserId ? (
            <WebRTCViewer
              roomId={roomId}
              viewerId={currentUserId}
              concertTitle={concert.title}
              artistName={concert.artist_name}
              artistAvatarUrl={(concert as any).image_url || null}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20">
              <div className="text-center">
                <p className="text-white text-xl font-bold">{concert.title}</p>
                <p className="text-white/70">{concert.artist_name}</p>
                <p className="text-white/50 mt-4">{t("loginToWatchConcert")}</p>
              </div>
            </div>
          )}

          {/* TikTok-style mobile overlay */}
          <MobileStreamOverlay
            defaultHidden={false}
            isLive={isLive}
            viewerCount={viewerCount}
            likes={likes}
            onLike={sendLike}
            chatMessages={mobileChatMessages}
            onSendMessage={sendMobileChatMessage}
            currentUserId={currentUserId}
            hearts={hearts}
            addHeart={addHeart}
            floatingEmojis={floatingEmojis}
            onEmojiReact={addEmoji}
            videoContainerRef={videoContainerRef as React.RefObject<HTMLElement>}
            giftPanelContent={
              <ConcertGiftPanel concertId={id!} artistId={concert.artist_id || artistId} artistName={concert.artist_name} />
            }
            leaderboardContent={<GiftLeaderboard concertId={id!} />}
            title={concert.title}
            artistName={concert.artist_name}
            badgeLabel="CONCERT"
            onQuitLive={handleLeaveConcert}
            rightTopContent={
              <ShareButton contentType="concert" contentId={id!} title={concert.title} variant="overlay" />
            }
            description={concert.description || undefined}
            timerContent={undefined}
            recordingContent={
              isOrganizer && hostStream ? (
                <ConcertRecordingControls
                  stream={hostStream}
                  concertId={id!}
                  userId={currentUserId!}
                  isArtistConcert={concert.is_artist_concert}
                  onRecordingSaved={() => refetch()}
                />
              ) : undefined
            }
            isArtist={isOrganizer || false}
            artistControls={isOrganizer && hostStream && hostControls ? {
              isStreaming: hostControls.isStreaming,
              isPaused: hostControls.isPaused,
              isCameraOn: hostControls.isCameraOn,
              isMicOn: hostControls.isMicOn,
              onPause: hostControls.pauseStreaming,
              onResume: hostControls.resumeStreaming,
              onStop: hostControls.stopStreaming,
              onToggleCamera: hostControls.handleToggleCamera,
              onToggleMic: hostControls.handleToggleMic,
              onSwitchCamera: hostControls.handleSwitchCamera,
            } : undefined}
            sponsorAdContent={id && concert && ((concert as any).allows_sponsor_ads !== false) ? (
              <SponsorAdBroadcast
                eventType={concert.is_artist_concert ? "artist_concert" : "concert"}
                eventId={id}
                canTrigger={!!isOrganizer}
              />
            ) : undefined}
          />
          {/* Viewer-side sponsor ad listener: always mounted for non-organizers so
              spectators see the fullscreen ad overlay when the organizer triggers a pub. */}
          {!isOrganizer && id && ((concert as any).allows_sponsor_ads !== false) && (
            <SponsorAdBroadcast
              eventType={concert.is_artist_concert ? "artist_concert" : "concert"}
              eventId={id}
              canTrigger={false}
            />
          )}
        </div>
      </div>
    );
  }

  // ===== DESKTOP LAYOUT =====
  return (
    <div className="min-h-screen bg-background">
      <ScheduledAccessGate
        type="concert"
        scheduledAt={concert.scheduled_date}
        status={concert.status}
        eventId={concert.id}
        ticketPrice={Number((concert as any).ticket_price) || 0}
        isActor={!!isOrganizer || isArtist}
        hasTicket={hasTicket}
        isAuthenticated={!!currentUserId}
        onPurchased={() => setHasTicket(true)}
      />
      <BannedAccessGate streamType="concert" streamId={id!} currentUserId={currentUserId} />
      <Header />
      <main className="container mx-auto px-4 pt-24 pb-8">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/concerts")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("returnBtn")}
          </Button>
          <ShareButton contentType="concert" contentId={id!} title={concert.title} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Video Stream */}
          <div className="lg:col-span-3">
            <Card className="bg-card border-border overflow-hidden">
              {/* WebRTC Video Area */}
              <VideoZoomWrapper isFocused className="relative aspect-video bg-black" label={concert.title}>
                <div className="w-full h-full" ref={videoContainerRef}>
                {isOrganizer && currentUserId ? (
                  <WebRTCHost
                    roomId={roomId}
                    hostId={currentUserId}
                    hostName={concert.artist_name}
                    onStreamStart={handleStreamStart}
                    onStreamStop={handleStreamStop}
                    onStreamReady={(stream) => setHostStream(stream)}
                  />
                ) : currentUserId ? (
                  <WebRTCViewer
                    roomId={roomId}
                    viewerId={currentUserId}
                    concertTitle={concert.title}
                    artistName={concert.artist_name}
                    artistAvatarUrl={(concert as any).image_url || null}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20">
                    <div className="text-center">
                      <p className="text-white text-xl font-bold">{concert.title}</p>
                      <p className="text-white/70">{concert.artist_name}</p>
                      <p className="text-white/50 mt-4">{t("loginToWatchConcert")}</p>
                    </div>
                  </div>
                )}
                
                {/* Floating reactions */}
                <FloatingHearts hearts={hearts} />
                <FloatingEmojis emojis={floatingEmojis} />
                {id && <TopDonorBubble contextType="concert" contextId={id} />}
                {/* Sponsor ad triggers are rendered inline below in the action row to avoid covering other buttons */}

                {/* Top overlay bar: badge, viewer count, timer, likes */}
                <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
                  <div className="flex items-center gap-2">
                    {isLive && (
                      <Badge className="bg-destructive text-destructive-foreground animate-pulse">🎵 CONCERT</Badge>
                    )}
                    <Badge variant="outline" className="bg-background/50 text-foreground border-border/30">
                      <Users className="w-3 h-3 mr-1" /> {viewerCount}
                    </Badge>
                  </div>
                  <div className="bg-background/50 backdrop-blur-sm text-foreground px-4 py-2 rounded-full font-bold flex items-center gap-2">
                    <Heart className="w-5 h-5 fill-destructive text-destructive" />
                    {formatLikeCount(likes)}
                  </div>
                </div>

                {/* Fullscreen toggle (desktop) */}
                <div className="absolute bottom-4 left-4 z-20">
                  <FullscreenButton targetRef={videoContainerRef} />
                </div>
                </div>
              </VideoZoomWrapper>
              
              <CardContent className="p-4">
                <h1 className="text-2xl font-bold text-foreground mb-2">
                  {concert.title}
                </h1>
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => concert.artist_id && navigate(`/artist/${concert.artist_id}`)}
                    className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                  >
                    {concert.artist_name}
                  </button>
                  {currentUserId && concert.artist_id && currentUserId !== concert.artist_id && (
                    <FollowArtistButton artistId={concert.artist_id} currentUserId={currentUserId} size="sm" />
                  )}
                </div>
                <div className="mb-3">
                  <EmojiReactionBar onReact={addEmoji} />
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {/* Recording controls for organizer */}
                  {isOrganizer && hostStream && (
                    <ConcertRecordingControls
                      stream={hostStream}
                      concertId={id!}
                      userId={currentUserId!}
                      isArtistConcert={concert.is_artist_concert}
                      onRecordingSaved={() => refetch()}
                    />
                  )}

                  {/* Sponsor ad — viewer overlay always mounted; controls only for organizer */}
                  {id && ((concert as any).allows_sponsor_ads !== false) && (
                    <SponsorAdBroadcast
                      eventType={concert.is_artist_concert ? "artist_concert" : "concert"}
                      eventId={id}
                      canTrigger={!!isOrganizer}
                    />
                  )}

                  <Button
                    onClick={sendLike}
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                  >
                     <Heart className="w-4 h-4 mr-2" />
                     {t("likeBtn")}
                  </Button>

                  {!isOrganizer && (
                    <Button
                      onClick={handleLeaveConcert}
                      variant="destructive"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      {t("leaveConcert")}
                    </Button>
                  )}

                  <LiveReportButton
                    streamType="concert"
                    liveId={id!}
                    viewerCount={viewerCount}
                    isArtist={!!isOrganizer}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Chat & Gifts */}
          <div className="lg:col-span-1 space-y-4">
            <ConcertGiftPanel
              concertId={id!}
              artistId={concert.artist_id || artistId}
              artistName={concert.artist_name}
            />
            {/* Quick Tip for concert artist */}
            {artistId && (
              <QuickTip
                recipientIds={[{ id: artistId, name: concert.artist_name || "Artiste" }]}
              />
            )}
            {/* Gift Leaderboard */}
            <GiftLeaderboard concertId={id!} />
            {isOrganizer && id && concert && (
              <SponsorAdHistoryPanel
                eventType={concert.is_artist_concert ? "artist_concert" : "concert"}
                eventId={id}
              />
            )}
            <div className="h-[400px] overflow-hidden">
              <ThreadedChat chatType="concert" entityId={id!} hostId={(concert as any)?.artist_id ?? null} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ConcertLive;
