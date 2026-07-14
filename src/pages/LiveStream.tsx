/**
 * Page: LiveStream (/lives/:id)
 *
 * Salle d'un live spontané (table `lives`, distincte de `concerts`). Diffusion
 * WebRTC via LiveKit SFU (`WebRTCHost` / `WebRTCViewer`) avec invitations
 * d'invités en plateau (raise-hand, accept/deny via `HostGuestControls`).
 *
 * Fonctionnalités :
 *   - Multi-cam : invités en thumbnails, flip cam (`replaceTrack`), mute/cam.
 *   - Mobile : `VisualViewport` pour clavier stable, `MobileStreamOverlay`,
 *     fullscreen via `FullscreenButton`.
 *   - Engagement : cœurs/emojis broadcastés, cadeaux, pourboires, leaderboard.
 *   - Modération : `BannedAccessGate`, `LiveReportButton` (auto-stop à 75%).
 *
 * Identité spectateur via la RPC `get_display_profiles`, comptage live via
 * Supabase Presence.
 *
 * @route   /lives/:id
 * @see     src/components/streaming/HostGuestControls.tsx
 * @see     src/components/concert/WebRTCHost.tsx, WebRTCViewer.tsx
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getDisplayProfiles } from "@/api/endpoints/users";
import * as lives from "@/api/endpoints/lives";
import { useAuth } from "@/contexts/AuthContext";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";
import { usePresence, useRoomEvent } from "@/realtime/useRoom";
import { useEventChat } from "@/realtime/useEventChat";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Heart, ArrowLeft, LogOut, Users, Hand, Mic, MicOff, Video, VideoOff, X, Check, UserPlus, Maximize, Minimize, SwitchCamera, EyeOff, Eye } from "lucide-react";
import { ShareButton } from "@/components/sharing/ShareButton";
import { HostGuestControls } from "@/components/streaming/HostGuestControls";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ConcertGiftPanel from "@/components/concert/ConcertGiftPanel";
import { QuickTip } from "@/components/duel/QuickTip";
import { GiftLeaderboard } from "@/components/duel/GiftLeaderboard";
import { Input } from "@/components/ui/input";
import { FloatingHearts, useBroadcastHearts, formatLikeCount } from "@/components/animations/FloatingHearts";
import { FloatingEmojis, EmojiReactionBar, useBroadcastEmojis } from "@/components/animations/FloatingEmojis";
import { TopDonorBubble } from "@/components/animations/TopDonorBubble";
import { FullscreenButton } from "@/components/streaming/FullscreenButton";
import { LiveReportButton } from "@/components/streaming/LiveReportButton";
import { BannedAccessGate } from "@/components/streaming/BannedAccessGate";

import { VideoZoomWrapper } from "@/components/streaming/VideoZoomWrapper";
import { WebRTCHost } from "@/components/concert/WebRTCHost";
import { WebRTCViewer } from "@/components/concert/WebRTCViewer";
import { MobileStreamOverlay } from "@/components/streaming/MobileStreamOverlay";
import { GuestVideoBox, useGuestBroadcast } from "@/components/streaming/GuestVideoBox";
import { GuestThumbnailGrid } from "@/components/streaming/GuestThumbnailGrid";
import { useIsMobile } from "@/hooks/use-mobile";
import { WebRTCHostControls } from "@/components/concert/WebRTCHost";
import { motion, AnimatePresence } from "framer-motion";
import { FollowArtistButton } from "@/components/artist/FollowArtistButton";
import { DedicationDialog } from "@/components/concert/DedicationDialog";

const LiveStream = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const [likes, setLikes] = useState(0);
  const likesLoadedRef = useRef(false);
  const [acceptedGuests, setAcceptedGuests] = useState<any[]>([]);
  const [focusedGuestId, setFocusedGuestId] = useState<string | null>(null);
  const [showGuestThumbnails, setShowGuestThumbnails] = useState(true);
  const [guestRequestsEnabled, setGuestRequestsEnabled] = useState(true);
  const viewerCount = usePresence("live", id ?? null);
  const [newMessage, setNewMessage] = useState("");
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [hasRequestedJoin, setHasRequestedJoin] = useState(false);
  const [myRequestId, setMyRequestId] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [guestStream, setGuestStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [mobileChatMessages, setMobileChatMessages] = useState<any[]>([]);
  const [hostControls, setHostControls] = useState<WebRTCHostControls | null>(null);
  const [replyToDesktop, setReplyToDesktop] = useState<any | null>(null);
  const [showDesktopEmoji, setShowDesktopEmoji] = useState(false);
  const [guestTimers, setGuestTimers] = useState<Record<string, { remaining: number; total: number; name: string }>>({});
  const [hostMutedGuests, setHostMutedGuests] = useState<Record<string, boolean>>({});
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const { hearts, broadcastHeart: addHeart } = useBroadcastHearts(id ? `live-hearts-${id}` : null);
  const { emojis: floatingEmojis, broadcastEmoji: addEmoji } = useBroadcastEmojis(id ? `live-emojis-${id}` : null);

  // Like counter relay over Socket.IO (live-likes-<id>). Viewer count now comes
  // from the backend `presence` broadcast via usePresence("live", id) above.
  const { broadcast: broadcastLike } = useRoomBroadcast(id ? `live-likes-${id}` : null, (event, payload) => {
    if (event === "like") setLikes((payload as { count: number }).count);
  });

  // Threaded live chat via REST history + Socket.IO realtime.
  const { messages: liveChatRaw, send: sendLiveChat } = useEventChat("live", id ?? null);
  const chatMessages = useMemo(() => {
    const byId = new Map(liveChatRaw.map((m) => [m.id, m]));
    return liveChatRaw.map((m) => {
      const parent = m.parent_id ? byId.get(m.parent_id) : null;
      return {
        ...m,
        user_name: m.profile?.full_name || "Anonyme",
        avatar_url: m.profile?.avatar_url ?? undefined,
        reply_to_name: parent ? (parent.profile?.full_name || "Anonyme") : undefined,
        reply_to_message: parent ? parent.message : undefined,
      };
    });
  }, [liveChatRaw]);

  // Auto-fullscreen on mobile (only once on mount, don't re-enter)
  const autoFullscreenDoneRef = useRef(false);
  useEffect(() => {
    if (!isMobile || !videoContainerRef.current || autoFullscreenDoneRef.current) return;
    autoFullscreenDoneRef.current = true;
    const timeout = setTimeout(() => {
      if (videoContainerRef.current && !document.fullscreenElement) {
        videoContainerRef.current.requestFullscreen?.().catch(() => {});
      }
    }, 1500);
    return () => clearTimeout(timeout);
  }, [isMobile]);

  // Guest media-state broadcast (live-guest-state-<id>) over Socket.IO. Send-only
  // here — consumed by GuestVideoBox (see gap list: that consumer is still on
  // supabase and must be migrated for the mic/cam indicators to sync live).
  const { broadcast: broadcastGuestState } = useRoomBroadcast(id ? `live-guest-state-${id}` : null);

  const broadcastMediaState = (micOn: boolean, camOn: boolean) => {
    broadcastGuestState("guest_media_state", { userId: currentUserId, isMicOn: micOn, isCamOn: camOn });
  };

  // Broadcast guest stream via WebRTC when this user is an accepted guest
  useGuestBroadcast(id, currentUserId, isGuest ? guestStream : null);
  // Fetch live data
  const { data: live, isLoading, refetch } = useQuery({
    queryKey: ["live-stream", id],
    queryFn: async () => {
      // Live row via REST — hydrated with the artist display profile
      // (id/full_name/avatar_url/stage_name). Prefer the stage name when set.
      const data: any = await lives.getLive(id as string);
      return {
        ...data,
        artist_name: data.artist?.stage_name || data.artist?.full_name || "Artiste",
        artist_avatar: data.artist?.avatar_url,
      };
    },
    refetchInterval: 10000,
  });

  const isArtist = currentUserId === live?.artist_id;
  const roomId = `live-${id}`;

  // Eject all non-host viewers as soon as the artist ends the live.
  // status is polled via useQuery (refetchInterval 10s) — react to it here.
  const ejectedRef = useRef(false);
  useEffect(() => {
    if (!live || ejectedRef.current) return;
    if (live.status !== "ended") return;
    if (isArtist) return; // The host already navigated themselves
    ejectedRef.current = true;
    guestStream?.getTracks().forEach((tr) => tr.stop());
    setGuestStream(null);
    setIsGuest(false);
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    toast({
      title: t("liveEndedByHostTitle"),
      description: t("liveEndedByHostDesc"),
    });
    navigate("/lives");
  }, [live?.status, isArtist, navigate, t, toast, guestStream, live]);


  // Load persisted likes on mount via REST.
  useEffect(() => {
    if (!id || likesLoadedRef.current) return;
    const loadLikes = async () => {
      try {
        const { likes: count } = await lives.getLikes(id);
        setLikes(count);
      } catch {
        /* non-blocking */
      }
      likesLoadedRef.current = true;
    };
    loadLikes();
  }, [id]);

  // Realtime like count — backend emits `likes` on the /live live room.
  useRoomEvent<{ live_id: string; likes: number }>("/live", "live", id ?? null, "likes", (p) => {
    setLikes(p.likes);
  });

  // Load accepted guests for display via the (non-host-restricted) join-requests
  // list endpoint. Anonymous viewers can't call the authenticated endpoint, so it
  // degrades to no guest thumbnails for them.
  const loadAcceptedGuests = async () => {
    if (!id) return;
    try {
      const data = (await lives.listJoinRequests(id, { status: "accepted" })) as any[];
      if (data && data.length > 0) {
        const userIds = data.map(r => r.user_id);
        const profiles = await getDisplayProfiles(userIds);
        const profileMap = new Map((profiles as any[])?.map((p: any) => [p.id, p]) || []);
        setAcceptedGuests(data.map(r => {
          const profile = profileMap.get(r.user_id);
          return {
            ...r,
            user_name: profile?.full_name || "Utilisateur",
            avatar_url: profile?.avatar_url,
          };
        }));
      } else {
        setAcceptedGuests([]);
      }
    } catch {
      setAcceptedGuests([]);
    }
  };
  useEffect(() => {
    loadAcceptedGuests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // Refresh the accepted-guest list on backend join emits.
  useRoomEvent("/live", "live", id ?? null, "join:new", () => loadAcceptedGuests());
  useRoomEvent("/live", "live", id ?? null, "join:update", () => loadAcceptedGuests());

  // Live status — backend emits `status` on the /live live room so viewers learn
  // immediately when the artist ends the live (without waiting for the 10s poll).
  useRoomEvent("/live", "live", id ?? null, "status", () => { refetch(); });

  // Chat history + realtime now handled by useEventChat("live", id) above.

  // Auto-scroll chat to bottom WITHOUT scrolling the page
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [chatMessages]);

  // Load pending join requests (for artist) via the join-requests list endpoint.
  const loadRequests = async () => {
    if (!id || !isArtist) return;
    try {
      const data = (await lives.listJoinRequests(id, { status: "pending" })) as any[];
      const userIds = data.map(r => r.user_id);
      const profiles = await getDisplayProfiles(userIds);
      const profileMap = new Map((profiles as any[])?.map((p: any) => [p.id, p]) || []);
      setJoinRequests(data.map(r => ({
        ...r,
        user_name: profileMap.get(r.user_id)?.full_name || "Utilisateur",
        avatar_url: profileMap.get(r.user_id)?.avatar_url,
      })));
    } catch {
      /* non-blocking */
    }
  };
  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isArtist]);
  // Refresh pending requests on backend join emits (only relevant for the host).
  const artistJoinRoomId = isArtist ? (id ?? null) : null;
  useRoomEvent("/live", "live", artistJoinRoomId, "join:new", () => loadRequests());
  useRoomEvent("/live", "live", artistJoinRoomId, "join:update", () => loadRequests());

  // Check existing join request on mount
  useEffect(() => {
    if (!id || !currentUserId) return;
    const checkRequest = async () => {
      // Derive the caller's own request from the (authenticated) join-requests list.
      try {
        const all = (await lives.listJoinRequests(id)) as any[];
        const mine = all.find((r) => r.user_id === currentUserId);
        if (mine) {
          setMyRequestId(mine.id);
          if (mine.status === "pending") setHasRequestedJoin(true);
          if (mine.status === "accepted") {
            setIsGuest(true);
            // Don't auto-start stream here - needs user gesture
            // User will click "Activer caméra" button
          }
        }
      } catch {
        /* non-blocking */
      }
    };
    checkRequest();
  }, [id, currentUserId, isArtist]);

  // Watch for join acceptance / removal on THIS user — backend emits `join:update`
  // ({ live_id, request_id, status, user_id }) on the /live live room.
  useRoomEvent<{ user_id: string; status: string }>(
    "/live",
    "live",
    !isArtist ? (id ?? null) : null,
    "join:update",
    (p) => {
      if (p.user_id === currentUserId && p.status === "accepted") {
        setIsGuest(true);
        // Don't auto-start - needs user gesture. Show button instead.
        toast({ title: t("joinedLive"), description: t("clickToActivate") });
      }
      if (p.user_id === currentUserId && p.status === "ended") {
        // Kicked by host
        setIsGuest(false);
        guestStream?.getTracks().forEach(t => t.stop());
        setGuestStream(null);
        toast({ title: t("removedFromLive"), variant: "destructive" });
      }
    },
  );

  // Host control actions on guest (peer broadcast — separate from join events).
  useRoomBroadcast(
    id && currentUserId && !isArtist ? `live-controls-${id}` : null,
    (event, payload) => {
      if (event !== "guest_action") return;
      const { action, targetUserId, targetUserName, value } = payload as {
        action?: string; targetUserId?: string; targetUserName?: string; value?: number | boolean;
      };

      if (action === "toggle_mic" && targetUserId) {
        setHostMutedGuests((prev) => ({ ...prev, [targetUserId]: !!value }));
      }

      // Timer events: visible to ALL viewers, not filtered by currentUserId
      if (action === "start_timer" && targetUserId) {
        setGuestTimers(prev => ({ ...prev, [targetUserId]: { remaining: value as number, total: value as number, name: targetUserName || "Invité" } }));
      }
      if (action === "timer_ended" && targetUserId) {
        setGuestTimers(prev => {
          const next = { ...prev };
          delete next[targetUserId];
          return next;
        });
        if (targetUserId === currentUserId) {
          toast({ title: t("speakingTimeEnded") });
        }
      }

      // Personal actions: only for this user
      if (targetUserId !== currentUserId) return;

      if (action === "kick") {
        setIsGuest(false);
        guestStream?.getTracks().forEach(t => t.stop());
        setGuestStream(null);
        toast({ title: "Vous avez été retiré du live", variant: "destructive" });
      }
      if (action === "toggle_mic" && guestStream) {
        guestStream.getAudioTracks().forEach(t => { t.enabled = !value; });
        setIsMicOn(!value);
        broadcastMediaState(!value, isCamOn);
        toast({ title: value ? t("micMutedByHost") : t("micUnmutedByHost") });
      }
    },
  );

  // Countdown tick for guest timers
  useEffect(() => {
    const activeTimers = Object.keys(guestTimers).filter(k => guestTimers[k].remaining > 0);
    if (activeTimers.length === 0) return;
    const interval = setInterval(() => {
      setGuestTimers(prev => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key].remaining <= 1) {
            delete next[key];
          } else {
            next[key] = { ...next[key], remaining: next[key].remaining - 1 };
          }
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [Object.keys(guestTimers).length]); // eslint-disable-line react-hooks/exhaustive-deps

  const startGuestCamera = async () => {
    try {
      // Check if we already have a live video track - just re-enable it
      if (guestStream) {
        const existingVideo = guestStream.getVideoTracks().find(t => t.readyState === "live");
        if (existingVideo) {
          existingVideo.enabled = true;
          setIsCamOn(true);
          // Force stream update to trigger WebRTC sync
          setGuestStream(new MediaStream(guestStream.getTracks()));
          return;
        }
      }

      // Get ONLY video - don't touch audio
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const [newVideoTrack] = videoStream.getVideoTracks();
      if (!newVideoTrack) return;

      newVideoTrack.enabled = true;
      
      // Merge: keep ALL existing live tracks + add the new video track
      const existingTracks = guestStream?.getTracks().filter(t => t.readyState === "live" && t.kind !== "video") ?? [];
      const allTracks = [...existingTracks, newVideoTrack];
      setGuestStream(new MediaStream(allTracks));
      setIsCamOn(true);
      // Broadcast state change
      broadcastMediaState(isMicOn, true);
      // DO NOT touch isMicOn - it's independent
    } catch {
      toast({ title: t("cameraError"), description: t("cameraErrorDesc"), variant: "destructive" });
    }
  };

  const startGuestMic = async () => {
    try {
      // Check if we already have a live audio track - just re-enable it
      if (guestStream) {
        const existingAudio = guestStream.getAudioTracks().find(t => t.readyState === "live");
        if (existingAudio) {
          existingAudio.enabled = true;
          setIsMicOn(true);
          // Force stream update to trigger WebRTC sync
          setGuestStream(new MediaStream(guestStream.getTracks()));
          return;
        }
      }

      // Get ONLY audio - don't touch video
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const [newAudioTrack] = audioStream.getAudioTracks();
      if (!newAudioTrack) return;

      newAudioTrack.enabled = true;
      
      // Merge: keep ALL existing live tracks + add the new audio track
      const existingTracks = guestStream?.getTracks().filter(t => t.readyState === "live" && t.kind !== "audio") ?? [];
      const allTracks = [...existingTracks, newAudioTrack];
      setGuestStream(new MediaStream(allTracks));
      setIsMicOn(true);
      // Broadcast state change
      broadcastMediaState(true, isCamOn);
      // DO NOT touch isCamOn - it's independent
    } catch {
      toast({ title: t("micError"), description: t("micErrorDesc"), variant: "destructive" });
    }
  };

  const sendLike = async () => {
    const newCount = likes + 1;
    setLikes(newCount);
    addHeart();
    broadcastLike("like", { count: newCount });
    // Persist to DB via REST endpoint
    if (id) {
      await lives.likeLive(id);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUserId || !id) return;
    // Threaded replies are now native (parent_id) via the chat endpoint.
    await sendLiveChat(newMessage.trim(), replyToDesktop?.id || null);
    setNewMessage("");
    setReplyToDesktop(null);
  };

  const requestToJoin = async () => {
    if (!currentUserId || !id) return;
    try {
      const data = (await lives.joinLive(id)) as { id?: string };
      setHasRequestedJoin(true);
      if (data?.id) setMyRequestId(data.id);
      toast({ title: t("requestSent"), description: t("artistWillReview") });
    } catch {
      /* ignore — button re-enables */
    }
  };

  const cancelJoinRequest = async () => {
    if (!myRequestId) return;
    await lives.cancelJoinRequest(myRequestId);
    setHasRequestedJoin(false);
    setMyRequestId(null);
    toast({ title: t("requestCancelled") });
  };

  const handleJoinRequest = async (requestId: string, accept: boolean) => {
    await lives.respondJoinRequest(requestId, { status: accept ? "accepted" : "rejected" });
  };

  const kickGuest = async (requestId: string) => {
    await lives.respondJoinRequest(requestId, { status: "ended" });
    toast({ title: t("userRemovedFromLive") });
  };

  const leaveLive = async () => {
    if (!myRequestId) return;
    await lives.respondJoinRequest(myRequestId, { status: "ended" });
    setIsGuest(false);
    guestStream?.getTracks().forEach(t => t.stop());
    setGuestStream(null);
    setHasRequestedJoin(false);
    setMyRequestId(null);
    toast({ title: t("leftLive") });
  };

  const endLive = async () => {
    if (!id) return;
    await lives.endLive(id);
    toast({ title: t("liveEnded") });
    navigate("/lives");
  };

  const handleAutoStopReport = async () => {
    if (!id) return;
    toast({
      title: "⚠️ Live arrêté",
      description: "Ce live a été arrêté suite à de nombreux signalements.",
      variant: "destructive",
    });
    await lives.endLive(id);
    navigate("/lives");
  };

  const toggleMic = async () => {
    if (!guestStream) {
      await startGuestMic();
      return;
    }

    const audioTracks = guestStream.getAudioTracks().filter(t => t.readyState === "live");
    if (audioTracks.length === 0) {
      await startGuestMic();
      return;
    }

    const nextEnabled = !audioTracks.some(t => t.enabled);
    audioTracks.forEach(t => { t.enabled = nextEnabled; });
    setIsMicOn(nextEnabled);
    // Force stream reference change to trigger WebRTC sync
    setGuestStream(new MediaStream(guestStream.getTracks()));
    // Broadcast state change to all viewers
    broadcastMediaState(nextEnabled, isCamOn);
    // DO NOT touch isCamOn
  };

  const toggleCam = async () => {
    if (!guestStream) {
      await startGuestCamera();
      return;
    }

    const videoTracks = guestStream.getVideoTracks().filter(t => t.readyState === "live");
    if (videoTracks.length === 0) {
      await startGuestCamera();
      return;
    }

    const nextEnabled = !videoTracks.some(t => t.enabled);
    videoTracks.forEach(t => { t.enabled = nextEnabled; });
    setIsCamOn(nextEnabled);
    // Force stream reference change to trigger WebRTC sync
    setGuestStream(new MediaStream(guestStream.getTracks()));
    // Broadcast state change to all viewers
    broadcastMediaState(isMicOn, nextEnabled);
    // DO NOT touch isMicOn
  };

  const [guestFacingMode, setGuestFacingMode] = useState<'user' | 'environment'>('user');

  const switchGuestCamera = async () => {
    if (!guestStream) return;
    const newFacingMode = guestFacingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: newFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      // Stop old video tracks
      guestStream.getVideoTracks().forEach(t => t.stop());
      // Keep audio tracks, replace video
      const audioTracks = guestStream.getAudioTracks().filter(t => t.readyState === "live");
      const allTracks = [...audioTracks, newVideoTrack];
      const updatedStream = new MediaStream(allTracks);
      setGuestStream(updatedStream);
      setGuestFacingMode(newFacingMode);
      setIsCamOn(true);
      broadcastMediaState(isMicOn, true);
    } catch (err) {
      console.error("[SwitchGuestCamera] Error:", err);
      toast({ title: t("error"), description: "Impossible de basculer la caméra", variant: "destructive" });
    }
  };

  // Mobile chat for TikTok overlay
  useEffect(() => {
    if (!id || !isMobile) return;
    setMobileChatMessages(chatMessages.map((m: any) => ({
      ...m,
      reply_to_name: m.reply_to_name || undefined,
      reply_to_message: m.reply_to_message || undefined,
    })));
  }, [chatMessages, isMobile, id]);

  const sendMobileChatMessage = async (msg: string, parentId?: string | null) => {
    if (!currentUserId || !id) return;
    await sendLiveChat(msg, parentId ?? null);
  };

  useEffect(() => {
    setHostMutedGuests((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([userId]) => acceptedGuests.some((guest) => guest.user_id === userId))
      )
    );
  }, [acceptedGuests]);




  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 pt-24 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!live) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 pt-24 text-center">
           <p className="text-foreground text-xl">{t("liveNotFound")}</p>
           <Button className="mt-4" onClick={() => navigate("/lives")}>{t("backToLives")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={isMobile ? "fixed inset-0 bg-black z-50" : "min-h-screen bg-background"}>
      <BannedAccessGate streamType="live" streamId={id!} currentUserId={currentUserId} />
      {!isMobile && <Header />}
      <main className={isMobile ? "w-full h-full" : "container mx-auto px-4 pt-24 pb-8"}>
        {!isMobile && (
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={() => navigate("/lives")}>
              <ArrowLeft className="w-4 h-4 mr-2" /> {t("returnBtn")}
            </Button>
            {live && <ShareButton contentType="live" contentId={id!} title={live.title || "Live"} />}
          </div>
        )}

        <div className={isMobile ? "h-full" : "grid grid-cols-1 lg:grid-cols-4 gap-6"}>
          {/* Video area */}
          <div className={isMobile ? "h-full" : "lg:col-span-3"}>
            <Card className={isMobile ? "w-full h-full bg-black border-0 rounded-none overflow-hidden" : "bg-card border-border overflow-hidden"}>
              <VideoZoomWrapper isFocused className={`relative bg-black ${isMobile ? 'h-full' : 'aspect-video'}`}>
              <div ref={videoContainerRef} className="w-full h-full relative">
                {/* Host/Viewer video — ALWAYS mounted, use CSS to show/hide */}
                {isArtist && currentUserId ? (
                  <div className={focusedGuestId ? `absolute w-24 h-20 md:w-36 md:h-24 ${isMobile ? 'bottom-[156px]' : 'bottom-4'} right-4 z-30 rounded-lg overflow-hidden border-2 border-accent cursor-pointer hover:ring-2 hover:ring-accent group` : "w-full h-full"} onClick={focusedGuestId ? () => setFocusedGuestId(null) : undefined}>
                    <WebRTCHost
                      roomId={roomId}
                      hostId={currentUserId}
                      avatarUrl={live?.artist_avatar}
                      hostName={live?.artist_name}
                      streamType="live"
                      onStreamStart={async () => {
                        if (id) await lives.updateStatus(id, "live");
                      }}
                      onStreamStop={endLive}
                      onStreamReady={(stream) => setGuestStream(stream)}
                      hideMobileControls={isMobile || !!focusedGuestId}
                      hideOverlays={!!focusedGuestId}
                      onControlsReady={setHostControls}
                    />
                    {/* Artist name/avatar + mini controls when in small thumbnail — NO LIVE badge, viewer count or Connecté */}
                    {focusedGuestId && (
                      <>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 z-10 flex items-center gap-1">
                          <Avatar className="w-4 h-4">
                            <AvatarImage src={live.artist_avatar} />
                            <AvatarFallback className="text-[6px]">{live.artist_name?.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="text-[9px] md:text-[11px] text-white font-medium truncate max-w-[60px] md:max-w-[80px]">🎤 {live.artist_name}</span>
                        </div>
                        {/* Mini controls overlay on hover */}
                        {hostControls && (
                          <div className="absolute top-0 left-0 right-0 flex items-center justify-center gap-0.5 py-0.5 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity z-20" onClick={(e) => e.stopPropagation()}>
                            <Button size="icon" variant="ghost" className={`w-5 h-5 ${hostControls.isMicOn ? 'text-green-400' : 'text-red-400'}`} onClick={() => hostControls.handleToggleMic()} title={hostControls.isMicOn ? "Couper micro" : "Activer micro"}>
                              {hostControls.isMicOn ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                            </Button>
                            <Button size="icon" variant="ghost" className={`w-5 h-5 ${hostControls.isCameraOn ? 'text-green-400' : 'text-red-400'}`} onClick={() => hostControls.handleToggleCamera()} title={hostControls.isCameraOn ? "Couper caméra" : "Activer caméra"}>
                              {hostControls.isCameraOn ? <Video className="w-3 h-3" /> : <VideoOff className="w-3 h-3" />}
                            </Button>
                            <Button size="icon" variant="ghost" className="w-5 h-5 text-red-400" onClick={() => endLive()} title="Terminer le live">
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : currentUserId ? (
                  <div className={focusedGuestId ? `absolute w-24 h-20 md:w-36 md:h-24 ${isMobile ? 'bottom-[156px]' : 'bottom-4'} right-4 z-30 rounded-lg overflow-hidden border-2 border-accent cursor-pointer hover:ring-2 hover:ring-accent` : "w-full h-full"} onClick={focusedGuestId ? () => setFocusedGuestId(null) : undefined}>
                    <WebRTCViewer
                      roomId={roomId}
                      viewerId={currentUserId}
                      concertTitle={live.title || "Live en cours"}
                      artistName={live.artist_name}
                      artistAvatarUrl={live.artist_avatar}
                    />
                    {focusedGuestId && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 z-10">
                        <span className="text-[9px] md:text-[11px] text-white font-medium truncate">🎤 {live.artist_name}</span>
                      </div>
                    )}
                  </div>
                ) : !focusedGuestId ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20">
                    <div className="text-center">
                      <Avatar className="w-24 h-24 mx-auto mb-4 border-4 border-primary">
                        <AvatarImage src={live.artist_avatar} />
                        <AvatarFallback className="text-3xl">{live.artist_name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <h2 className="text-white text-2xl font-bold">{live.artist_name}</h2>
                      <p className="text-white/70 text-lg">{live.title || "Live en cours"}</p>
                    </div>
                  </div>
                ) : null}

                {/* Toggle thumbnails button — only on desktop (mobile uses overlay icon) */}
                {acceptedGuests.length > 0 && !isMobile && (
                  <div className="absolute top-4 right-14 z-30">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-8 h-8 bg-black/50 hover:bg-black/70 text-white pointer-events-auto"
                      onClick={(e) => { e.stopPropagation(); setShowGuestThumbnails(prev => !prev); }}
                      title={showGuestThumbnails ? "Masquer les vignettes" : "Afficher les vignettes"}
                    >
                      {showGuestThumbnails ? <Minimize className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                    </Button>
                  </div>
                )}

                {/* Focused guest renders fullscreen — kept outside the grid */}
                {acceptedGuests
                  .filter((g) => g.user_id === focusedGuestId)
                  .map((guest) => (
                    <div key={guest.id} className="absolute inset-0 z-10">
                      <GuestVideoBox
                        guestUserId={guest.user_id}
                        guestName={guest.user_name}
                        guestAvatarUrl={guest.avatar_url}
                        liveId={id!}
                        currentUserId={currentUserId}
                        localStream={guest.user_id === currentUserId ? guestStream : undefined}
                        isMainView
                        forceMicOff={!!hostMutedGuests[guest.user_id]}
                        onToggleExpand={() => setFocusedGuestId(null)}
                        timerRemaining={guestTimers[guest.user_id]?.remaining}
                        timerTotal={guestTimers[guest.user_id]?.total}
                      />
                    </div>
                  ))}

                {/* Responsive thumbnail grid — auto-adapts columns × rows to container size */}
                {showGuestThumbnails && (
                  <GuestThumbnailGrid
                    containerRef={videoContainerRef as React.RefObject<HTMLElement>}
                    isMobile={isMobile}
                    guests={acceptedGuests
                      .filter((g) => g.user_id !== focusedGuestId)
                      .map((guest) => ({
                        key: guest.id,
                        name: guest.user_name,
                        node: (
                          <GuestVideoBox
                            guestUserId={guest.user_id}
                            guestName={guest.user_name}
                            guestAvatarUrl={guest.avatar_url}
                            liveId={id!}
                            currentUserId={currentUserId}
                            localStream={guest.user_id === currentUserId ? guestStream : undefined}
                            isMainView={false}
                            forceMicOff={!!hostMutedGuests[guest.user_id]}
                            onToggleExpand={() => setFocusedGuestId(guest.user_id)}
                            timerRemaining={guestTimers[guest.user_id]?.remaining}
                            timerTotal={guestTimers[guest.user_id]?.total}
                          />
                        ),
                      }))}
                  />
                )}


                {/* Guest controls overlay — hidden on mobile (handled by MobileStreamOverlay icons) */}
                {isGuest && guestStream && !isMobile && (
                  <div className="absolute bottom-4 left-16 z-20 flex gap-1">
                    <Button size="icon" variant="ghost" className={`w-8 h-8 ${isMicOn ? 'bg-green-500/70' : 'bg-destructive/70'} text-white`} onClick={toggleMic}>
                      {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" className={`w-8 h-8 ${isCamOn ? 'bg-green-500/70' : 'bg-destructive/70'} text-white`} onClick={toggleCam}>
                      {isCamOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                    </Button>
                    {isCamOn && (
                      <Button size="icon" variant="ghost" className="w-8 h-8 bg-secondary/70 text-white" onClick={switchGuestCamera} title={t("switchCamera")}>
                        <SwitchCamera className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="w-8 h-8 bg-destructive/80 text-white" onClick={leaveLive} title="Quitter">
                      <LogOut className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {/* Activation buttons — desktop only (mobile handled by overlay icons) */}
                {isGuest && !guestStream && !isMobile && (
                  <div className="absolute bottom-4 left-16 z-20">
                    <div className="flex gap-1">
                       <Button onClick={startGuestCamera} size="sm" className="bg-primary text-primary-foreground">
                         <Video className="w-3 h-3 mr-1" /> {t("cameraBtn")}
                       </Button>
                       <Button onClick={startGuestMic} size="sm" className="bg-primary text-primary-foreground">
                         <Mic className="w-3 h-3 mr-1" /> {t("micBtn")}
                       </Button>
                    </div>
                  </div>
                )}

                {/* Mobile TikTok overlay — all controls rendered inline (no portals) */}
                <MobileStreamOverlay
                  isLive={live.status === "live"}
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
                    <ConcertGiftPanel concertId={id!} artistId={live.artist_id} artistName={live.artist_name} />
                  }
                  leaderboardContent={<GiftLeaderboard liveId={id!} />}
                  title={live.title || "Live"}
                  artistName={live.artist_name}
                  isArtist={isArtist}
                  artistControls={hostControls ? {
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
                  guestManagementContent={isArtist ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t("guestControls")}</span>
                        <Button size="sm" variant={guestRequestsEnabled ? "default" : "outline"} onClick={() => setGuestRequestsEnabled(prev => !prev)} className="gap-1.5 text-xs">
                          {guestRequestsEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          {guestRequestsEnabled ? t("guestRequestsOn") : t("guestRequestsOff")}
                        </Button>
                      </div>
                      {guestRequestsEnabled && (
                        <HostGuestControls
                          liveId={id!}
                          isHost={isArtist}
                          currentUserId={currentUserId || ""}
                          onKickGuest={() => toast({ title: t("guestKicked") })}
                        />
                      )}
                    </div>
                  ) : undefined}
                  activeGuestCount={acceptedGuests.length}
                  pendingGuestCount={joinRequests.length}
                  isGuest={isGuest}
                  guestSelfControls={isGuest ? {
                    hasStream: !!guestStream,
                    isMicOn,
                    isCamOn,
                    onToggleMic: toggleMic,
                    onToggleCam: toggleCam,
                    onStartMic: startGuestMic,
                    onStartCam: startGuestCamera,
                    onLeave: leaveLive,
                    onSwitchCamera: switchGuestCamera,
                  } : undefined}
                  showGuestThumbnails={showGuestThumbnails}
                  onToggleThumbnails={() => setShowGuestThumbnails(prev => !prev)}
                  hasGuests={acceptedGuests.length > 0}
                  spectatorJoin={!isArtist && !isGuest ? {
                    hasRequested: hasRequestedJoin,
                    isGuest: false,
                    onRequestJoin: requestToJoin,
                    onCancelRequest: cancelJoinRequest,
                    onLeave: leaveLive,
                  } : undefined}
                  description={live.title || "Live spontané"}
                  onQuitLive={() => navigate("/lives")}
                  rightTopContent={
                    <ShareButton contentType="live" contentId={id!} title={live.title || "Live"} variant="overlay" />
                  }
                  focusedParticipantInfo={focusedGuestId ? (() => {
                    const guest = acceptedGuests.find(g => g.user_id === focusedGuestId);
                    if (!guest) return null;
                    return { name: guest.user_name || "Invité", isMicOn: !hostMutedGuests[focusedGuestId], isCameraOn: true };
                  })() : null}
                />

                {Object.keys(guestTimers).length > 0 && (
                  <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30">
                    {Object.entries(guestTimers).map(([userId, timer]) => (
                      <div key={userId} className="flex items-center gap-3 bg-background/70 backdrop-blur-md rounded-full px-4 py-2 border border-accent/40 shadow-lg animate-in fade-in slide-in-from-top-2 mb-1">
                        <span className="text-sm font-semibold text-foreground truncate max-w-[120px]">{timer.name}</span>
                        <span className={`text-sm font-bold tabular-nums min-w-[48px] text-right ${timer.remaining <= 10 ? 'text-destructive animate-pulse' : 'text-accent'}`}>
                          {Math.floor(timer.remaining / 60)}:{String(timer.remaining % 60).padStart(2, "0")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Floating reactions (desktop) */}
                {!isMobile && <FloatingHearts hearts={hearts} />}
                {!isMobile && <FloatingEmojis emojis={floatingEmojis} />}
                {id && <TopDonorBubble contextType="live" contextId={id} />}

                {/* Fullscreen (desktop) */}
                {!isMobile && (
                  <div className="absolute bottom-4 left-4 z-20">
                    <FullscreenButton targetRef={videoContainerRef} />
                  </div>
                )}

                {/* Overlays (desktop) */}
                {!isMobile && (
                  <>
                    <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
                      <Badge className="bg-destructive text-destructive-foreground animate-pulse">LIVE</Badge>
                      <Badge variant="outline" className="bg-background/50 text-foreground border-border/30">
                        <Users className="w-3 h-3 mr-1" /> {viewerCount}
                      </Badge>
                      {/* Focused guest info in top bar on desktop */}
                      {focusedGuestId && (() => {
                        const guest = acceptedGuests.find(g => g.user_id === focusedGuestId);
                        if (!guest) return null;
                        return (
                          <div className="flex items-center gap-1.5 bg-background/50 backdrop-blur-sm px-3 py-1.5 rounded-full">
                            <span className="text-foreground text-xs font-semibold truncate max-w-[150px]">{guest.user_name}</span>
                            {!hostMutedGuests[focusedGuestId] ? <Mic className="w-3.5 h-3.5 text-green-400 shrink-0" /> : <MicOff className="w-3.5 h-3.5 text-destructive shrink-0" />}
                            <Video className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          </div>
                        );
                      })()}
                    </div>
                    <div className="absolute top-4 right-4 bg-background/50 backdrop-blur-sm text-foreground px-4 py-2 rounded-full font-bold flex items-center gap-2 z-10">
                      <Heart className="w-5 h-5 fill-destructive text-destructive" /> {formatLikeCount(likes)}
                    </div>
                  </>
                )}
              </div>
              </VideoZoomWrapper>

              {!isMobile && (
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={live.artist_avatar} />
                      <AvatarFallback>{live.artist_name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <button onClick={() => live.artist_id && navigate(`/artist/${live.artist_id}`)} className="font-bold text-foreground hover:text-primary transition-colors">
                        {live.artist_name}
                      </button>
                      <p className="text-sm text-muted-foreground">{live.title || "Live spontané"}</p>
                      {currentUserId && live.artist_id && currentUserId !== live.artist_id && (
                        <FollowArtistButton artistId={live.artist_id} currentUserId={currentUserId} size="sm" />
                      )}
                    </div>
                  </div>

                  <div className="mb-3 w-full">
                    <EmojiReactionBar onReact={addEmoji} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                     <Button onClick={sendLike} variant="outline" className="border-destructive text-destructive hover:bg-destructive/10">
                       <Heart className="w-4 h-4 mr-2" /> {t("likeBtn")}
                    </Button>

                    {!isArtist && !hasRequestedJoin && !isGuest && (
                       <Button onClick={requestToJoin} variant="outline" className="border-primary">
                         <Hand className="w-4 h-4 mr-2" /> {t("requestToJoinBtn")}
                      </Button>
                    )}

                    {hasRequestedJoin && !isGuest && (
                      <div className="flex gap-2">
                         <Badge variant="outline" className="py-2 px-4">{t("waitingLabel")}</Badge>
                         <Button size="sm" variant="ghost" onClick={cancelJoinRequest} className="text-destructive">
                           <X className="w-4 h-4 mr-1" /> {t("cancelBtn")}
                        </Button>
                      </div>
                    )}

                    {isGuest && !guestStream && (
                      <div className="flex gap-2">
                         <Button onClick={startGuestCamera} variant="secondary">
                           <Video className="w-4 h-4 mr-1" /> {t("cameraBtn")}
                         </Button>
                         <Button onClick={startGuestMic} variant="secondary">
                           <Mic className="w-4 h-4 mr-1" /> {t("micBtn")}
                         </Button>
                      </div>
                    )}

                    {isGuest && guestStream && (
                       <Button onClick={leaveLive} variant="outline" className="border-destructive text-destructive hover:bg-destructive/10">
                         <LogOut className="w-4 h-4 mr-2" /> {t("leaveLiveBtn2")}
                       </Button>
                    )}

                    {/* Live report */}
                    <LiveReportButton
                      streamType="live"
                      liveId={id!}
                      viewerCount={viewerCount}
                      isArtist={isArtist}
                      onAutoStop={handleAutoStopReport}
                    />

                    {isArtist && (
                       <Button onClick={endLive} variant="destructive">
                         <X className="w-4 h-4 mr-2" /> {t("endLiveBtn")}
                       </Button>
                    )}

                    {!isArtist && (
                       <Button onClick={() => navigate("/lives")} variant="ghost" className="text-muted-foreground">
                         <LogOut className="w-4 h-4 mr-2" /> {t("quitBtn")}
                       </Button>
                    )}
                  </div>
                </div>

                {/* Artist: Host guest controls */}
                {isArtist && currentUserId && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <UserPlus className="w-4 h-4" /> {t("guestControls")}
                      </span>
                      <Button size="sm" variant={guestRequestsEnabled ? "default" : "outline"} onClick={() => setGuestRequestsEnabled(prev => !prev)} className="gap-1.5 text-xs">
                        {guestRequestsEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        {guestRequestsEnabled ? t("guestRequestsOn") : t("guestRequestsOff")}
                      </Button>
                    </div>
                    {guestRequestsEnabled && (
                      <HostGuestControls
                        liveId={id!}
                        isHost={isArtist}
                        currentUserId={currentUserId}
                        onKickGuest={(requestId) => {
                          toast({ title: t("guestKicked") });
                        }}
                      />
                    )}
                  </div>
                )}
              </CardContent>
              )}
            </Card>
          </div>

          {/* Sidebar — desktop only */}
          {!isMobile && (
          <div className="lg:col-span-1 space-y-4">
            <ConcertGiftPanel
              concertId={id!}
              artistId={live.artist_id}
              artistName={live.artist_name}
            />
            <QuickTip recipientIds={[{ id: live.artist_id, name: live.artist_name || "Artiste" }]} />
            {!isArtist && currentUserId && (
              <DedicationDialog concertId={id!} artistName={live.artist_name || "Artiste"} concertType="artist_live" />
            )}
            <GiftLeaderboard liveId={id!} />

            {/* Chat */}
            <Card className="border-border">
              <CardContent className="p-3">
                <h4 className="font-semibold text-sm mb-2">{t("liveChatTitle")}</h4>
                <div className="h-[300px] overflow-y-auto overflow-x-hidden scrollbar-hidden space-y-2 mb-3 pr-1">
                  {chatMessages.map((msg) => {
                    const isReply = msg.parent_id && msg.reply_to_name;
                    return (
                      <div key={msg.id} className="flex items-start gap-2 group">
                        <Avatar className="w-6 h-6 flex-shrink-0">
                          <AvatarImage src={msg.avatar_url} />
                          <AvatarFallback className="text-xs">{msg.user_name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          {isReply && (
                            <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 mb-0.5">
                              <span>↩</span>
                              <span className="font-medium text-primary">{msg.reply_to_name}</span>
                              <span className="truncate max-w-[120px] opacity-70">{msg.reply_to_message}</span>
                            </div>
                          )}
                          <span className="text-xs font-semibold text-primary">{msg.user_name}</span>
                          <p className="text-xs text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.message}</p>
                        </div>
                        <button
                          onClick={() => setReplyToDesktop(msg)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary shrink-0"
                          title="Répondre"
                        >
                          <span className="text-xs">↩</span>
                        </button>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
                {currentUserId && (
                  <div className="space-y-1">
                    {replyToDesktop && (
                      <div className="flex items-center gap-1 text-[10px] text-primary bg-primary/10 rounded px-2 py-1">
                        <span>↩ {replyToDesktop.user_name}:</span>
                        <span className="truncate max-w-[150px] text-muted-foreground">{replyToDesktop.message}</span>
                        <button onClick={() => setReplyToDesktop(null)} className="ml-auto text-muted-foreground hover:text-foreground">✕</button>
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <Input
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                          placeholder={t("writeMessagePlaceholder")}
                          className="text-sm h-8 pr-8"
                        />
                        <button
                          onClick={() => setShowDesktopEmoji(v => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          😀
                        </button>
                      </div>
                      <Button size="sm" onClick={sendMessage} className="h-8">
                        {t("sendBtnLabel")}
                      </Button>
                    </div>
                    {showDesktopEmoji && (
                      <div className="flex flex-wrap gap-1 bg-muted/50 rounded-lg p-2">
                        {["😀","😂","❤️","🔥","👏","🎵","🎤","💯","😍","🙌","💪","🎉","😮","👀","✨","🥳"].map(e => (
                          <button key={e} onClick={() => { setNewMessage(prev => prev + e); setShowDesktopEmoji(false); }} className="text-lg hover:scale-125 transition-transform p-0.5">{e}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          )}
        </div>
      </main>
      {!isMobile && <Footer />}
    </div>
  );
};

export default LiveStream;
