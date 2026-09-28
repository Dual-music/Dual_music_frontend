/**
 * Stream double-cam duel : 2 hosts en split-screen via LiveKit, signaling `webrtc_signaling`, sync timer (`DuelVideoTimer`).
 */
/**
 * WebRTCDuelStream
 * ----------------
 * Composant central du duel : orchestre les flux LiveKit des deux artistes,
 * la composition vidéo (split screen), l'audio activity et les contrôles host.
 *
 * Architecture :
 *  - LiveKit Cloud SFU (hook `useLiveKit`) pour pub/sub des tracks
 *  - `useAudioActivity` détecte qui parle pour surligner la caméra active
 *  - `replaceTrack` pour le flip caméra avant/arrière sans re-publier
 *  - Hard Mute par le manager via canal Realtime broadcast
 *  - Failsafe timer DB : auto-stop si la durée du duel est dépassée
 *
 * Exposé via `forwardRef` pour permettre au parent (DuelLive) de déclencher
 * snapshot, stop, ou switch focus depuis l'overlay mobile.
 *
 * @see src/hooks/useLiveKit.ts
 * @see mem://features/duel-system-flow
 */
import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef, useMemo } from "react";
import { useLiveKit } from "@/hooks/useLiveKit";
import { useAudioActivity } from "@/hooks/useAudioActivity";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Video, VideoOff, Mic, MicOff, Radio, Wifi, WifiOff, Pause, Play, SwitchCamera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";
import { useLanguage } from "@/contexts/LanguageContext";
import { VideoFiltersPicker } from "@/components/streaming/VideoFiltersPicker";
import { useVideoFilter } from "@/hooks/useVideoFilter";
import { getFilterCss } from "@/lib/videoFilters";

export interface WebRTCDuelStreamHandle {
  startStreaming: () => Promise<void>;
  stopStreaming: () => void;
  pauseStream: () => void;
  resumeStream: () => void;
  toggleCamera: () => void;
  toggleMic: () => void;
  switchCamera: () => void;
  getState: () => { isStreaming: boolean; isPaused: boolean; isCameraOn: boolean; isMicOn: boolean };
}

interface WebRTCDuelStreamProps {
  roomId: string;
  duelId?: string;
  oderId: string;
  participantName: string;
  avatarUrl?: string | null;
  isCurrentUser: boolean;
  isParticipant: boolean;
  onStreamReady?: (stream: MediaStream) => void;
  isMutedByManager?: boolean;
  hideName?: boolean;
  hideControls?: boolean;
  onMediaStateChange?: (state: { isMicOn: boolean; isCameraOn: boolean; isStreaming: boolean; isPaused: boolean }) => void;
  signalingUserId?: string;
}

/** Helper: safely play a media element, ignoring AbortError */
const safePlay = (el: HTMLMediaElement | null) => {
  if (!el || !el.srcObject) return;
  el.play().catch((err) => {
    if (err.name !== "AbortError") {
      console.warn("[safePlay] play() blocked:", err.name, err.message);
    }
  });
};

