/**
 * Page: DuelLive (/duels/:id/live)
 *
 * Salle live d'un duel d'artistes. Orchestre la diffusion WebRTC double-cam
 * via `WebRTCDuelStream` (LiveKit SFU), le minuteur synchronisé serveur
 * (`DuelVideoTimer` — état persistant en DB), les votes payants (`VotePanel`,
 * RPC atomique), les cadeaux virtuels (`GiftPanel` + animations broadcastées),
 * le chat threadé (`ThreadedChat`) et les annonces sponsor.
 *
 * Rôles & UI :
 *   - Hôte (artiste participant) : contrôles caméra/micro, flip cam, focus mode.
 *   - Manager (si assigné, exclusif au duel) : Hard Mute, contrôles modération.
 *   - Spectateur : vote, gift, chat, réactions emoji/cœurs (broadcast channel).
 *
 * Sécurité : portails z-index 220 pour les animations cadeaux, failsafe timers
 * sur les annonces gagnant. Tout achat passe par RPC pour éviter les races.
 *
 * @route   /duels/:id/live
 * @see     src/components/duel/WebRTCDuelStream.tsx
 * @see     src/components/duel/VotePanel.tsx, GiftPanel.tsx
 * @see     supabase/functions/livekit-token
 */
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getDisplayProfiles } from "@/api/endpoints/users";
import * as duels from "@/api/endpoints/duels";
import * as lives from "@/api/endpoints/lives";
import * as gifts from "@/api/endpoints/gifts";
import { useAuth } from "@/contexts/AuthContext";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";
import { usePresence, useRoomEvent } from "@/realtime/useRoom";
import { useEventChat } from "@/realtime/useEventChat";
import { useLanguage } from "@/contexts/LanguageContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { WebRTCDuelStream, WebRTCDuelStreamHandle } from "@/components/duel/WebRTCDuelStream";
import { DuelVideoTimer } from "@/components/duel/DuelVideoTimer";
import { MobileDuelControls } from "@/components/duel/MobileDuelControls";
import VotePanel from "@/components/duel/VotePanel";
import GiftPanel from "@/components/duel/GiftPanel";
import { ThreadedChat } from "@/components/chat/ThreadedChat";
import { QuickTip } from "@/components/duel/QuickTip";
import { GiftLeaderboard } from "@/components/duel/GiftLeaderboard";

import { RecordingButton } from "@/components/recording/RecordingButton";
import { FloatingHearts, useBroadcastHearts, formatLikeCount } from "@/components/animations/FloatingHearts";
import { FloatingEmojis, EmojiReactionBar, useBroadcastEmojis } from "@/components/animations/FloatingEmojis";
import { TopDonorBubble } from "@/components/animations/TopDonorBubble";
import { SponsorAdBroadcast } from "@/components/sponsor/SponsorAdBroadcast";
import { SponsorAdHistoryPanel } from "@/components/sponsor/SponsorAdHistoryPanel";
import { GiftAnimationWithSound } from "@/components/animations/GiftAnimationWithSound";
import { StandardGiftNotification } from "@/components/animations/StandardGiftNotification";
import { WinnerAnnouncement } from "@/components/animations/WinnerAnnouncement";
import { FullscreenButton } from "@/components/streaming/FullscreenButton";
import { MobileStreamOverlay } from "@/components/streaming/MobileStreamOverlay";
import { FollowArtistButton } from "@/components/artist/FollowArtistButton";

import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Users, MicOff, Mic, Video, VideoOff, UserX, Timer, Heart, Maximize, Minimize, Eye, EyeOff, Trophy } from "lucide-react";
import { ShareButton } from "@/components/sharing/ShareButton";
import { ScheduledAccessGate } from "@/components/scheduling/ScheduledAccessGate";
import { BannedAccessGate } from "@/components/streaming/BannedAccessGate";
import { LiveReportButton } from "@/components/streaming/LiveReportButton";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface DuelChatMessage {
  id: string;
  created_at: string;
  duel_id: string;
  is_moderated: boolean | null;
  message: string;
  parent_id: string | null;
  user_id: string;
  user_name: string;
  avatar_url: string | null;
  reply_to_name?: string;
  reply_to_message?: string;
}

type StreamSlot = 'artist1' | 'artist2' | 'manager';

type MediaState = { isMicOn: boolean; isCameraOn: boolean; isStreaming: boolean; isPaused: boolean };

