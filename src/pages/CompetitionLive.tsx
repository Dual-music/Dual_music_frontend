/**
 * Page: CompetitionLive — direct multi-candidats (online) ou single-host
 * (onsite). Réutilise LiveKit + tous les composants d'engagement
 * professionnels alignés sur Duels / Concerts / Lives :
 *  - chat threadé, votes, cadeaux (avec animations broadcast)
 *  - cœurs flottants + emojis flottants (Realtime broadcast)
 *  - compteur de spectateurs (Supabase Presence)
 *  - chrono performer, classement final
 *  - publicités sponsor, signalement, partage
 *  - bannissement (manager), top donateur
 *  - plein écran desktop + `MobileStreamOverlay` plein écran mobile
 *    (mêmes privilèges que duel/live/concert)
 *
 * Contrôle d'accès :
 *  - Toujours autorisé : manager propriétaire, admin.
 *  - Spectateurs : autorisés si compétition gratuite, sinon billet requis.
 *  - Bannis (`competition_bans`) : `BannedAccessGate` les bloque.
 *
 * EN — Competition live stage with full engagement parity vs duel/live/
 * concert (hearts, emojis, gifts, presence, fullscreen, mobile overlay).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import SEO from "@/components/seo/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { getDisplayProfiles } from "@/api/endpoints/users";
import * as competitionsApi from "@/api/endpoints/competitions";
import { useAuth } from "@/contexts/AuthContext";
import { useEventChat } from "@/realtime/useEventChat";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";
import { usePresence, useRoomEvent } from "@/realtime/useRoom";
import { useStreamBan } from "@/hooks/useStreamBan";
import { ThreadedChat } from "@/components/chat/ThreadedChat";
import { ShareButton } from "@/components/sharing/ShareButton";
import { LiveReportButton } from "@/components/streaming/LiveReportButton";
import CompetitionLiveStage, {
  type CompetitionStageControls,
} from "@/components/competition/CompetitionLiveStage";
import CompetitionVotePanel from "@/components/competition/CompetitionVotePanel";
import CompetitionGiftPanel from "@/components/competition/CompetitionGiftPanel";
import CompetitionLeaderboard from "@/components/competition/CompetitionLeaderboard";
import CompetitionPerformerTimer from "@/components/competition/CompetitionPerformerTimer";
import PerformerController from "@/components/competition/PerformerController";
import CompetitionFinalRanking from "@/components/competition/CompetitionFinalRanking";
import { RecordingButton } from "@/components/recording/RecordingButton";
import { BannedAccessGate } from "@/components/streaming/BannedAccessGate";
import { ScheduledAccessGate } from "@/components/scheduling/ScheduledAccessGate";
import SponsorAdBroadcast from "@/components/sponsor/SponsorAdBroadcast";
import TopDonorBubble from "@/components/animations/TopDonorBubble";
import { FloatingHearts, useBroadcastHearts, formatLikeCount } from "@/components/animations/FloatingHearts";
import { FloatingEmojis, EmojiReactionBar, useBroadcastEmojis } from "@/components/animations/FloatingEmojis";
import { FullscreenButton } from "@/components/streaming/FullscreenButton";
import { MobileStreamOverlay } from "@/components/streaming/MobileStreamOverlay";
import { GiftAnimationWithSound } from "@/components/animations/GiftAnimationWithSound";
import { StandardGiftNotification } from "@/components/animations/StandardGiftNotification";
import { Trophy, Heart, Users } from "lucide-react";
import { AuthRequiredDialog } from "@/components/auth/AuthRequiredDialog";
import { GiftLeaderboard } from "@/components/duel/GiftLeaderboard";
import { WinnerAnnouncement } from "@/components/animations/WinnerAnnouncement";

interface GiftAnim {
  eventId: string;
  giftName: string;
  giftImage: string;
  senderName: string;
  recipientName: string;
  price: number;
}

const CompetitionLive = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const { user, roles, profile } = useAuth();
  const displayName = profile?.full_name || "Viewer";
  const [comp, setComp] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [hasTicket, setHasTicket] = useState(false);
  const [hostStream, setHostStream] = useState<MediaStream | null>(null);
  const viewerCount = usePresence("competition", id ?? null);
  const [peerCount, setPeerCount] = useState(0);
  const [controls, setControls] = useState<CompetitionStageControls | null>(null);
  // Bande de vignettes multi-cam (compétition en ligne, plusieurs candidats) actuellement
  // affichée — décale le rail d'icônes de MobileStreamOverlay pour ne pas s'y superposer.
  const [thumbsVisible, setThumbsVisible] = useState(false);
  const [activeGiftAnim, setActiveGiftAnim] = useState<GiftAnim | null>(null);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const seenGiftIdsRef = useRef<Set<string>>(new Set());
  // Dédup cross-canal (peer web ↔ event serveur `gift`) par signature `expéditeur:prix`.
  const giftSigRef = useRef<Map<string, number>>(new Map());
  const claimGiftSig = (sig: string): boolean => {
    const now = Date.now();
    const map = giftSigRef.current;
    for (const [k, ts] of map) if (now - ts > 5000) map.delete(k);
    if (map.has(sig)) return false;
    map.set(sig, now);
    return true;
  };

  const isManager = user?.id === comp?.manager_id;
  const isAdmin = roles.includes("admin");
  const myCandidate = candidates.find((c) => c.artist_id === user?.id && c.status === "approved");
  const isApprovedCandidate = !!myCandidate;

  const { isCurrentUserBanned, bannedIds, banUser } = useStreamBan({
    streamType: "competition" as any,
    streamId: id || "",
    currentUserId: user?.id,
  });

  // Micro coupé d'autorité par l'organisateur — diffusion éphémère peer-to-peer (parité duel
  // `duel-mute-<id>`, pas de colonne backend : c'est un contrôle en direct, pas un état persisté).
  const [mutedArtistIds, setMutedArtistIds] = useState<Set<string>>(new Set());
  const { broadcast: broadcastMute } = useRoomBroadcast(id ? `competition-mute-${id}` : null, (event, payload) => {
    const artistId = (payload as { artistId?: string })?.artistId;
    if (!artistId) return;
    setMutedArtistIds((prev) => {
      const next = new Set(prev);
      if (event === "FORCE_MUTE") next.add(artistId); else if (event === "FORCE_UNMUTE") next.delete(artistId);
      return next;
    });
  });
  const toggleMuteArtist = (artistId: string) => {
    const shouldMute = !mutedArtistIds.has(artistId);
    setMutedArtistIds((prev) => {
      const next = new Set(prev);
      if (shouldMute) next.add(artistId); else next.delete(artistId);
      return next;
    });
    broadcastMute(shouldMute ? "FORCE_MUTE" : "FORCE_UNMUTE", { artistId });
  };
  const banCandidate = async (artistId: string) => {
    const ok = await banUser(artistId);
    if (ok) toast({ title: t("userBannedSuccess") || "Utilisateur banni" });
  };

  // Célébration du vainqueur (aperçu, ne clôture PAS la compétition) — diffusion éphémère
  // peer-to-peer sur `competition-winner-<id>`, parité duel ET mobile (`announceWinnerAuto` /
  // `competition-winner-<id>` déjà émis côté Android) : le web n'avait aucun listener pour ce
  // canal, donc l'annonce ne s'affichait que sur l'appareil du manager qui la déclenchait —
  // jamais chez les autres spectateurs, y compris sur web (signalé — comparé au fonctionnement
  // déjà correct de la pub sponsor, qui elle est un vrai événement serveur écouté par tous).
  const [winnerAnnouncement, setWinnerAnnouncement] = useState<{ name: string; avatar: string | null; votes: number; percent?: number } | null>(null);
  const { broadcast: broadcastWinner } = useRoomBroadcast(id ? `competition-winner-${id}` : null, (event, payload) => {
    if (event === "winner_announced") setWinnerAnnouncement(payload as { name: string; avatar: string | null; votes: number; percent?: number });
    else if (event === "winner_stopped") setWinnerAnnouncement(null);
  });
  const announceWinner = () => {
    const ranked = [...candidates].sort(
      (a, b) => (Number(b.total_votes) + Number(b.total_gifts_credits)) - (Number(a.total_votes) + Number(a.total_gifts_credits)),
    );
    const top = ranked[0];
    if (!top) return;
    const winnerProfile = profiles[top.artist_id];
    const payload = {
      name: winnerProfile?.full_name || t("compWinner") || "Vainqueur",
      avatar: winnerProfile?.avatar_url || null,
      votes: Number(top.total_votes) + Number(top.total_gifts_credits),
    };
    setWinnerAnnouncement(payload);
    broadcastWinner("winner_announced", payload);
  };
  const handleStopWinnerAnnouncement = () => {
    setWinnerAnnouncement(null);
    broadcastWinner("winner_stopped", {});
  };

  // --- Hearts (likes) + emojis broadcasts ---------------------------------
  const heartsChannelName = id ? `competition-hearts-${id}` : null;
  const emojisChannelName = id ? `competition-emojis-${id}` : null;
  const { hearts, broadcastHeart, likeCount } = useBroadcastHearts(heartsChannelName);
  const { emojis, broadcastEmoji } = useBroadcastEmojis(emojisChannelName);

  // --- Data loaders -------------------------------------------------------
  const loadComp = async () => {
    if (!id) return;
    try {
      const data = await competitionsApi.getCompetition(id);
      setComp(data);
    } catch {
      setComp(null);
    }
  };

  useEffect(() => { loadComp(); }, [id]);

  // Ticket ownership (was competition_tickets read).
  useEffect(() => {
    if (!id || !user) { setHasTicket(false); return; }
    (async () => {
      try {
        const res = await competitionsApi.myTicket(id);
        setHasTicket(!!res.hasTicket);
      } catch {
        setHasTicket(false);
      }
    })();
  }, [id, user]);

  const loadCandidates = async () => {
    if (!id) return;
    const list = ((await competitionsApi.listCandidates(id)) as any[])
      .filter((c) => c.status === "approved");
    setCandidates(list);
    const ids = new Set<string>(list.map((c: any) => c.artist_id));
    if (comp?.manager_id) ids.add(comp.manager_id);
    if (ids.size) {
      const profs = await getDisplayProfiles(Array.from(ids));
      const map: Record<string, any> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p; });
      setProfiles(map);
    }
  };

  useEffect(() => {
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, comp?.manager_id]);

  // Realtime competition + candidate status — backend emits `status` on the
  // /live competition room. (Candidate-approval changes have no dedicated emit
  // yet, so they piggy-back on the status tick reload — see gap list.)
  useRoomEvent("/live", "competition", id ?? null, "status", () => {
    loadComp();
    loadCandidates();
  });

  // Bridge mobile → web : l'organisateur peut désigner le performeur depuis le mobile
  // (backend émet `performer`) → on recharge la compétition pour rafraîchir le minuteur.
  useRoomEvent("/live", "competition", id ?? null, "performer", () => {
    loadComp();
  });

  // Realtime scores/gifts sync — backend émet `candidates:updated` sur la room
  // compétition après un vote (public/jury) ou un cadeau ciblé sur un candidat.
  // On recharge les candidats pour rafraîchir le classement (voix + cadeaux) et
  // le top donateur, sans actualisation manuelle, en parité mobile.
  useRoomEvent("/live", "competition", id ?? null, "candidates:updated", () => {
    loadCandidates();
  });

  // --- Gift animation broadcast listener (ephemeral peer broadcast) --------
  // Kept channel name `room_comp-<id>`, event `gift_animation`, payload shape.
  useRoomBroadcast(id ? `room_comp-${id}` : null, (event, payload) => {
    if (event !== "gift_animation") return;
    const p = (payload ?? {}) as any;
    const eventId = p.event_id || p.eventId;
    if (eventId && seenGiftIdsRef.current.has(eventId)) return;
    if (eventId) {
      seenGiftIdsRef.current.add(eventId);
      setTimeout(() => seenGiftIdsRef.current.delete(eventId), 10000);
    }
    // Réserve la signature partagée : bloque l'event serveur `gift` correspondant.
    if (!claimGiftSig(`${p.user_id ?? p.from_user_id ?? ""}:${Math.round(Number(p.price) || 0)}`)) return;
    setActiveGiftAnim({
      eventId: eventId || crypto.randomUUID(),
      giftName: p.gift_name || p.giftName || "Cadeau",
      giftImage: p.gift_image || p.giftImage || "🎁",
      senderName: p.user_name || p.senderName || (t("userDefault") || "Fan"),
      recipientName: p.recipient_name || p.recipientName || (t("recipientLabel") || "Artiste"),
      price: Number(p.price) || 0,
    });
  });

  // Bridge mobile → web : cadeau de compétition envoyé depuis le MOBILE (backend émet `gift`
  // vers la room compétition). On l'écoute ici, en ignorant ses propres envois et en
  // dédupliquant via la signature partagée avec le canal peer.
  useRoomEvent<{ to_user_id?: string; from_user_id?: string; value?: number }>(
    "/live",
    "competition",
    id ?? null,
    "gift",
    async (p) => {
      const from = p?.from_user_id ?? "";
      if (!from || from === user?.id) return;
      const price = Math.round(Number(p?.value) || 0);
      if (!claimGiftSig(`${from}:${price}`)) return;
      let senderName = t("userDefault") || "Fan";
      try {
        const sp = await getDisplayProfiles([from]);
        senderName = (sp as any[])?.[0]?.full_name || senderName;
      } catch {
        /* fallback sur le libellé générique */
      }
      const recipientName = (p?.to_user_id && profiles[p.to_user_id]?.full_name) || (t("recipientLabel") || "Artiste");
      setActiveGiftAnim({
        eventId: crypto.randomUUID(),
        giftName: "Cadeau",
        giftImage: "🎁",
        senderName,
        recipientName,
        price,
      });
    },
  );

  // --- Auto-fullscreen on mobile entry ------------------------------------
  useEffect(() => {
    if (!isMobile) return;
    const tm = setTimeout(() => {
      const el = videoContainerRef.current;
      if (el && !document.fullscreenElement) {
        el.requestFullscreen?.().catch(() => {});
      }
    }, 1500);
    return () => clearTimeout(tm);
  }, [isMobile]);

  // --- Mobile chat plumbing (REST history + Socket.IO realtime) -----------
  const chat = useEventChat("competition", id ?? null);
  const mobileMessages = useMemo(
    () =>
      chat.messages.map((m) => ({
        ...m,
        user_name: m.profile?.full_name,
        avatar_url: m.profile?.avatar_url,
      })),
    [chat.messages],
  );

  const sendMobileMessage = async (msg: string, parentId?: string | null) => {
    if (!user || !msg.trim()) return;
    await chat.send(msg.trim(), parentId);
  };


  // --- Like action --------------------------------------------------------
  const sendLike = () => { broadcastHeart(); };

  // ------------------------------------------------------------------------
  if (!comp) return <div className="min-h-screen bg-background"><Header /><main className="container py-6">…</main></div>;

  // Auth gate for anonymous visitors
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-10 max-w-md mx-auto text-center">
          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary to-amber-400 flex items-center justify-center">
              <Trophy className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-2">{t("compAuthRequired") || "Connexion requise pour rejoindre le direct"}</h2>
            <p className="text-sm text-muted-foreground mb-6">{comp.title}</p>
            <Button className="w-full" onClick={() => navigate("/auth")}>{t("signIn") || "Se connecter"}</Button>
          </div>
        </main>
        <AuthRequiredDialog open onOpenChange={() => navigate("/competitions")} />
      </div>
    );
  }

  if (isCurrentUserBanned) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <BannedAccessGate streamType={"competition" as any} streamId={id || ""} currentUserId={user?.id} fallbackRoute="/competitions" />
      </div>
    );
  }

  const canAccess = isManager || isAdmin || !comp.is_public_paid || hasTicket;
  if (!canAccess) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-10 text-center">
          <p className="text-lg mb-4">{t("compTicketRequired")}</p>
          <Button onClick={() => navigate(`/competition/${comp.id}`)}>{t("compBuyTicket")}</Button>
        </main>
      </div>
    );
  }

  const finalize = async () => {
    try {
      await competitionsApi.finalize(comp.id);
      toast({ title: t("compFinalized") });
      loadComp();
    } catch (e: any) {
      toast({ title: e?.message, variant: "destructive" });
    }
  };

  const currentPerformer = candidates.find((c) => c.id === comp.current_performer_id);
  const currentPerformerName = currentPerformer
    ? profiles[currentPerformer.artist_id]?.full_name || ""
    : null;

  const artistControlsConfig = controls && controls.canPublish ? {
    isStreaming: controls.isStreaming,
    isPaused: controls.isPaused,
    isCameraOn: controls.isCameraOn,
    isMicOn: controls.isMicOn,
    onPause: controls.onPause,
    onResume: controls.onResume,
    onStop: controls.onStop,
    onToggleCamera: controls.onToggleCamera,
    onToggleMic: controls.onToggleMic,
    onSwitchCamera: controls.onSwitchCamera,
  } : undefined;

  const managerProfile = profiles[comp.manager_id];
  const giftPanelContent = user && !isManager ? (
    <CompetitionGiftPanel
      candidates={candidates}
      profiles={profiles}
      competitionId={comp.id}
      managerId={comp.manager_id}
      managerName={managerProfile?.full_name || null}
    />
  ) : null;

  const votePanelContent = user && !isManager ? (
    <CompetitionVotePanel candidates={candidates} profiles={profiles} />
  ) : null;

  const leaderboardContent = (
    <div className="space-y-3">
      <CompetitionLeaderboard
        competitionId={comp.id}
        profiles={profiles}
        isManager={isManager}
        mutedArtistIds={mutedArtistIds}
        onToggleMute={toggleMuteArtist}
        onBanCandidate={banCandidate}
      />
      <GiftLeaderboard competitionId={comp.id} />
    </div>
  );

  const timerContent = (
    <CompetitionPerformerTimer
      startedAt={comp.current_performer_started_at}
      durationSec={comp.current_performer_duration_sec}
      performerName={currentPerformerName}
    />
  );

  const managerControlsContent = isManager ? (
    <div className="space-y-2">
      <PerformerController competitionId={comp.id} candidates={candidates} profiles={profiles} />
      <Button
        onClick={announceWinner}
        className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
        size="sm"
        disabled={!!winnerAnnouncement || candidates.length === 0}
      >
        <Trophy className="w-4 h-4 mr-2" /> {t("announceWinner") || "Annoncer le vainqueur"}
      </Button>
      <Button onClick={finalize} className="w-full" variant="default" size="sm">
        <Trophy className="w-4 h-4 mr-2" /> {t("compFinalize")}
      </Button>
    </div>
  ) : null;

  const recordingContent = isManager ? (
    <RecordingButton sourceType="competition" sourceId={comp.id} />
  ) : null;

  // Sponsor ad: mount for the manager (with trigger UI). Viewers get their own
  // silent listener rendered further down so they see the ad even when the
  // manager triggers it.
  const sponsorAdContent = isManager ? (
    <SponsorAdBroadcast eventType="competition" eventId={comp.id} canTrigger={isManager} />
  ) : null;

  const videoStageNode = (
    <>
      <CompetitionLiveStage
        competition={comp}
        currentUserId={user?.id || ""}
        isHost={isManager}
        isCandidate={comp.mode === "online" && isApprovedCandidate}
        displayName={displayName}
        onLocalStream={isManager ? setHostStream : undefined}
        onControlsReady={setControls}
        onPeerCountChange={setPeerCount}
        fullBleed={isMobile}
        mutedArtistIds={mutedArtistIds}
        bannedArtistIds={bannedIds}
        profiles={profiles}
        onThumbnailsVisibleChange={setThumbsVisible}
      />
      <FloatingHearts hearts={hearts} />
      <FloatingEmojis emojis={emojis} />
      <div className="hidden md:flex absolute top-2 right-2 gap-2 z-20">

        <Button
          size="icon"
          variant="ghost"
          onClick={sendLike}
          className="bg-black/50 hover:bg-black/70 text-white h-8 w-8"
          title={t("like") || "J'aime"}
        >
          <Heart className="w-4 h-4 text-rose-400" />
        </Button>
        <FullscreenButton targetRef={videoContainerRef} />
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <SEO title={`${comp.title} — ${t("compStatusLive")}`} description={comp.description || comp.title} />
      <Header />
      <ScheduledAccessGate
        type="competition"
        scheduledAt={comp.start_at}
        status={comp.status}
        eventId={comp.id}
        ticketPrice={comp.is_public_paid ? Number(comp.viewer_ticket_price) || 0 : 0}
        isActor={isManager || isAdmin}
        hasTicket={hasTicket}
        isAuthenticated={!!user}
        onPurchased={() => setHasTicket(true)}
      />

      {/* Mobile: full-screen video container that MobileStreamOverlay overlays */}
      {isMobile && (
        <div ref={videoContainerRef} className="fixed inset-0 z-[60] bg-black">
          {videoStageNode}
          {/* Mobile full-screen overlay (TikTok-style) — must be a child of the
              fixed container so its `absolute inset-0` resolves against it. */}
          <MobileStreamOverlay
            isLive={comp.status === "live"}
            viewerCount={viewerCount}
            likes={likeCount}
            onLike={sendLike}
            chatMessages={mobileMessages}
            onSendMessage={sendMobileMessage}
            currentUserId={user?.id || null}
            hearts={hearts}
            floatingEmojis={emojis}
            onEmojiReact={broadcastEmoji}
            addHeart={sendLike}
            videoContainerRef={videoContainerRef}
            giftPanelContent={giftPanelContent}
            leaderboardContent={leaderboardContent}
            votePanelContent={votePanelContent}
            timerContent={timerContent}
            managerControlsContent={managerControlsContent}
            recordingContent={recordingContent}
            sponsorAdContent={sponsorAdContent}
            title={comp.title}
            artistName={currentPerformerName || comp.title}
            badgeLabel="COMPÉTITION"
            hasTopThumbnails={thumbsVisible}
            isArtist={!!artistControlsConfig}
            artistControls={artistControlsConfig}
            description={comp.description}
            onQuitLive={() => navigate("/competitions")}
            compactArtistControls
          />
        </div>
      )}

      <main className={`container pt-24 md:pt-28 pb-6 space-y-4 ${isMobile ? "hidden" : ""}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold flex items-center gap-2"><Trophy className="w-5 h-5 text-primary" /> {comp.title}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="destructive">● {t("compStatusLive")}</Badge>
            <Badge variant="outline" className="gap-1"><Users className="w-3 h-3" /> {viewerCount}</Badge>
            <Badge variant="outline" className="gap-1"><Heart className="w-3 h-3 text-rose-500" /> {formatLikeCount(likeCount)}</Badge>
            {sponsorAdContent}
            <ShareButton contentType="duel" contentId={comp.id} title={comp.title} />
            {user && !isManager && (
              <LiveReportButton liveId={comp.id} viewerCount={viewerCount} isArtist={isApprovedCandidate} streamType="competition" />
            )}
          </div>
        </div>

        <TopDonorBubble contextType="competition" contextId={comp.id} />

        {timerContent}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-3 space-y-3">

            {!isMobile && (
              <div ref={videoContainerRef} className="relative">
                {videoStageNode}
              </div>
            )}

            <div className="hidden md:block">
              <EmojiReactionBar onReact={broadcastEmoji} />
            </div>

            {isManager && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card><CardContent className="p-3">{managerControlsContent}</CardContent></Card>
                <Card><CardContent className="p-3">{recordingContent}</CardContent></Card>
              </div>
            )}

            {leaderboardContent}
          </div>

          <div className="space-y-3">
            {votePanelContent}
            {giftPanelContent}
            <Card>
              <CardContent className="p-2 h-[400px]">
                <ThreadedChat
                  chatType={"competition" as any}
                  entityId={comp.id}
                  hostId={comp.manager_id}
                  chatEnabled={comp.chat_enabled}
                  onToggleChat={(enabled) => competitionsApi.updateCompetition(comp.id, { chatEnabled: enabled })}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Mobile overlay is rendered inside the fixed mobile container above
          (so its `absolute inset-0` resolves against the video). On desktop
          the MobileStreamOverlay is intentionally not mounted. */}


      {/* Célébration du vainqueur (aperçu, diffusée à tous — voir hook plus haut) */}
      {winnerAnnouncement && (
        <WinnerAnnouncement
          winnerName={winnerAnnouncement.name}
          winnerAvatar={winnerAnnouncement.avatar}
          winnerVotes={winnerAnnouncement.votes}
          onStop={handleStopWinnerAnnouncement}
          canDismiss={isManager || isAdmin}
        />
      )}

      {/* Gift broadcast animation overlay */}
      {activeGiftAnim && (
        activeGiftAnim.price < 10 ? (
          <StandardGiftNotification
            giftName={activeGiftAnim.giftName}
            giftImage={activeGiftAnim.giftImage}
            senderName={activeGiftAnim.senderName}
            recipientName={activeGiftAnim.recipientName}
            onComplete={() => setActiveGiftAnim(null)}
          />
        ) : (
          <GiftAnimationWithSound
            giftName={activeGiftAnim.giftName}
            giftImage={activeGiftAnim.giftImage}
            senderName={activeGiftAnim.senderName}
            recipientName={activeGiftAnim.recipientName}
            enableSound={activeGiftAnim.price >= 50}
            onComplete={() => setActiveGiftAnim(null)}
          />
        )
      )}

      {(comp.status === "finished" || comp.winner_announced_at) && (
        <CompetitionFinalRanking
          competitionId={comp.id}
          profiles={profiles}
          canDismiss={isManager || isAdmin}
        />
      )}
      {/* Viewer-side sponsor ad listener: renders the fullscreen ad overlay
          for spectators when the manager triggers a sponsor pub. The trigger
          UI is hidden because `canTrigger` is false for non-managers. */}
      {!isManager && (
        <SponsorAdBroadcast eventType="competition" eventId={comp.id} canTrigger={false} />
      )}
    </div>
  );
};

export default CompetitionLive;