const WebRTCDuelStreamInner = forwardRef<WebRTCDuelStreamHandle, WebRTCDuelStreamProps>(({ 
  roomId,
  duelId,
  oderId,
  participantName,
  avatarUrl,
  isCurrentUser,
  isParticipant,
  onStreamReady,
  isMutedByManager = false,
  hideName = false,
  hideControls = false,
  onMediaStateChange,
  signalingUserId,
}: WebRTCDuelStreamProps, ref) => {
  const effectiveUserId = signalingUserId || oderId;
  const { toast } = useToast();
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isForceMuted, setIsForceMuted] = useState(false);
  // Track if remote video is actually active (driven by track events, NOT inspected on every render)
  const [remoteVideoActive, setRemoteVideoActive] = useState(false);
  // Track if we ever unlocked media elements with user gesture
  const mediaUnlockedRef = useRef(false);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const {
    localStream,
    remoteStreams,
    isConnected,
    room,
    startLocalStream,
    joinRoom,
    leaveRoom,
    toggleVideo,
    toggleAudio,
    switchCamera,
  } = useLiveKit({
    roomName: roomId,
    userId: effectiveUserId,
    isHost: isCurrentUser && isParticipant,
    participantName,
    canPublish: isCurrentUser && isParticipant,
    onRemoteStream: (stream) => {
      if (!isCurrentUser) {
        applyStreamToElements(stream);
      }
    },
    onError: (error) => {
      // Silent: connection retries are handled by the SDK, no need to alarm the user.
      console.warn("[WebRTCDuelStream] LiveKit error:", error);
    },
  });

  // Video filter (TikTok-style) — only when current user is publishing
  const canApplyFilter = isCurrentUser && isParticipant && isStreaming && isCameraOn && !isPaused;
  const { filterId, setFilterId } = useVideoFilter(room, canApplyFilter);

  /** Apply stream to video and audio elements and call play() */
  const applyStreamToElements = useCallback((stream: MediaStream) => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      safePlay(videoRef.current);
    }
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
      safePlay(audioRef.current);
    }
  }, []);

  // Set video source for local stream
  useEffect(() => {
    if (localStream && videoRef.current && isCurrentUser) {
      videoRef.current.srcObject = localStream;
      safePlay(videoRef.current);
      onStreamReady?.(localStream);
    }
  }, [localStream, isCurrentUser, onStreamReady]);

  // Set video source for remote stream (viewer) + audio fallback
  useEffect(() => {
    if (!isCurrentUser) {
      const streams = Array.from(remoteStreams.values());
      if (streams.length > 0) {
        applyStreamToElements(streams[0]);
      }
    }
  }, [remoteStreams, isCurrentUser, applyStreamToElements]);

  // Robust srcObject re-application + play() retry
  useEffect(() => {
    const reapply = () => {
      if (!videoRef.current) return;
      if (isCurrentUser && localStream) {
        if (videoRef.current.srcObject !== localStream) {
          videoRef.current.srcObject = localStream;
          safePlay(videoRef.current);
        }
        // Also retry play if paused
        if (videoRef.current.paused && videoRef.current.srcObject) {
          safePlay(videoRef.current);
        }
      } else if (!isCurrentUser) {
        const streams = Array.from(remoteStreams.values());
        if (streams.length > 0) {
          const stream = streams[0];
          if (videoRef.current.srcObject !== stream) {
            videoRef.current.srcObject = stream;
          }
          // Always retry play
          if (videoRef.current.paused) safePlay(videoRef.current);

          if (audioRef.current) {
            if (audioRef.current.srcObject !== stream) {
              audioRef.current.srcObject = stream;
            }
            if (audioRef.current.paused) safePlay(audioRef.current);
          }
        }
      }
    };
    const interval = setInterval(reapply, 1000);
    document.addEventListener('fullscreenchange', reapply);
    return () => { clearInterval(interval); document.removeEventListener('fullscreenchange', reapply); };
  }, [isCurrentUser, localStream, remoteStreams]);

  // Auto-join room for viewers - stabilized refs
  const joinRoomRef = useRef(joinRoom);
  const leaveRoomRef = useRef(leaveRoom);
  useEffect(() => { joinRoomRef.current = joinRoom; }, [joinRoom]);
  useEffect(() => { leaveRoomRef.current = leaveRoom; }, [leaveRoom]);

  useEffect(() => {
    if (!isCurrentUser) {
      joinRoomRef.current();
      return () => { leaveRoomRef.current(); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrentUser]);

  // Viewer retry: if no remote stream after 5s, re-send join
  useEffect(() => {
    if (isCurrentUser) return;
    const retryInterval = setInterval(() => {
      const streams = Array.from(remoteStreams.values());
      if (streams.length === 0 && isConnected) {
        console.log("[WebRTCDuelStream] No remote stream yet, re-sending join...");
        joinRoomRef.current();
      }
    }, 5000);
    return () => clearInterval(retryInterval);
  }, [isCurrentUser, remoteStreams, isConnected]);

  // Track remote video state via track events (not by inspecting on every render).
  // Newly subscribed remote tracks can have track.muted=true momentarily even when video is playing,
  // so we drive UI off real ended/mute/unmute events + an initial debounce.
  useEffect(() => {
    if (isCurrentUser) {
      setRemoteVideoActive(false);
      return;
    }
    const remoteStream = Array.from(remoteStreams.values())[0];
    if (!remoteStream) {
      setRemoteVideoActive(false);
      return;
    }

    const evaluate = () => {
      const videoTracks = remoteStream.getVideoTracks();
      const hasUsableVideo = videoTracks.some(
        (t) => t.readyState === "live" && t.enabled && !t.muted
      );
      // Optimistic: if there is a live track at all (even if temporarily muted), keep it active
      // for the first 2s after subscription to avoid a false "camera disabled" flash.
      const hasAnyLive = videoTracks.some((t) => t.readyState === "live" && t.enabled);
      setRemoteVideoActive(hasUsableVideo || hasAnyLive);
    };

    evaluate();

    const handlers: Array<() => void> = [];
    remoteStream.getVideoTracks().forEach((track) => {
      const onMute = () => {
        // Real "muted" only matters if it stays muted — give 800ms grace
        setTimeout(evaluate, 800);
      };
      const onUnmute = () => evaluate();
      const onEnded = () => evaluate();
      track.addEventListener("mute", onMute);
      track.addEventListener("unmute", onUnmute);
      track.addEventListener("ended", onEnded);
      handlers.push(() => {
        track.removeEventListener("mute", onMute);
        track.removeEventListener("unmute", onUnmute);
        track.removeEventListener("ended", onEnded);
      });
    });

    const onAdd = () => evaluate();
    const onRemove = () => evaluate();
    remoteStream.addEventListener("addtrack", onAdd);
    remoteStream.addEventListener("removetrack", onRemove);

    const interval = setInterval(evaluate, 1500);

    return () => {
      handlers.forEach((fn) => fn());
      remoteStream.removeEventListener("addtrack", onAdd);
      remoteStream.removeEventListener("removetrack", onRemove);
      clearInterval(interval);
    };
  }, [isCurrentUser, remoteStreams]);

  // Unlock media elements on any user interaction (touch/click)
  useEffect(() => {
    if (isCurrentUser) return;
    const unlock = () => {
      if (mediaUnlockedRef.current) return;
      mediaUnlockedRef.current = true;
      if (videoRef.current) safePlay(videoRef.current);
      if (audioRef.current) safePlay(audioRef.current);
      console.log("[WebRTCDuelStream] Media elements unlocked via user gesture");
    };
    document.addEventListener("click", unlock, { once: false });
    document.addEventListener("touchstart", unlock, { once: false });
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
    };
  }, [isCurrentUser]);

  // Notify parent of media state changes
  useEffect(() => {
    onMediaStateChange?.({ isMicOn, isCameraOn, isStreaming, isPaused });
  }, [isMicOn, isCameraOn, isStreaming, isPaused]);

  // FORCE_MUTE/FORCE_UNMUTE broadcast listener (artist-side hard mute) via Socket.IO.
  useRoomBroadcast(
    duelId && isCurrentUser ? `duel-mute-${duelId}` : null,
    (event, payload) => {
      const targetArtistId = (payload as { artistId?: string })?.artistId;
      if (targetArtistId !== oderId) return;
      if (event === "FORCE_MUTE") {
        // Mute UNIQUEMENT le micro : on coupe la piste audio + on signale à LiveKit, SANS
        // reconstruire le localStream (toggleAudio le faisait → la caméra locale se fermait).
        if (localStream) localStream.getAudioTracks().forEach((track) => { track.enabled = false; });
        room?.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        setIsMicOn(false);
        setIsForceMuted(true);
      } else if (event === "FORCE_UNMUTE") {
        if (localStream) localStream.getAudioTracks().forEach((track) => { track.enabled = true; });
        room?.localParticipant.setMicrophoneEnabled(true).catch(() => {});
        setIsMicOn(true);
        setIsForceMuted(false);
      }
    },
  );

  // Sync local mute state from parent manager state and enforce hard mute on tracks
  useEffect(() => {
    if (!isCurrentUser || !localStream) return;

    if (isMutedByManager) {
      // Mute micro seul, sans reconstruire le localStream (évite de fermer la caméra locale).
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      room?.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      setIsMicOn(false);
      setIsForceMuted(true);
      return;
    }

    setIsForceMuted(false);
  }, [isMutedByManager, isCurrentUser, localStream, room]);

  // Expose control methods via ref
  const startStreamingRef = useRef<() => Promise<void>>();
  const stopStreamingRef = useRef<() => void>();
  const pauseStreamRef = useRef<() => void>();
  const resumeStreamRef = useRef<() => void>();
  const toggleCameraRef = useRef<() => void>();
  const toggleMicRef = useRef<() => void>();

  const startStreaming = useCallback(async () => {
    if (isStarting || isStreaming) return;
    setIsStarting(true);
    try {
      if (localStream) {
        toggleVideo(true);
        toggleAudio(true);
        setIsStreaming(true);
        setIsCameraOn(true);
        setIsMicOn(true);
        toast({ title: "Caméra activée", description: "Vous êtes en direct!" });
        return;
      }
      // Connect to room FIRST, then start local stream (so tracks get published)
      await joinRoom();
      const stream = await startLocalStream(true, true);
      if (stream) {
        setIsStreaming(true);
        toast({ title: "Caméra activée", description: "Vous êtes en direct!" });
      }
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, isStreaming, localStream, startLocalStream, joinRoom, toast, toggleVideo, toggleAudio]);

  const stopStreaming = useCallback(async () => {
    toggleVideo(false);
    toggleAudio(false);
    setIsStreaming(false);
    setIsPaused(false);
    setIsCameraOn(false);
    setIsMicOn(false);
  }, [toggleVideo, toggleAudio]);

  const pauseStream = useCallback(() => {
    toggleVideo(false);
    toggleAudio(false);
    setIsPaused(true);
    setIsCameraOn(false);
    setIsMicOn(false);
  }, [toggleVideo, toggleAudio]);

  const resumeStream = useCallback(() => {
    toggleVideo(true);
    toggleAudio(true);
    setIsPaused(false);
    setIsCameraOn(true);
    setIsMicOn(true);
  }, [toggleVideo, toggleAudio]);

  const handleToggleCamera = useCallback(() => {
    const newState = !isCameraOn;
    toggleVideo(newState);
    setIsCameraOn(newState);
  }, [isCameraOn, toggleVideo]);

  const handleToggleMic = useCallback(() => {
    // Block mic re-enable when muted by manager
    if (isMutedByManager || isForceMuted) {
      toast({ title: "Micro coupé par le manager", variant: "destructive" });
      return;
    }
    const newState = !isMicOn;
    toggleAudio(newState);
    setIsMicOn(newState);
  }, [isMicOn, isMutedByManager, isForceMuted, toggleAudio, toast]);

  const handleSwitchCamera = useCallback(async () => {
    if (!isStreaming) return;
    const newStream = await switchCamera(facingMode);
    if (newStream) {
      setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        safePlay(videoRef.current);
      }
    }
  }, [isStreaming, switchCamera, facingMode]);

  startStreamingRef.current = startStreaming;
  stopStreamingRef.current = stopStreaming;
  pauseStreamRef.current = pauseStream;
  resumeStreamRef.current = resumeStream;
  toggleCameraRef.current = handleToggleCamera;
  toggleMicRef.current = handleToggleMic;

  useImperativeHandle(ref, () => ({
    startStreaming: () => startStreamingRef.current?.() || Promise.resolve(),
    stopStreaming: () => stopStreamingRef.current?.(),
    pauseStream: () => pauseStreamRef.current?.(),
    resumeStream: () => resumeStreamRef.current?.(),
    toggleCamera: () => toggleCameraRef.current?.(),
    toggleMic: () => toggleMicRef.current?.(),
    switchCamera: () => handleSwitchCamera(),
    getState: () => ({ isStreaming, isPaused, isCameraOn, isMicOn }),
  }), [isStreaming, isPaused, isCameraOn, isMicOn, handleSwitchCamera]);

  const hasRemoteStream = !isCurrentUser && Array.from(remoteStreams.values()).length > 0;

  // Speaking detection — pulse the border when this slot is making sound
  const activeStream = useMemo<MediaStream | null>(() => {
    if (isCurrentUser) return localStream || null;
    const remote = Array.from(remoteStreams.values())[0];
    return remote || null;
  }, [isCurrentUser, localStream, remoteStreams]);
  const speakingEnabled = isCurrentUser ? (isMicOn && !isPaused && !isForceMuted) : hasRemoteStream;
  const isSpeaking = useAudioActivity(activeStream, { enabled: speakingEnabled });

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: 'linear-gradient(135deg, hsl(var(--muted)), hsl(var(--accent)/0.15))' }}
    >
      {isSpeaking && (
        <span
          aria-label="speaking"
          className="absolute top-2 left-2 z-30 w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_6px_2px_rgba(34,197,94,0.7)]"
        />
      )}
      {/* Video: always muted for viewers (audio via separate element) to bypass autoplay restrictions */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={isCurrentUser ? { filter: getFilterCss(filterId) } : undefined}
      />
      {/* Hidden audio element for remote audio playback (NOT muted) */}
      {!isCurrentUser && <audio ref={audioRef} autoPlay playsInline />}

      {/* Pause overlay */}
      {isPaused && isCurrentUser && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <Pause className="w-10 h-10 text-yellow-500 mx-auto mb-2" />
            <p className="text-white font-bold">{t("streamPaused")}</p>
          </div>
        </div>
      )}

      {/* Camera off overlay — show avatar instead of black (for current user) */}
      {isStreaming && !isPaused && !isCameraOn && isCurrentUser && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted/80">
          <div className="text-center">
            <Avatar className="w-16 h-16 mx-auto mb-2 border-2 border-border">
              <AvatarImage src={avatarUrl || ""} />
              <AvatarFallback className="text-lg">{participantName?.charAt(0) || "?"}</AvatarFallback>
            </Avatar>
            <p className="text-foreground text-xs font-medium">{participantName}</p>
            <p className="text-muted-foreground text-[10px] mt-0.5">
              <VideoOff className="w-3 h-3 inline mr-0.5" />Caméra désactivée
            </p>
          </div>
        </div>
      )}

      {/* Camera off overlay for VIEWERS — driven by remoteVideoActive state, not per-render inspection.
          This avoids the false "Caméra désactivée" flash on initial subscription when t.muted is briefly true. */}
      {!isCurrentUser && hasRemoteStream && !remoteVideoActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted/80">
          <div className="text-center">
            <Avatar className="w-16 h-16 mx-auto mb-2 border-2 border-border">
              <AvatarImage src={avatarUrl || ""} />
              <AvatarFallback className="text-lg">{participantName?.charAt(0) || "?"}</AvatarFallback>
            </Avatar>
            <p className="text-foreground text-xs font-medium">{participantName}</p>
            <p className="text-muted-foreground text-[10px] mt-0.5">
              <VideoOff className="w-3 h-3 inline mr-0.5" />{t("cameraDisabled")}
            </p>
          </div>
        </div>
      )}

      {/* Waiting overlay for viewer */}
      {!isCurrentUser && !hasRemoteStream && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20">
          <div className="text-center">
            {isConnected ? (
              <>
                <Wifi className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-white font-bold text-xs">{participantName}</p>
                <p className="text-white/60 text-[10px]">Connecté — en attente du flux</p>
              </>
            ) : (
              <>
                <Radio className="w-8 h-8 text-white/50 mx-auto mb-2 animate-pulse" />
                <p className="text-white font-bold text-xs">Connexion...</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Muted by manager indicator */}
      {(isMutedByManager || isForceMuted) && isCurrentUser && (
        <div className="absolute top-2 left-2 z-10">
          <span className="bg-destructive/80 text-destructive-foreground text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
            <MicOff className="w-3 h-3" /> Micro coupé par le manager
          </span>
        </div>
      )}

      {/* Déclencheur des filtres (participant qui publie) — descendu SOUS la barre d'actions
          globale (likes/partage/plein écran) pour ne plus la chevaucher. */}
      {canApplyFilter && !hideControls && (
        <div className="absolute top-24 right-2 z-20">
          <VideoFiltersPicker filterId={filterId} onChange={setFilterId} compact />
        </div>
      )}

      {isCurrentUser && !isStreaming && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20">
          <div className="text-center">
            <Radio className="w-8 h-8 text-white/50 mx-auto mb-2" />
            <p className="text-white text-xs font-bold">{t("readyToStart")}</p>
          </div>
        </div>
      )}

      {/* Controls for the current user */}
      {!hideControls && isCurrentUser && isParticipant && (
        <div className="absolute bottom-2 right-2 flex gap-1 z-20">
          {!isStreaming ? (
            <Button onClick={startStreaming} disabled={isStarting} size="sm" className="bg-gradient-primary text-xs h-7 disabled:opacity-60">
              <Video className="w-3 h-3 mr-1" /> {isStarting ? "…" : "Go Live"}
            </Button>
          ) : (
            <>
              {isPaused ? (
                <Button onClick={resumeStream} size="icon" className="bg-green-500 hover:bg-green-600 h-7 w-7">
                  <Play className="w-3 h-3" />
                </Button>
              ) : (
                <Button onClick={pauseStream} size="icon" variant="outline" className="border-yellow-500 text-yellow-500 h-7 w-7">
                  <Pause className="w-3 h-3" />
                </Button>
              )}
              <Button onClick={handleSwitchCamera} size="icon" variant="secondary" className="h-7 w-7" title={t("switchCamera")}>
                <SwitchCamera className="w-3 h-3" />
              </Button>
              <Button onClick={handleToggleCamera} size="icon" variant={isCameraOn ? "secondary" : "outline"} className="h-7 w-7">
                {isCameraOn ? <Video className="w-3 h-3" /> : <VideoOff className="w-3 h-3" />}
              </Button>
              <Button onClick={handleToggleMic} size="icon" variant={isMicOn ? "secondary" : "outline"} className={`h-7 w-7 ${(isMutedByManager || isForceMuted) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {isMicOn ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
              </Button>
              <Button onClick={stopStreaming} size="icon" variant="destructive" className="h-7 w-7">
                <VideoOff className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

WebRTCDuelStreamInner.displayName = "WebRTCDuelStream";

// Wrap with React.memo to prevent re-renders from parent timer/gift state changes
export const WebRTCDuelStream = React.memo(WebRTCDuelStreamInner);