const DuelLive = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { user, roles } = useAuth();
  const currentUserId = user?.id ?? null;
  const userRoles = roles;
  const [duel, setDuel] = useState<any>(null);
  const [votes, setVotes] = useState({ artist1: 0, artist2: 0 });
  const viewersCount = usePresence("duel", id ?? null);
  const [loading, setLoading] = useState(true);
  const [focusedSlot, setFocusedSlot] = useState<StreamSlot | null>(null);
  // Épingle imposée par le manager (synchronisée à TOUS via `duel-focus-<id>`) — prime sur le focus local.
  const [forcedFocus, setForcedFocus] = useState<StreamSlot | null>(null);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [profiles, setProfiles] = useState<{ artist1?: Profile; artist2?: Profile; manager?: Profile }>({});
  const [hostStream, setHostStream] = useState<MediaStream | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [mutedArtists, setMutedArtists] = useState<{ [key: string]: boolean }>({});
  const [speakingTime, setSpeakingTime] = useState<number>(120);
  const [activeTimerTargetId, setActiveTimerTargetId] = useState<string | null>(null);
  const [managerTimerRemaining, setManagerTimerRemaining] = useState(0);
  const managerTimerDeadlineRef = useRef<number | null>(null);
  const [likes, setLikes] = useState(0);
  const [hasTicket, setHasTicket] = useState(false);
  const [winnerAnnouncement, setWinnerAnnouncement] = useState<{ name: string; avatar: string | null; votes: number } | null>(null);
  // Track media state for each slot (local + remote via broadcast)
  const [mediaStates, setMediaStates] = useState<Record<StreamSlot, MediaState>>({
    artist1: { isMicOn: false, isCameraOn: false, isStreaming: false, isPaused: false },
    artist2: { isMicOn: false, isCameraOn: false, isStreaming: false, isPaused: false },
    manager: { isMicOn: false, isCameraOn: false, isStreaming: false, isPaused: false },
  });
  const mediaStatesRef = useRef(mediaStates);
  const streamRefs = useRef<Record<StreamSlot, WebRTCDuelStreamHandle | null>>({ artist1: null, artist2: null, manager: null });
  const streamRefHandlers = useMemo<Record<StreamSlot, (handle: WebRTCDuelStreamHandle | null) => void>>(() => ({
    artist1: (handle) => { streamRefs.current.artist1 = handle; },
    artist2: (handle) => { streamRefs.current.artist2 = handle; },
    manager: (handle) => { streamRefs.current.manager = handle; },
  }), []);
  const { hearts, broadcastHeart: addHeart } = useBroadcastHearts(id ? `duel-hearts-${id}` : null);
  const { emojis: floatingEmojis, broadcastEmoji: addEmoji } = useBroadcastEmojis(id ? `duel-emojis-${id}` : null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  // Mobile threaded chat via REST history + Socket.IO (only active on mobile).
  const { messages: duelChatRaw, send: sendDuelChat } = useEventChat("duel", isMobile ? (id ?? null) : null);
  const translationRef = useRef(t);
  const seenGiftEventIdsRef = useRef<Set<string>>(new Set());
  // Dédup cross-canal (peer web ↔ event serveur `gift`) : le cadeau serveur n'a pas d'eventId,
  // on déduplique donc par signature `expéditeur:prix`. Le premier chemin qui arrive gagne, ce qui
  // évite toute double animation quand un cadeau web déclenche à la fois le peer ET l'event serveur.
  const giftSigRef = useRef<Map<string, number>>(new Map());
  const claimGiftSig = useCallback((sig: string): boolean => {
    const now = Date.now();
    const map = giftSigRef.current;
    for (const [k, ts] of map) if (now - ts > 5000) map.delete(k);
    if (map.has(sig)) return false;
    map.set(sig, now);
    return true;
  }, []);
  const giftContextRef = useRef<{
    artist1Id: string | null;
    artist2Id: string | null;
    managerId: string | null;
    artist1Name: string;
    artist2Name: string;
    managerName: string;
  }>({
    artist1Id: null,
    artist2Id: null,
    managerId: null,
    artist1Name: "Artiste 1",
    artist2Name: "Artiste 2",
    managerName: "Manager",
  });

  const timerChannelName = `duel-timer-${id}`;
  const giftChannelTopic = useMemo(() => {
    const duelRoomId = duel?.room_id || (id ? `duel-${id}` : null);
    return duelRoomId ? `room_${duelRoomId}` : null;
  }, [duel?.room_id, id]);

  // Gift animation state — driven by room broadcast (room_<roomId>)
  const [activeGiftAnim, setActiveGiftAnim] = useState<{
    eventId: string;
    giftName: string;
    giftImage: string;
    senderName: string;
    recipientName: string;
    price: number;
  } | null>(null);

  const applyPersistedTimerFromDb = useCallback((timerEndsAt: string | null, targetId: string | null) => {
    if (!timerEndsAt || !targetId) {
      managerTimerDeadlineRef.current = null;
      setActiveTimerTargetId(null);
      setManagerTimerRemaining(0);
      return;
    }

    const endAtTs = new Date(timerEndsAt).getTime();
    if (Number.isNaN(endAtTs) || endAtTs <= Date.now()) {
      managerTimerDeadlineRef.current = null;
      setActiveTimerTargetId(null);
      setManagerTimerRemaining(0);
      return;
    }

    managerTimerDeadlineRef.current = endAtTs;
    setActiveTimerTargetId(targetId);
    setManagerTimerRemaining(Math.max(0, Math.ceil((endAtTs - Date.now()) / 1000)));
  }, []);

  // ── Ephemeral peer broadcasts (Socket.IO /live), replacing supabase channels ──
  // Timer sync (duel-timer-<id>)
  const { broadcast: broadcastTimer } = useRoomBroadcast(id ? timerChannelName : null, (event, payload) => {
    if (event !== "duel_timer") return;
    const { action, targetId, endsAt } = (payload as { action?: string; targetId?: string | null; endsAt?: string | null }) ?? {};
    if (action === "stop") { applyPersistedTimerFromDb(null, null); return; }
    if (action === "start") { applyPersistedTimerFromDb(endsAt ?? null, targetId ?? null); }
  });

  // Manager hard-mute controls (duel-mute-<id>)
  const { broadcast: broadcastMute } = useRoomBroadcast(id ? `duel-mute-${id}` : null, (event, payload) => {
    const artistId = (payload as { artistId?: string })?.artistId;
    if (!artistId) return;
    if (event === "FORCE_MUTE") setMutedArtists((prev) => ({ ...prev, [artistId]: true }));
    else if (event === "FORCE_UNMUTE") setMutedArtists((prev) => ({ ...prev, [artistId]: false }));
  });

  // Manager focus pin (duel-focus-<id>) — le manager épingle une case → elle s'agrandit chez TOUS
  // les spectateurs (web + mobile). Payload `{ slot }` (null = focus libéré). Parité mobile.
  const { broadcast: broadcastFocus } = useRoomBroadcast(id ? `duel-focus-${id}` : null, (event, payload) => {
    if (event !== "focus") return;
    const slot = ((payload as { slot?: StreamSlot | null })?.slot) ?? null;
    setForcedFocus(slot);
  });

  // Like counter (duel-likes-<id>)
  const { broadcast: broadcastLike } = useRoomBroadcast(id ? `duel-likes-${id}` : null, (event, payload) => {
    if (event === "like") setLikes((payload as { count: number }).count);
  });

  // Winner announcement (duel-winner-<id>)
  const { broadcast: broadcastWinner } = useRoomBroadcast(id ? `duel-winner-${id}` : null, (event, payload) => {
    if (event === "winner_announced") setWinnerAnnouncement(payload as { name: string; avatar: string | null; votes: number });
    else if (event === "winner_stopped") setWinnerAnnouncement(null);
  });

  // Mobile chat rows enriched with author + reply metadata (built from REST/socket history).
  const mobileChatMessages = useMemo<DuelChatMessage[]>(() => {
    const byId = new Map(duelChatRaw.map((m) => [m.id, m]));
    return duelChatRaw.map((m) => {
      const parent = m.parent_id ? byId.get(m.parent_id) : null;
      const dm: DuelChatMessage = {
        id: m.id,
        created_at: m.created_at,
        duel_id: (m as { duel_id?: string }).duel_id ?? id ?? "",
        is_moderated: (m as { is_moderated?: boolean }).is_moderated ?? false,
        message: m.message,
        parent_id: m.parent_id ?? null,
        user_id: m.user_id,
        user_name: m.profile?.full_name || "Utilisateur",
        avatar_url: m.profile?.avatar_url ?? null,
        reply_to_name: parent ? (parent.profile?.full_name || "Utilisateur") : undefined,
        reply_to_message: parent ? (parent.message as string) : undefined,
      };
      return dm;
    });
  }, [duelChatRaw, id]);

  useEffect(() => {
    giftContextRef.current = {
      artist1Id: duel?.artist1_id ?? null,
      artist2Id: duel?.artist2_id ?? null,
      managerId: duel?.manager_id ?? null,
      artist1Name: profiles.artist1?.full_name || "Artiste 1",
      artist2Name: profiles.artist2?.full_name || "Artiste 2",
      managerName: profiles.manager?.full_name || "Manager",
    };
  }, [duel?.artist1_id, duel?.artist2_id, duel?.manager_id, profiles.artist1?.full_name, profiles.artist2?.full_name, profiles.manager?.full_name]);

  const triggerAnimation = useCallback((animation: {
    eventId?: string;
    giftName: string;
    giftImage: string;
    senderName: string;
    recipientName: string;
    price: number;
  }) => {
    setActiveGiftAnim({
      eventId: animation.eventId || crypto.randomUUID(),
      giftName: animation.giftName,
      giftImage: animation.giftImage,
      senderName: animation.senderName,
      recipientName: animation.recipientName,
      price: animation.price,
    });
  }, []);

  useEffect(() => {
    translationRef.current = t;
  }, [t]);

  const handleGiftAnimationBroadcast = useCallback(async (msg: any) => {
    const payload = msg.payload ?? {};
    console.log("Animation reçue via broadcast", payload);

    const eventId = payload.event_id ?? payload.eventId;
    if (eventId && seenGiftEventIdsRef.current.has(eventId)) return;
    if (eventId) {
      seenGiftEventIdsRef.current.add(eventId);
      setTimeout(() => seenGiftEventIdsRef.current.delete(eventId), 10000);
    }
    // Réserve la signature partagée : bloque l'event serveur `gift` correspondant (même cadeau).
    const peerSig = `${payload.user_id ?? payload.from_user_id}:${Math.round(Number(payload.price) || 0)}`;
    if (!claimGiftSig(peerSig)) return;

    const giftId = payload.gift_id ?? payload.giftId;
    const senderId = payload.user_id ?? payload.from_user_id;
    const recipientId = payload.to_user_id ?? payload.recipient_id;
    if (!giftId || !senderId) return;

    let giftName = payload.gift_name ?? payload.giftName;
    let giftImage = payload.gift_image ?? payload.giftImage;
    let giftPrice = Number(payload.price);
    const animationType = payload.animation_type as string | undefined;

    if (!giftName || !giftImage || Number.isNaN(giftPrice)) {
      let giftData: gifts.VirtualGift | undefined;
      try {
        const catalog = await gifts.listGifts();
        giftData = catalog.find((g) => g.id === giftId);
      } catch {
        /* non-blocking gift-catalog fallback lookup */
      }
      giftName = giftName || giftData?.name || "Cadeau";
      giftImage = giftImage || giftData?.image_url || "🎁";
      giftPrice = Number.isNaN(giftPrice) ? Number(giftData?.price_credits) || 0 : giftPrice;
    }

    if (Number.isNaN(giftPrice)) {
      giftPrice = animationType === "premium" ? 5 : 0;
    }

    let senderName = payload.user_name ?? payload.senderName;
    if (!senderName) {
      const senderProfiles = await getDisplayProfiles([senderId]);
      senderName = (senderProfiles as any[])?.[0]?.full_name || translationRef.current("userDefault");
    }

    const context = giftContextRef.current;
    const recipientFromPayload = payload.recipient_name ?? payload.recipientName;
    let recipientDisplayName = recipientFromPayload || translationRef.current("recipientLabel");

    if (!recipientFromPayload && recipientId) {
      if (recipientId === context.artist1Id) recipientDisplayName = context.artist1Name;
      else if (recipientId === context.artist2Id) recipientDisplayName = context.artist2Name;
      else if (recipientId === context.managerId) recipientDisplayName = context.managerName;
    }

    triggerAnimation({
      eventId: payload.event_id ?? payload.eventId,
      giftName,
      giftImage,
      senderName,
      recipientName: recipientDisplayName,
      price: Number.isNaN(giftPrice) ? 0 : giftPrice,
    });
  }, [triggerAnimation, claimGiftSig]);

  // Gift animation broadcast (room_<roomId>) — shared by all clients in the duel room.
  const { broadcast: broadcastGift } = useRoomBroadcast(giftChannelTopic, (event, payload) => {
    if (event !== "gift_animation") return;
    handleGiftAnimationBroadcast({ payload });
  });

  const sendGiftAnimationBroadcast = useCallback(async (payload: Record<string, unknown>) => {
    const eventId = (payload.event_id ?? payload.eventId ?? crypto.randomUUID()) as string;

    // Mark as seen immediately so the self-broadcast doesn't duplicate
    seenGiftEventIdsRef.current.add(eventId);
    setTimeout(() => seenGiftEventIdsRef.current.delete(eventId), 10000);
    // Réserve aussi la signature : bloque l'event serveur `gift` renvoyé à l'expéditeur.
    if (currentUserId) claimGiftSig(`${currentUserId}:${Math.round(Number(payload.price) || 0)}`);

    // Show animation locally for the sender IMMEDIATELY (no async wait)
    const giftPrice = Number(payload.price) || 0;
    triggerAnimation({
      eventId,
      giftName: (payload.giftName ?? payload.gift_name ?? "Cadeau") as string,
      giftImage: (payload.giftImage ?? payload.gift_image ?? "🎁") as string,
      senderName: (payload.senderName ?? payload.user_name ?? "Fan") as string,
      recipientName: (payload.recipientName ?? payload.recipient_name ?? "") as string,
      price: giftPrice,
    });

    // Relay to the other peers (sender is excluded — already shown locally above).
    broadcastGift("gift_animation", payload);
  }, [triggerAnimation, broadcastGift, currentUserId, claimGiftSig]);

  // Tick countdown (persistent from DB: current_timer_ends_at)
  useEffect(() => {
    if (!activeTimerTargetId || !managerTimerDeadlineRef.current) return;

    const tick = () => {
      if (!managerTimerDeadlineRef.current) return;

      const next = Math.max(0, Math.ceil((managerTimerDeadlineRef.current - Date.now()) / 1000));
      setManagerTimerRemaining(next);

      if (next > 0) return;

      managerTimerDeadlineRef.current = null;
      setActiveTimerTargetId(null);

      const canPersistStop = !!currentUserId && duel?.manager_id === currentUserId;
      if (!canPersistStop || !id) return;

      // Clear the persisted timer so late joiners don't see a stale countdown.
      duels
        .updateDuel(id, { currentTimerEndsAt: null, currentTimerTargetId: null })
        .catch(() => { /* non-blocking: broadcast below keeps live clients in sync */ });
      broadcastTimer("duel_timer", { action: "stop", targetId: null, endsAt: null });
    };

    tick();
    const interval = setInterval(tick, 250);

    return () => clearInterval(interval);
  }, [activeTimerTargetId, currentUserId, duel?.manager_id, id, broadcastTimer]);

  const broadcastTimerToAll = useCallback(async (action: "start" | "stop", targetId: string, value?: number) => {
    if (!id) return;

    // Only the manager may persist the timer; the backend also enforces this.
    const canPersist = !!currentUserId && duel?.manager_id === currentUserId;

    if (action === "start" && value) {
      const endsAt = new Date(Date.now() + value * 1000).toISOString();

      applyPersistedTimerFromDb(endsAt, targetId);

      // Persist so late joiners resume the running countdown; live clients also
      // get the broadcast immediately.
      if (canPersist) {
        duels
          .updateDuel(id, { currentTimerEndsAt: endsAt, currentTimerTargetId: targetId })
          .catch(() => { /* non-blocking */ });
      }
      broadcastTimer("duel_timer", { action: "start", targetId, endsAt });
      return;
    }

    applyPersistedTimerFromDb(null, null);

    if (canPersist) {
      duels
        .updateDuel(id, { currentTimerEndsAt: null, currentTimerTargetId: null })
        .catch(() => { /* non-blocking */ });
    }
    broadcastTimer("duel_timer", { action: "stop", targetId, endsAt: null });
  }, [id, applyPersistedTimerFromDb, broadcastTimer, currentUserId, duel?.manager_id]);

  // Mute toggle with FORCE_MUTE broadcast
  const toggleMuteArtist = useCallback((artistId: string) => {
    setMutedArtists((prev) => {
      const shouldMute = !prev[artistId];

      broadcastMute(shouldMute ? "FORCE_MUTE" : "FORCE_UNMUTE", { artistId });

      return { ...prev, [artistId]: shouldMute };
    });
  }, [broadcastMute]);

  useEffect(() => {
    mediaStatesRef.current = mediaStates;
  }, [mediaStates]);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Auto-fullscreen on mobile
  useEffect(() => {
    if (!isMobile || !videoContainerRef.current) return;
    const tryFullscreen = () => {
      if (videoContainerRef.current && !document.fullscreenElement) {
        videoContainerRef.current.requestFullscreen?.().catch(() => {});
      }
    };
    const timeout = setTimeout(tryFullscreen, 1500);
    const onFullscreenChange = () => {
      if (isMobile && !document.fullscreenElement && videoContainerRef.current) {
        setTimeout(tryFullscreen, 500);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => { clearTimeout(timeout); document.removeEventListener("fullscreenchange", onFullscreenChange); };
  }, [isMobile]);

  // Fetch votes
  const fetchVotes = async (artist1Id: string, artist2Id: string) => {
    if (!id) return;
    try {
      const data = (await duels.getDuelVotes(id)) as unknown as Array<{ artist_id: string; total: number | string }>;
      const a1 = Number(data.find((v) => v.artist_id === artist1Id)?.total ?? 0);
      const a2 = Number(data.find((v) => v.artist_id === artist2Id)?.total ?? 0);
      setVotes({ artist1: a1, artist2: a2 });
    } catch {
      /* ignore transient vote-fetch errors */
    }
  };

  useEffect(() => {
    if (!id) return;
    const fetchDuel = async () => {
      let data: any;
      try {
        data = await duels.getDuel(id);
      } catch {
        toast({ title: t("error"), description: t("loadingDuel"), variant: "destructive" }); navigate("/duels"); return;
      }
      setDuel(data); setStartedAt(data.started_at); applyPersistedTimerFromDb(data.current_timer_ends_at ?? null, data.current_timer_target_id ?? null); setLoading(false);
      fetchVotes(data.artist1_id, data.artist2_id);

      // Load persisted likes via REST (duel likes share the /lives likes endpoint).
      try {
        const { likes: likeCount } = await lives.getLikes(id);
        setLikes(likeCount);
      } catch {
        /* non-blocking */
      }

      // Check user ticket
      if (currentUserId) {
        try {
          const { hasTicket } = await duels.myTicket(id);
          setHasTicket(hasTicket);
        } catch {
          /* non-blocking */
        }
      }

      const profileIds = [data.artist1_id, data.artist2_id, data.manager_id].filter(Boolean);
      const profilesData = await getDisplayProfiles(profileIds);
      if (profilesData) {
        const pm: any = {};
        profilesData.forEach((p) => {
          if (p.id === data.artist1_id) pm.artist1 = p;
          if (p.id === data.artist2_id) pm.artist2 = p;
          if (p.id === data.manager_id) pm.manager = p;
        });
        setProfiles(pm);
      }
    };
    fetchDuel();
  }, [id, navigate, toast, applyPersistedTimerFromDb, currentUserId]);

  // Re-load the duel row (status + persisted timer) on a backend `status` tick.
  const refetchDuelState = useCallback(async () => {
    if (!id) return;
    try {
      const data: any = await duels.getDuel(id);
      setDuel((prev: any) => ({ ...(prev || {}), ...data }));
      applyPersistedTimerFromDb(data.current_timer_ends_at ?? null, data.current_timer_target_id ?? null);
    } catch {
      /* ignore transient refetch errors */
    }
  }, [id, applyPersistedTimerFromDb]);

  // Duel status/state — backend emits `status` on the /live duel room.
  useRoomEvent("/live", "duel", id ?? null, "status", () => { void refetchDuelState(); });

  // Realtime — the backend emits `vote` to the /live duel room on each vote; we
  // refetch the REST tally (duels.getDuelVotes) on that event. Viewer presence,
  // like counter, mobile chat and duel status also run over Socket.IO.
  // Live vote tally via Socket.IO (backend emits `vote` to the duel room).
  useRoomEvent("/live", "duel", id ?? null, "vote", () => {
    if (duel) fetchVotes(duel.artist1_id, duel.artist2_id);
  });

  // ── Bridge mobile → web : le backend émet des events SERVEUR pour toute action (y compris
  // depuis le mobile). On les écoute ici, avec dédup, pour que tout soit visible sur le web. ──

  // Cadeau venant du serveur (souvent envoyé depuis le mobile). On ignore ses propres envois
  // (déjà affichés en local) et on déduplique via la signature partagée avec le canal peer.
  useRoomEvent<{ to_user_id?: string; from_user_id?: string; value?: number }>(
    "/live",
    "duel",
    id ?? null,
    "gift",
    async (p) => {
      const from = p?.from_user_id ?? "";
      if (!from || from === currentUserId) return;
      const price = Math.round(Number(p?.value) || 0);
      if (!claimGiftSig(`${from}:${price}`)) return;
      let senderName = translationRef.current("userDefault");
      try {
        const sp = await getDisplayProfiles([from]);
        senderName = (sp as any[])?.[0]?.full_name || senderName;
      } catch {
        /* fallback sur le libellé générique */
      }
      const ctx = giftContextRef.current;
      const rid = p?.to_user_id;
      let recipientName = translationRef.current("recipientLabel");
      if (rid === ctx.artist1Id) recipientName = ctx.artist1Name;
      else if (rid === ctx.artist2Id) recipientName = ctx.artist2Name;
      else if (rid === ctx.managerId) recipientName = ctx.managerName;
      triggerAnimation({ giftName: "Cadeau", giftImage: "🎁", senderName, recipientName, price });
    },
  );

  // Minuteur de parole via l'event serveur `timer` (mobile PATCH → backend émet `timer`).
  useRoomEvent<{ ends_at?: string | null; target_id?: string | null }>(
    "/live",
    "duel",
    id ?? null,
    "timer",
    (p) => {
      applyPersistedTimerFromDb(p?.ends_at ?? null, p?.target_id ?? null);
    },
  );

  // NB : pas de bannière "vainqueur" dérivée de l'event serveur `status` (winner_id) ici — ce
  // mécanisme existait en plus de la diffusion éphémère `duel-winner-<id>` ci-dessus, et les deux
  // entraient en conflit : `winner_id` n'est jamais effacé en base une fois annoncé, donc TOUT
  // événement `status` ultérieur (reconnexion socket, autre champ modifié...) re-déclenchait la
  // bannière chez les spectateurs même après que le manager ait cliqué « Arrêter l'annonce » (qui,
  // lui, ne fait qu'une diffusion éphémère `winner_stopped`, sans toucher `winner_id` en base) —
  // d'où le bug signalé : l'arrêt fonctionnait chez le manager mais pas chez les autres. Parité
  // compétition, qui n'a jamais eu ce second mécanisme et n'est pas affectée.

  const isParticipant = currentUserId && duel && (currentUserId === duel.artist1_id || currentUserId === duel.artist2_id || currentUserId === duel.manager_id);
  const isManager = currentUserId === duel?.manager_id;
  const isArtist1 = currentUserId === duel?.artist1_id;
  const isArtist2 = currentUserId === duel?.artist2_id;
  const isDuelArtist = isArtist1 || isArtist2;
  const roomId = duel?.room_id || `duel-${id}`;
  const isLive = duel?.status === 'live';
  // Which slot is "self" for the current user?
  const selfSlot: StreamSlot | null = isArtist1 ? 'artist1' : isArtist2 ? 'artist2' : isManager ? 'manager' : null;

  // Focus EFFECTIF = épingle manager (synchronisée, prioritaire) sinon focus local du spectateur.
  const effectiveFocusedSlot = forcedFocus ?? focusedSlot;
  // Changer de focus : local pour tous ; en plus, le MANAGER l'épingle pour tous via `duel-focus-<id>`.
  const setFocus = useCallback((slot: StreamSlot | null) => {
    setFocusedSlot(slot);
    if (isManager) broadcastFocus("focus", { slot });
  }, [isManager, broadcastFocus]);

  // Eject non-participants when the duel is ended by the manager / artist.
  const ejectedRef = useRef(false);
  useEffect(() => {
    if (!duel || ejectedRef.current) return;
    if (duel.status !== "ended") return;
    if (isParticipant) return; // host/manager/artist navigates via endDuel()
    ejectedRef.current = true;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    toast({
      title: t("duelEndedByHostTitle"),
      description: t("duelEndedByHostDesc"),
    });
    navigate("/duels");
  }, [duel?.status, isParticipant, navigate, t, toast, duel]);

  const handleStreamReady = useCallback(async (stream: MediaStream) => {
    setHostStream(stream);
    if (duel?.status === 'upcoming') {
      const now = new Date().toISOString();
      setStartedAt(now);
      // Backend sets started_at + emits `status` to the duel room.
      await duels.updateDuel(id, { status: "live" });
    }
  }, [duel?.status, id]);

  const sendLike = async () => {
    const newCount = likes + 1;
    setLikes(newCount);
    addHeart();
    // Persist to DB via REST endpoint
    if (id) {
      await lives.likeLive(id);
    }
    broadcastLike("like", { count: newCount });
  };

  const handleMobileSendMessage = async (msg: string, parentId?: string | null) => {
    if (!currentUserId) return;
    await sendDuelChat(msg, parentId ?? null);
  };

  const announceWinner = async () => {
    if (!duel || !id) return;
    const a1votes = votes.artist1;
    const a2votes = votes.artist2;
    const winnerId = a1votes >= a2votes ? duel.artist1_id : duel.artist2_id;
    const winnerProfile = winnerId === duel.artist1_id ? profiles.artist1 : profiles.artist2;
    const winnerVoteCount = winnerId === duel.artist1_id ? a1votes : a2votes;

    // Save winner to DB but do NOT end the duel.
    await duels.updateDuel(id, { winnerId });

    const payload = { name: winnerProfile?.full_name || "Vainqueur", avatar: winnerProfile?.avatar_url || null, votes: winnerVoteCount };
    setWinnerAnnouncement(payload);

    // Broadcast to all (sender excluded — already shown locally above).
    broadcastWinner("winner_announced", payload);
  };

  // When manager stops the animation locally, broadcast the stop to everyone
  const handleStopWinnerAnnouncement = useCallback(() => {
    setWinnerAnnouncement(null);
    broadcastWinner("winner_stopped", {});
  }, [broadcastWinner]);

  const endDuel = async () => {
    if (id) await duels.updateDuel(id, { status: "ended" });
    toast({ title: t("duelEnded"), description: t("duelEndedDesc") });
    navigate("/duels");
  };

  const duelDescription = profiles.artist1?.full_name && profiles.artist2?.full_name
    ? `${profiles.artist1.full_name} vs ${profiles.artist2.full_name}` : "Duel";

  const getSlotName = (slot: StreamSlot) =>
    slot === 'artist1' ? (profiles.artist1?.full_name || "Artiste 1")
    : slot === 'artist2' ? (profiles.artist2?.full_name || "Artiste 2")
    : (profiles.manager?.full_name || "Manager");

  const getSlotId = (slot: StreamSlot) =>
    slot === 'artist1' ? duel?.artist1_id : slot === 'artist2' ? duel?.artist2_id : duel?.manager_id;

  const getSlotLabel = (slot: StreamSlot) =>
    slot === 'manager' ? `🎙️ ${getSlotName(slot)}` : `🎤 ${getSlotName(slot)}`;

  const updateSlotMediaState = useCallback((slot: StreamSlot, nextState: MediaState) => {
    setMediaStates((prev) => {
      const current = prev[slot];
      if (
        current &&
        current.isMicOn === nextState.isMicOn &&
        current.isCameraOn === nextState.isCameraOn &&
        current.isStreaming === nextState.isStreaming &&
        current.isPaused === nextState.isPaused
      ) {
        return prev;
      }

      return { ...prev, [slot]: nextState };
    });
  }, []);

  // Live media-state updates over Socket.IO (duel-media-<id>).
  // NOTE: the former supabase presence channel (initial media-state sync for late
  // joiners) was removed with Supabase; late joiners won't get the current media
  // state until the next media-state broadcast.
  const { broadcast: broadcastMedia } = useRoomBroadcast(id ? `duel-media-${id}` : null, (event, payload) => {
    if (event !== "media-state") return;
    const { slot, state } = (payload as { slot?: StreamSlot; state?: MediaState }) ?? {};
    if (slot && state && slot !== selfSlot) {
      updateSlotMediaState(slot, state);
    }
  });

  const handleLocalMediaStateChange = useCallback((slot: StreamSlot, state: MediaState) => {
    updateSlotMediaState(slot, state);
    broadcastMedia("media-state", { slot, state });
  }, [updateSlotMediaState, broadcastMedia]);

  const mediaStateHandlers = useMemo<Record<StreamSlot, (state: MediaState) => void>>(() => ({
    artist1: (state) => handleLocalMediaStateChange('artist1', state),
    artist2: (state) => handleLocalMediaStateChange('artist2', state),
    manager: (state) => handleLocalMediaStateChange('manager', state),
  }), [handleLocalMediaStateChange]);

  // Initial media-state sync for late joiners was provided by a supabase presence
  // channel (duel-media-<id>); removed with Supabase. Live updates continue via the
  // useRoomBroadcast("media-state") hook above — late joiners see a slot's state only
  // after that slot next broadcasts a change.

  // No auto-start: participants must manually activate their mic/camera

  // Determine border color based on media state
  const getBorderClass = (slot: StreamSlot) => {
    const s = mediaStates[slot];
    if (!s.isStreaming) return "border-muted-foreground/30";
    if (s.isMicOn && s.isCameraOn) return "border-green-500";
    if (s.isMicOn || s.isCameraOn) return "border-yellow-500";
    return "border-destructive";
  };

  // Build the stream component with per-video timer overlay
  const renderStream = (slot: StreamSlot, hideName = false, hideControls = false) => {
    const slotId = getSlotId(slot);
    if (!slotId) return null;
    const shouldHideControls = isMobile ? true : hideControls;
    return (
      <>
        <WebRTCDuelStream
          ref={streamRefHandlers[slot]}
          roomId={`${roomId}-${slot}`}
          duelId={id}
          oderId={slotId}
          signalingUserId={currentUserId || undefined}
          participantName={getSlotName(slot)}
          avatarUrl={profiles[slot]?.avatar_url}
          isCurrentUser={currentUserId === slotId}
          isParticipant={currentUserId === slotId}
          onStreamReady={handleStreamReady}
          isMutedByManager={mutedArtists[slotId]}
          hideName={hideName}
          hideControls={shouldHideControls}
          onMediaStateChange={mediaStateHandlers[slot]}
        />
        {/* Independent timer overlay — does not cause parent re-renders */}
        {(slot === 'artist1' || slot === 'artist2') && (
          <DuelVideoTimer targetUserId={slotId} activeTargetId={activeTimerTargetId} remaining={managerTimerRemaining} />
        )}
      </>
    );
  };

  // Media state indicator badges
  const MediaIndicator = ({ slot, small = false }: { slot: StreamSlot; small?: boolean }) => {
    const s = mediaStates[slot];
    const sz = small ? "w-3 h-3" : "w-3.5 h-3.5";
    return (
      <div className="flex items-center gap-0.5">
        {s.isMicOn ? <Mic className={`${sz} text-green-400`} /> : <MicOff className={`${sz} text-destructive`} />}
        {s.isCameraOn ? <Video className={`${sz} text-green-400`} /> : <VideoOff className={`${sz} text-destructive`} />}
      </div>
    );
  };

  // selfSlot is declared above near role declarations
  // Determine layout order for mobile:
  // - If spectator or manager: manager large on top, artists horizontal below
  // - If artist: self large on top, others horizontal below
  const getMainSlot = (): StreamSlot => {
    if (isArtist1) return 'artist1';
    if (isArtist2) return 'artist2';
    return 'manager'; // spectator or manager → manager large
  };

  const getSecondarySlots = (): StreamSlot[] => {
    const main = getMainSlot();
    const all: StreamSlot[] = ['artist1', 'artist2'];
    if (duel?.manager_id) all.push('manager');
    return all.filter(s => s !== main);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-primary/30 rounded-full" />
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin absolute inset-0" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-foreground">⚔️</span>
            <p className="text-muted-foreground font-medium animate-pulse">{t("loadingDuel")}</p>
          </div>
        </div>
      </div>
    );
  }

  // ===== MOBILE LAYOUT =====
  if (isMobile && duel) {
    const mainSlot = getMainSlot();
    const secondarySlots = getSecondarySlots();
    const allSlots: StreamSlot[] = ['artist1', 'artist2', ...(duel.manager_id ? ['manager' as StreamSlot] : [])];

    return (
      <>
        <ScheduledAccessGate
          type="duel"
          scheduledAt={duel.scheduled_time}
          status={duel.status}
          eventId={duel.id}
          ticketPrice={Number(duel.ticket_price) || 0}
          isActor={isParticipant || userRoles.includes("admin")}
          hasTicket={hasTicket}
          isAuthenticated={!!currentUserId}
          onPurchased={() => setHasTicket(true)}
        />
        <BannedAccessGate streamType="duel" streamId={id!} currentUserId={currentUserId} />
        <div className="fixed inset-0 bg-black z-50">
          <div className="relative w-full h-full" ref={videoContainerRef}>

          {/* === ALL STREAMS rendered persistently — CSS controls position, never unmounted === */}
          {allSlots.map(slot => {
            const isFocused = effectiveFocusedSlot === slot;
            const isMain = !effectiveFocusedSlot && slot === mainSlot;
            const isSecondary = !effectiveFocusedSlot && secondarySlots.includes(slot);
            const isOverlay = effectiveFocusedSlot && effectiveFocusedSlot !== slot;

            let style: React.CSSProperties = { position: 'absolute', transition: 'top 0.3s ease, bottom 0.3s ease, left 0.3s ease, right 0.3s ease, width 0.3s ease, height 0.3s ease, opacity 0.3s ease' };
            let extraClass = "overflow-hidden";

            if (isFocused) {
              style = { ...style, inset: 0, zIndex: 10 };
            } else if (isOverlay) {
              if (!showThumbnails) {
                style = { ...style, opacity: 0, pointerEvents: 'none', width: '1px', height: '1px', bottom: 0, right: 0 };
              } else {
                const overlaySlots = allSlots.filter(s => s !== effectiveFocusedSlot);
                const idx = overlaySlots.indexOf(slot);
                style = { ...style, bottom: `${136 + idx * 88}px`, right: '12px', width: '112px', height: '80px', zIndex: 40, borderRadius: '8px' };
                extraClass += ` border-2 ${getBorderClass(slot)} cursor-pointer bg-black/40 backdrop-blur-sm`;
              }
            } else if (isMain) {
              style = { ...style, top: 0, left: 0, right: 0, bottom: 'calc(22% + 136px)', zIndex: 1 };
              extraClass += ` border-b-2 ${getBorderClass(slot)}`;
            } else if (isSecondary) {
              const secIdx = secondarySlots.indexOf(slot);
              style = { ...style, bottom: '136px', height: '22%', left: `${(secIdx / secondarySlots.length) * 100}%`, width: `${100 / secondarySlots.length}%`, zIndex: 1 };
              extraClass += ` border-t-2 ${getBorderClass(slot)} cursor-pointer`;
            }

            return (
              <div
                key={slot}
                className={extraClass}
                style={style}
                onClick={() => !isFocused ? setFocus(slot) : undefined}
              >
                {renderStream(slot, true, isFocused ? false : true)}


                {/* Overlay thumbnail label */}
                {isOverlay && showThumbnails && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 flex items-center justify-between">
                    <span className="text-[9px] text-white font-medium truncate max-w-[60px]">{getSlotName(slot)}</span>
                    <MediaIndicator slot={slot} small />
                  </div>
                )}

                {/* Main slot labels — tap slot to focus, no Maximize icon (use top bar toggle) */}
                {isMain && (
                  <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5">
                    <span className="bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm flex items-center gap-1.5 cursor-pointer" onClick={(e) => { e.stopPropagation(); setFocus(slot); }}>
                      {getSlotLabel(slot)}
                      <MediaIndicator slot={slot} />
                    </span>
                  </div>
                )}

                {/* Secondary slot labels — tap to focus */}
                {isSecondary && (
                  <div className="absolute bottom-1 left-1 z-10 flex items-center gap-1">
                    <span className="bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); setFocus(slot); }}>
                      {getSlotLabel(slot)}
                      <MediaIndicator slot={slot} small />
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Timer overlays are now inside each video box via DuelVideoTimer */}

          {/* Back button - hidden on mobile */}
          <button onClick={() => navigate("/duels")} className="absolute top-3 left-3 z-50 w-8 h-8 rounded-full bg-background/30 backdrop-blur-sm hidden md:flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          {/* Share button is rendered via MobileStreamOverlay rightTopContent */}

          {/* Mobile overlay */}
          <MobileStreamOverlay
            isLive={isLive}
            viewerCount={viewersCount}
            likes={likes}
            onLike={sendLike}
            chatMessages={mobileChatMessages}
            onSendMessage={handleMobileSendMessage}
            currentUserId={currentUserId}
            hearts={hearts}
            addHeart={addHeart}
            floatingEmojis={floatingEmojis}
            onEmojiReact={addEmoji}
            videoContainerRef={videoContainerRef as any}
            rightTopContent={
              <>
                <ShareButton contentType="duel" contentId={id!} title={`Duel: ${profiles.artist1?.full_name || ''} vs ${profiles.artist2?.full_name || ''}`} variant="overlay" />
                {/* Layout toggle: focus main slot or return to grid view (NOT a fullscreen toggle — mobile is already fullscreen) */}
                <button
                  onClick={() => setFocus(effectiveFocusedSlot ? null : getMainSlot())}
                  className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"
                  title={effectiveFocusedSlot ? t("gridView") || "Vue grille" : t("focusView") || "Mettre au centre"}
                >
                  {effectiveFocusedSlot ? <Users className="w-4 h-4 text-white" /> : <Maximize className="w-4 h-4 text-white" />}
                </button>
              </>
            }
            focusedParticipantInfo={effectiveFocusedSlot ? { name: getSlotName(effectiveFocusedSlot), isMicOn: mediaStates[effectiveFocusedSlot].isMicOn, isCameraOn: mediaStates[effectiveFocusedSlot].isCameraOn } : null}
            title={duelDescription}
            artistName={duelDescription}
            badgeLabel="⚔️ DUEL"
            description={duelDescription}
            onQuitLive={() => navigate("/duels")}
            showGuestThumbnails={showThumbnails}
            onToggleThumbnails={() => setShowThumbnails(prev => !prev)}
            hasGuests={true}
            sponsorAdContent={id && isManager && ((duel as any).allows_sponsor_ads !== false) ? <SponsorAdBroadcast eventType="duel" eventId={id} canTrigger={true} /> : undefined}
            voteBarContent={
              votes.artist1 + votes.artist2 > 0 || isLive ? (
                <div className="w-full h-7 bg-black/60 backdrop-blur-sm flex items-center relative overflow-hidden">
                  <div className="h-full bg-primary/70 transition-all duration-500 flex items-center justify-start pl-1.5" style={{ width: `${votes.artist1 + votes.artist2 > 0 ? (votes.artist1 / (votes.artist1 + votes.artist2)) * 100 : 50}%` }}>
                    {/* Nom d'artiste cliquable → profil public du spectateur. */}
                    <span onClick={() => duel.artist1_id && navigate(`/artist/${duel.artist1_id}`)} className="text-[9px] text-white font-bold truncate max-w-[40%] cursor-pointer hover:underline">{profiles.artist1?.full_name?.split(' ')[0] || 'A1'} {votes.artist1}</span>
                  </div>
                  <div className="flex-1 h-full bg-accent/70 flex items-center justify-end pr-1.5">
                    <span onClick={() => duel.artist2_id && navigate(`/artist/${duel.artist2_id}`)} className="text-[9px] text-white font-bold truncate max-w-[40%] cursor-pointer hover:underline">{votes.artist2} {profiles.artist2?.full_name?.split(' ')[0] || 'A2'}</span>
                  </div>
                </div>
              ) : undefined
            }
            giftPanelContent={
              <GiftPanel duelId={id!} roomId={roomId} artist1Id={duel.artist1_id} artist2Id={duel.artist2_id} managerId={duel.manager_id}
                onGiftAnimationBroadcast={sendGiftAnimationBroadcast}
                artist1Name={profiles.artist1?.full_name || "Artiste 1"} artist2Name={profiles.artist2?.full_name || "Artiste 2"} managerName={profiles.manager?.full_name || "Manager"} />
            }
            leaderboardContent={<GiftLeaderboard duelId={id!} />}
            votePanelContent={
              <VotePanel duelId={id!} artist1Id={duel.artist1_id} artist2Id={duel.artist2_id} />
            }
            recordingContent={
              isManager ? <RecordingButton sourceType="duel" sourceId={id!} /> : undefined
            }
            extraControls={
              (!isManager && !hostStream) ? (
                <VotePanel duelId={id!} artist1Id={duel.artist1_id} artist2Id={duel.artist2_id} />
              ) : undefined
            }
            maxVisibleMessages={4}
            extraLeftControls={
              selfSlot && isParticipant ? (
                <MobileDuelControls
                  isStreaming={mediaStates[selfSlot].isStreaming}
                  isPaused={mediaStates[selfSlot].isPaused}
                  isCameraOn={mediaStates[selfSlot].isCameraOn}
                  isMicOn={mediaStates[selfSlot].isMicOn}
                  onStart={() => streamRefs.current[selfSlot!]?.startStreaming()}
                  onPause={() => streamRefs.current[selfSlot!]?.pauseStream()}
                  onResume={() => streamRefs.current[selfSlot!]?.resumeStream()}
                  onStop={() => streamRefs.current[selfSlot!]?.stopStreaming()}
                  onToggleCamera={() => streamRefs.current[selfSlot!]?.toggleCamera()}
                  onToggleMic={() => streamRefs.current[selfSlot!]?.toggleMic()}
                  onSwitchCamera={() => streamRefs.current[selfSlot!]?.switchCamera()}
                />
              ) : undefined
            }
            managerControlsContent={
              isManager && isLive ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant={mutedArtists[duel.artist1_id] ? "destructive" : "outline"} onClick={() => toggleMuteArtist(duel.artist1_id)}>
                      <MicOff className="w-3 h-3 mr-1" />{mutedArtists[duel.artist1_id] ? "Unmute" : "Mute"} {profiles.artist1?.full_name?.split(" ")[0] || "A1"}
                    </Button>
                    <Button size="sm" variant={mutedArtists[duel.artist2_id] ? "destructive" : "outline"} onClick={() => toggleMuteArtist(duel.artist2_id)}>
                      <MicOff className="w-3 h-3 mr-1" />{mutedArtists[duel.artist2_id] ? "Unmute" : "Mute"} {profiles.artist2?.full_name?.split(" ")[0] || "A2"}
                    </Button>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("speakingTimeLabel")} : {speakingTime >= 60 ? `${Math.floor(speakingTime / 60)}min ${speakingTime % 60 > 0 ? `${speakingTime % 60}s` : ''}` : `${speakingTime}s`}</p>
                    <Slider value={[speakingTime]} onValueChange={(v) => setSpeakingTime(v[0])} min={15} max={3600} step={15} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" disabled={activeTimerTargetId === duel.artist1_id && managerTimerRemaining > 0}
                      onClick={() => { broadcastTimerToAll('start', duel.artist1_id, speakingTime); setActiveTimerTargetId(duel.artist1_id); }}>
                      <Timer className="w-3 h-3 mr-1" />{t("turnOfLabel")} {profiles.artist1?.full_name?.split(" ")[0] || "A1"}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={activeTimerTargetId === duel.artist2_id && managerTimerRemaining > 0}
                      onClick={() => { broadcastTimerToAll('start', duel.artist2_id, speakingTime); setActiveTimerTargetId(duel.artist2_id); }}>
                      <Timer className="w-3 h-3 mr-1" />{t("turnOfLabel")} {profiles.artist2?.full_name?.split(" ")[0] || "A2"}
                    </Button>
                  </div>
                  {activeTimerTargetId && managerTimerRemaining > 0 && (
                    <div className="text-center p-2 bg-accent/20 rounded-lg">
                      <p className="text-sm font-bold">
                        {t("turnOfLabel")} {activeTimerTargetId === duel.artist1_id ? profiles.artist1?.full_name : profiles.artist2?.full_name}
                      </p>
                      <p className={`text-2xl font-mono font-bold tabular-nums my-1 ${managerTimerRemaining <= 10 ? "text-destructive" : "text-accent"}`}>
                        {Math.floor(managerTimerRemaining / 60)}:{String(managerTimerRemaining % 60).padStart(2, "0")}
                      </p>
                      <Button size="sm" variant="ghost" onClick={() => broadcastTimerToAll('stop', activeTimerTargetId)} className="mt-1">
                        {t("stopTimerBtn")}
                      </Button>
                    </div>
                  )}
                   <Button size="sm" className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold" onClick={announceWinner} disabled={!!winnerAnnouncement}>
                     <Trophy className="w-3 h-3 mr-1" />{t("announceWinner")}
                   </Button>
                   <Button size="sm" variant="destructive" className="w-full" onClick={endDuel}>
                     <UserX className="w-3 h-3 mr-1" />{t("endDuelBtn")}
                   </Button>
                </div>
              ) : undefined
            }
          />
          {/* Gift animations — visible to ALL viewers */}
          {activeGiftAnim && (
            activeGiftAnim.price < 10 ? (
              <StandardGiftNotification key={activeGiftAnim.eventId} giftName={activeGiftAnim.giftName} giftImage={activeGiftAnim.giftImage} senderName={activeGiftAnim.senderName} recipientName={activeGiftAnim.recipientName} onComplete={() => setActiveGiftAnim(null)} />
            ) : (
              <GiftAnimationWithSound key={activeGiftAnim.eventId} giftName={activeGiftAnim.giftName} giftImage={activeGiftAnim.giftImage} senderName={activeGiftAnim.senderName} recipientName={activeGiftAnim.recipientName} enableSound={activeGiftAnim.price >= 50} onComplete={() => setActiveGiftAnim(null)} />
            )
          )}
          {winnerAnnouncement && (
            <WinnerAnnouncement winnerName={winnerAnnouncement.name} winnerAvatar={winnerAnnouncement.avatar} winnerVotes={winnerAnnouncement.votes} onStop={handleStopWinnerAnnouncement} canDismiss={isManager} />
          )}
        </div>
      </div>
      </>
    );
  }

  // ===== DESKTOP LAYOUT =====
  return (
    <div className="min-h-screen bg-background">
      <ScheduledAccessGate
        type="duel"
        scheduledAt={duel?.scheduled_time}
        status={duel?.status}
        eventId={duel?.id}
        ticketPrice={Number(duel?.ticket_price) || 0}
        isActor={isParticipant || userRoles.includes("admin")}
        hasTicket={hasTicket}
        isAuthenticated={!!currentUserId}
        onPurchased={() => setHasTicket(true)}
      />
      <BannedAccessGate streamType="duel" streamId={id!} currentUserId={currentUserId} />
      <Header />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate("/duels")}>
            <ArrowLeft className="w-4 h-4 mr-2" />{t("back")}
          </Button>
          <div className="flex items-center gap-2">
            {isLive && (
              <Badge className="bg-destructive text-destructive-foreground flex items-center gap-1">
                <span className="w-2 h-2 bg-destructive-foreground rounded-full animate-pulse" />
                ⚔️ DUEL LIVE
              </Badge>
            )}
            <Badge variant="outline" className="flex items-center gap-1">
              <Users className="w-3 h-3" />{viewersCount} viewers
            </Badge>
            {id && !isParticipant && (
              <LiveReportButton
                streamType="duel"
                liveId={id}
                viewerCount={viewersCount}
                isArtist={!!isParticipant}
              />
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            {/* Timer overlays are now inside each video box via DuelVideoTimer */}

            <Card className="bg-card border-border overflow-hidden">
              <div ref={videoContainerRef} className="relative aspect-video bg-black">
                {/* ALL STREAMS rendered persistently — CSS controls position, never unmounted */}
                {(() => {
                  const desktopSlots = ['artist1', ...(duel.manager_id ? ['manager'] : []), 'artist2'] as StreamSlot[];
                  return desktopSlots.map(slot => {
                    const isFocused = effectiveFocusedSlot === slot;
                    const isThumbnail = effectiveFocusedSlot != null && effectiveFocusedSlot !== slot;
                    const isGrid = !effectiveFocusedSlot;

                    let style: React.CSSProperties = { position: 'absolute', transition: 'top 0.3s ease, bottom 0.3s ease, left 0.3s ease, right 0.3s ease, width 0.3s ease, height 0.3s ease, opacity 0.3s ease' };
                    let extraClass = "overflow-hidden";

                    if (isFocused) {
                      style = { ...style, inset: 0, zIndex: 10 };
                    } else if (isThumbnail) {
                      if (!showThumbnails) {
                        style = { ...style, opacity: 0, pointerEvents: 'none', width: '1px', height: '1px', bottom: 0, left: 0 };
                      } else {
                        const thumbSlots = desktopSlots.filter(s => s !== effectiveFocusedSlot);
                        const idx = thumbSlots.indexOf(slot);
                        style = { ...style, bottom: `${80 + idx * 108}px`, left: '16px', width: '144px', height: '96px', zIndex: 30, borderRadius: '8px' };
                        extraClass += ` border-2 ${getBorderClass(slot)} cursor-pointer hover:ring-2 hover:ring-primary`;
                      }
                    } else {
                      // Grid
                      const gridIdx = desktopSlots.indexOf(slot);
                      const count = desktopSlots.length;
                      style = { ...style, top: 0, bottom: 0, left: `${(gridIdx / count) * 100}%`, width: `${100 / count}%`, zIndex: 1 };
                      extraClass += ` border-x border-border/20 cursor-pointer group`;
                    }

                    return (
                      <div
                        key={slot}
                        className={extraClass}
                        style={style}
                        onClick={() => !isFocused ? setFocus(slot) : undefined}
                      >
                        {renderStream(slot, true, isFocused ? (slot !== selfSlot) : true)}

                        {/* Focused label — moved to top bar overlay, no longer shown at bottom */}

                        {/* Thumbnail label */}
                        {isThumbnail && showThumbnails && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 flex items-center justify-between">
                            <span className="text-[10px] text-white font-medium truncate max-w-[70px]">{getSlotName(slot)}</span>
                            <MediaIndicator slot={slot} small />
                          </div>
                        )}

                        {/* Grid labels */}
                        {isGrid && (
                          <>
                            <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1">
                              <span className="bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1">
                                {getSlotLabel(slot)} <MediaIndicator slot={slot} small />
                              </span>
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                              <div className="bg-black/50 backdrop-blur-sm rounded-full p-2">
                                <Maximize className="w-5 h-5 text-white" />
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  });
                })()}

                {/* Focus controls — below badges row to avoid overlap */}
                {effectiveFocusedSlot && (
                  <>
                    <button onClick={() => setFocus(null)} className="absolute top-14 right-4 z-40 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center" title="Réduire">
                      <Minimize className="w-4 h-4 text-white" />
                    </button>
                    <button onClick={() => setShowThumbnails(p => !p)} className="absolute top-14 right-14 z-40 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center">
                      {showThumbnails ? <EyeOff className="w-4 h-4 text-white" /> : <Eye className="w-4 h-4 text-white" />}
                    </button>
                  </>
                )}

                {/* Overlays - single top bar with all controls */}
                <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
                  <div className="flex items-center gap-2 pointer-events-auto">
                    {isLive && <Badge className="bg-destructive text-destructive-foreground animate-pulse">⚔️ DUEL</Badge>}
                    <Badge variant="outline" className="bg-background/50 text-foreground border-border/30"><Users className="w-3 h-3 mr-1" /> {viewersCount}</Badge>
                    {/* Focused slot info in top bar on desktop */}
                    {effectiveFocusedSlot && (
                      <div className="flex items-center gap-1.5 bg-background/50 backdrop-blur-sm px-3 py-1.5 rounded-full">
                        <span className="text-foreground text-xs font-semibold truncate max-w-[150px]">{getSlotName(effectiveFocusedSlot)}</span>
                        <MediaIndicator slot={effectiveFocusedSlot} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pointer-events-auto">
                    <button onClick={sendLike} className="bg-background/50 backdrop-blur-sm text-foreground px-4 py-2 rounded-full font-bold flex items-center gap-2 hover:bg-background/70 transition-colors">
                      <Heart className="w-5 h-5 fill-destructive text-destructive" /> {formatLikeCount(likes)}
                    </button>
                    <ShareButton contentType="duel" contentId={id!} title={`Duel: ${profiles.artist1?.full_name || ''} vs ${profiles.artist2?.full_name || ''}`} variant="overlay" />
                    <FullscreenButton targetRef={videoContainerRef} />
                  </div>
                </div>
                <FloatingHearts hearts={hearts} />
                <FloatingEmojis emojis={floatingEmojis} />
                {id && <TopDonorBubble contextType="duel" contextId={id} />}
                {/* Sponsor ad triggers are rendered inline below in the action row to avoid covering other buttons */}
              </div>

              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      <Avatar className="w-10 h-10 border-2 border-background cursor-pointer" onClick={() => duel.artist1_id && navigate(`/artist/${duel.artist1_id}`)}>
                        <AvatarImage src={profiles.artist1?.avatar_url || ""} />
                        <AvatarFallback>{profiles.artist1?.full_name?.charAt(0) || "A1"}</AvatarFallback>
                      </Avatar>
                      <Avatar className="w-10 h-10 border-2 border-background cursor-pointer" onClick={() => duel.artist2_id && navigate(`/artist/${duel.artist2_id}`)}>
                        <AvatarImage src={profiles.artist2?.avatar_url || ""} />
                        <AvatarFallback>{profiles.artist2?.full_name?.charAt(0) || "A2"}</AvatarFallback>
                      </Avatar>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => duel.artist1_id && navigate(`/artist/${duel.artist1_id}`)} className="font-bold text-foreground hover:text-primary transition-colors">
                          {profiles.artist1?.full_name || "Artiste 1"}
                        </button>
                        <span className="text-muted-foreground">vs</span>
                        <button onClick={() => duel.artist2_id && navigate(`/artist/${duel.artist2_id}`)} className="font-bold text-foreground hover:text-primary transition-colors">
                          {profiles.artist2?.full_name || "Artiste 2"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {currentUserId && duel.artist1_id && currentUserId !== duel.artist1_id && (
                          <FollowArtistButton artistId={duel.artist1_id} currentUserId={currentUserId} size="sm" />
                        )}
                        {currentUserId && duel.artist2_id && currentUserId !== duel.artist2_id && (
                          <FollowArtistButton artistId={duel.artist2_id} currentUserId={currentUserId} size="sm" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {isLive ? t("duelInProgress") : duel.status === "upcoming" ? t("duelUpcoming") : t("duelEnded")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {/* Sponsor ad — viewer overlay always mounted; controls only for manager. Hidden completely if duel disallows sponsors */}
                    {id && ((duel as any).allows_sponsor_ads !== false) && (
                      <SponsorAdBroadcast eventType="duel" eventId={id} canTrigger={!!isManager} />
                    )}
                    <Button onClick={sendLike} variant="outline" className="border-destructive text-destructive hover:bg-destructive/10">
                      <Heart className="w-4 h-4 mr-2" /> {t("likeBtn")}
                    </Button>
                    {!isParticipant && (
                      <Button onClick={() => navigate("/duels")} variant="ghost" className="text-muted-foreground">
                        <ArrowLeft className="w-4 h-4 mr-2" /> {t("quitBtn")}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-3"><EmojiReactionBar onReact={addEmoji} /></div>
              </CardContent>
            </Card>

            {/* Vote Stats */}
            <div className="bg-card rounded-lg p-6 border border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold">{t("liveVotesTitle")}</h3>
                {isManager && <RecordingButton sourceType="duel" sourceId={id!} />}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center"><p className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">{votes.artist1}</p><p className="text-muted-foreground">{profiles.artist1?.full_name || "Artiste 1"}</p></div>
                <div className="text-center"><p className="text-3xl font-bold bg-gradient-electric bg-clip-text text-transparent">{votes.artist2}</p><p className="text-muted-foreground">{profiles.artist2?.full_name || "Artiste 2"}</p></div>
              </div>
              <div className="mt-4 h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-primary transition-all" style={{ width: `${votes.artist1 + votes.artist2 > 0 ? (votes.artist1 / (votes.artist1 + votes.artist2)) * 100 : 50}%` }} />
              </div>
            </div>

            {/* Manager Controls */}
            {isManager && isLive && (
              <Card className="p-4 border-accent/30">
                <h4 className="font-semibold mb-3 flex items-center gap-2"><Timer className="w-4 h-4 text-accent" />{t("managerControlsTitle")}</h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant={mutedArtists[duel.artist1_id] ? "destructive" : "outline"} onClick={() => toggleMuteArtist(duel.artist1_id)}><MicOff className="w-3 h-3 mr-1" />{mutedArtists[duel.artist1_id] ? "Unmute" : "Mute"} {profiles.artist1?.full_name?.split(" ")[0] || "A1"}</Button>
                    <Button size="sm" variant={mutedArtists[duel.artist2_id] ? "destructive" : "outline"} onClick={() => toggleMuteArtist(duel.artist2_id)}><MicOff className="w-3 h-3 mr-1" />{mutedArtists[duel.artist2_id] ? "Unmute" : "Mute"} {profiles.artist2?.full_name?.split(" ")[0] || "A2"}</Button>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("speakingTimeLabel")} : {speakingTime >= 60 ? `${Math.floor(speakingTime / 60)}min ${speakingTime % 60 > 0 ? `${speakingTime % 60}s` : ''}` : `${speakingTime}s`}</p>
                    <Slider value={[speakingTime]} onValueChange={(v) => setSpeakingTime(v[0])} min={15} max={3600} step={15} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={activeTimerTargetId === duel.artist1_id && managerTimerRemaining > 0}
                      onClick={() => {
                        broadcastTimerToAll('start', duel.artist1_id, speakingTime);
                        setActiveTimerTargetId(duel.artist1_id);
                      }}
                    >
                      <Timer className="w-3 h-3 mr-1" />
                      {t("turnOfLabel")} {profiles.artist1?.full_name?.split(" ")[0] || "A1"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={activeTimerTargetId === duel.artist2_id && managerTimerRemaining > 0}
                      onClick={() => {
                        broadcastTimerToAll('start', duel.artist2_id, speakingTime);
                        setActiveTimerTargetId(duel.artist2_id);
                      }}
                    >
                      <Timer className="w-3 h-3 mr-1" />
                      {t("turnOfLabel")} {profiles.artist2?.full_name?.split(" ")[0] || "A2"}
                    </Button>
                  </div>
                  {activeTimerTargetId && managerTimerRemaining > 0 && (
                    <div className="text-center p-2 bg-accent/20 rounded-lg">
                      <p className="text-sm font-bold">
                        {t("turnOfLabel")} {activeTimerTargetId === duel.artist1_id ? profiles.artist1?.full_name : profiles.artist2?.full_name}
                      </p>
                      <p className={`text-2xl font-mono font-bold tabular-nums my-1 ${managerTimerRemaining <= 10 ? "text-destructive" : "text-accent"}`}>
                        {Math.floor(managerTimerRemaining / 60)}:{String(managerTimerRemaining % 60).padStart(2, "0")}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          broadcastTimerToAll('stop', activeTimerTargetId);
                        }}
                        className="mt-1"
                      >
                        {t("stopTimerBtn")}
                      </Button>
                    </div>
                  )}
                   <Button size="sm" className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold" onClick={announceWinner} disabled={!!winnerAnnouncement}>
                     <Trophy className="w-3 h-3 mr-1" />{t("announceWinner")}
                   </Button>
                   <Button size="sm" variant="destructive" className="w-full" onClick={endDuel}>
                     <UserX className="w-3 h-3 mr-1" />{t("endDuelBtn")}
                   </Button>
                </div>
              </Card>
            )}
            {isManager && id && (
              <SponsorAdHistoryPanel eventType="duel" eventId={id} />
            )}
          </div>

          {/* Side Panels */}
          <div className="space-y-6">
            <VotePanel duelId={id!} artist1Id={duel.artist1_id} artist2Id={duel.artist2_id} />
            <GiftPanel duelId={id!} roomId={roomId} artist1Id={duel.artist1_id} artist2Id={duel.artist2_id} managerId={duel.manager_id} onGiftAnimationBroadcast={sendGiftAnimationBroadcast} artist1Name={profiles.artist1?.full_name || "Artiste 1"} artist2Name={profiles.artist2?.full_name || "Artiste 2"} managerName={profiles.manager?.full_name || "Manager"} />
            <QuickTip duelId={id!} recipientIds={[{ id: duel.artist1_id, name: profiles.artist1?.full_name || "Artiste 1" }, { id: duel.artist2_id, name: profiles.artist2?.full_name || "Artiste 2" }]} />
            <GiftLeaderboard duelId={id!} />
            <div className="h-[400px]">
              <ThreadedChat
                chatType="duel"
                entityId={id!}
                hostId={duel.manager_id ?? null}
                chatEnabled={duel.chat_enabled}
                onToggleChat={(enabled) => duels.updateDuel(id!, { chatEnabled: enabled })}
                participants={[
                  ...(profiles.artist1 ? [{ id: duel.artist1_id, name: profiles.artist1.full_name || "Artiste 1" }] : []),
                  ...(profiles.artist2 ? [{ id: duel.artist2_id, name: profiles.artist2.full_name || "Artiste 2" }] : []),
                  ...(profiles.manager ? [{ id: duel.manager_id, name: `${profiles.manager.full_name || "Manager"} (Manager)` }] : []),
                ]}
              />
            </div>
          </div>
        </div>
      </main>
      <Footer />
      {/* Gift animations — visible to ALL viewers */}
      {activeGiftAnim && (
        activeGiftAnim.price < 10 ? (
          <StandardGiftNotification key={activeGiftAnim.eventId} giftName={activeGiftAnim.giftName} giftImage={activeGiftAnim.giftImage} senderName={activeGiftAnim.senderName} recipientName={activeGiftAnim.recipientName} onComplete={() => setActiveGiftAnim(null)} />
        ) : (
          <GiftAnimationWithSound key={activeGiftAnim.eventId} giftName={activeGiftAnim.giftName} giftImage={activeGiftAnim.giftImage} senderName={activeGiftAnim.senderName} recipientName={activeGiftAnim.recipientName} enableSound={activeGiftAnim.price >= 50} onComplete={() => setActiveGiftAnim(null)} />
        )
      )}
      {/* Winner announcement */}
      {winnerAnnouncement && (
        <WinnerAnnouncement
          winnerName={winnerAnnouncement.name}
          winnerAvatar={winnerAnnouncement.avatar}
          winnerVotes={winnerAnnouncement.votes}
          onStop={handleStopWinnerAnnouncement}
          canDismiss={isManager}
        />
      )}
    </div>
  );
};

export default DuelLive;
