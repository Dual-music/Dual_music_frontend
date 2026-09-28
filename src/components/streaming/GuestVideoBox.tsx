/**
 * Tuile vidéo d'un invité multi-cam : nom, mute indicator, kick (host only).
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLiveKit } from "@/hooks/useLiveKit";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";
import { useAudioActivity } from "@/hooks/useAudioActivity";
import { Maximize, Minimize, Video, VideoOff, Mic, MicOff, Timer } from "lucide-react";

interface GuestVideoBoxProps {
  guestUserId: string;
  guestName: string;
  guestAvatarUrl?: string;
  liveId: string;
  currentUserId: string | null;
  localStream?: MediaStream | null;
  isExpanded?: boolean;
  isMainView?: boolean;
  onToggleExpand?: () => void;
  timerRemaining?: number;
  timerTotal?: number;
  forceMicOff?: boolean;
}

export const GuestVideoBox = ({
  guestUserId,
  guestName,
  guestAvatarUrl,
  liveId,
  currentUserId,
  localStream,
  isExpanded,
  isMainView,
  onToggleExpand,
  timerRemaining: externalTimerRemaining,
  timerTotal: externalTimerTotal,
  forceMicOff = false,
}: GuestVideoBoxProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [hasAudioTrack, setHasAudioTrack] = useState(false);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);
  const [attachedStream, setAttachedStream] = useState<MediaStream | null>(null);
  const speakingTimeRemaining = externalTimerRemaining || 0;
  const speakingTimeTotal = externalTimerTotal || 0;
  const isMe = currentUserId === guestUserId;
  const guestRoomId = `live-guest-${liveId}-${guestUserId}`;

  // Broadcast state takes absolute priority over track inspection (no TTL)
  const broadcastStateRef = useRef<{ isMicOn: boolean; isCamOn: boolean } | null>(null);

  const syncMediaState = useCallback((stream: MediaStream) => {
    // If we have a broadcast state, it takes absolute priority (no TTL - stays until next broadcast)
    const bc = broadcastStateRef.current;
    if (bc) {
      setHasVideo(bc.isCamOn);
      setHasVideoTrack(bc.isCamOn);
      setHasAudioTrack(bc.isMicOn);
      return;
    }

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

    const hasLiveVideoTrack = videoTracks.some(
      (track) => track.readyState === "live" && track.enabled && !track.muted
    );
    const hasLiveAudioTrack = audioTracks.some(
      (track) => track.readyState === "live" && track.enabled && !track.muted
    );

    setHasVideo(hasLiveVideoTrack);
    setHasVideoTrack(hasLiveVideoTrack);
    setHasAudioTrack(hasLiveAudioTrack);
  }, []);

  const attachStream = useCallback((stream: MediaStream) => {
    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.warn("[GuestVideoBox] Video autoplay blocked:", err);
      });
    }
    // Always attach to audio element as fallback for audio-only streams
    // This ensures audio plays even when video element can't autoplay audio-only content
    if (audioRef.current && audioRef.current.srcObject !== stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch((err) => {
        console.warn("[GuestVideoBox] Audio fallback autoplay blocked:", err);
        // Retry on next user interaction
        const retryPlay = () => {
          audioRef.current?.play().catch(() => {});
          document.removeEventListener('click', retryPlay);
          document.removeEventListener('touchstart', retryPlay);
        };
        document.addEventListener('click', retryPlay, { once: true });
        document.addEventListener('touchstart', retryPlay, { once: true });
      });
    }
    setAttachedStream(stream);
    syncMediaState(stream);
  }, [syncMediaState]);

  const {
    remoteStreams,
    joinRoom,
    leaveRoom,
    startLocalStream,
    toggleAudio,
    toggleVideo,
  } = useLiveKit({
    roomName: guestRoomId,
    userId: currentUserId || "anon",
    isHost: isMe,
    canPublish: isMe,
    onRemoteStream: (stream: MediaStream) => {
      if (!isMe) attachStream(stream);
    },
    onPeerLeave: () => {
      setHasVideo(false);
      setHasVideoTrack(false);
      setHasAudioTrack(false);
    },
  });

  // For self (isMe): when localStream changes, attach and publish/unpublish via LiveKit.
  // CRITICAL: toggleAudio/toggleVideo actually mute/unmute the published tracks at the SFU level,
  // so other participants stop receiving the stream when toggled off.
  const lastPublishedRef = useRef<{ video: boolean; audio: boolean }>({ video: false, audio: false });
  useEffect(() => {
    if (!isMe || !localStream) return;
    attachStream(localStream);
    const wantsVideo = localStream.getVideoTracks().some(t => t.enabled && t.readyState === "live");
    const wantsAudio = localStream.getAudioTracks().some(t => t.enabled && t.readyState === "live");

    // First time → start local stream so LiveKit publishes the tracks
    if (!lastPublishedRef.current.video && !lastPublishedRef.current.audio) {
      startLocalStream(wantsVideo, wantsAudio);
    } else {
      // Subsequent toggles → just mute/unmute the published track at LiveKit level
      if (lastPublishedRef.current.video !== wantsVideo) toggleVideo(wantsVideo);
      if (lastPublishedRef.current.audio !== wantsAudio) toggleAudio(wantsAudio);
    }
    lastPublishedRef.current = { video: wantsVideo, audio: wantsAudio };
  }, [isMe, localStream, attachStream, startLocalStream, toggleAudio, toggleVideo]);

  useEffect(() => {
    if (currentUserId) {
      joinRoom();
      return () => { leaveRoom(); };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  useEffect(() => {
    if (!isMe) {
      const streams = Array.from(remoteStreams.values());
      if (streams.length > 0) {
        attachStream(streams[0]);
      }
    }
  }, [remoteStreams, isMe, attachStream]);

  useEffect(() => {
    if (!attachedStream) {
      setHasVideo(false);
      setHasVideoTrack(false);
      setHasAudioTrack(false);
      return;
    }

    const handleStreamChange = () => syncMediaState(attachedStream);

    attachedStream.addEventListener("addtrack", handleStreamChange);
    attachedStream.addEventListener("removetrack", handleStreamChange);

    const tracks = attachedStream.getTracks();
    tracks.forEach((track) => {
      track.addEventListener("ended", handleStreamChange);
      track.addEventListener("mute", handleStreamChange);
      track.addEventListener("unmute", handleStreamChange);
    });

    const interval = setInterval(handleStreamChange, 2000);

    return () => {
      attachedStream.removeEventListener("addtrack", handleStreamChange);
      attachedStream.removeEventListener("removetrack", handleStreamChange);
      tracks.forEach((track) => {
        track.removeEventListener("ended", handleStreamChange);
        track.removeEventListener("mute", handleStreamChange);
        track.removeEventListener("unmute", handleStreamChange);
      });
      clearInterval(interval);
    };
  }, [attachedStream, syncMediaState]);

  // Listen for broadcast media state changes — AUTHORITATIVE source (Socket.IO).
  // Channel name must match LiveStream's broadcastMediaState channel.
  useRoomBroadcast(
    liveId ? `live-guest-state-${liveId}` : null,
    (event, payload) => {
      if (event !== "guest_media_state") return;
      const p = payload as { userId?: string; isCamOn?: boolean; isMicOn?: boolean };
      if (p.userId === guestUserId) {
        const isCamOn = !!p.isCamOn;
        const isMicOn = !!p.isMicOn;
        broadcastStateRef.current = { isMicOn, isCamOn };
        setHasVideoTrack(isCamOn);
        setHasAudioTrack(isMicOn);
        setHasVideo(isCamOn);
      }
    },
  );

  // Timer is now driven by props from parent (timerRemaining/timerTotal)

  const sizeClasses = isMainView
    ? "w-full h-full"
    : isExpanded
      ? "w-36 h-36 md:w-44 md:h-44"
      : "w-20 h-20 md:w-24 md:h-24";

  const borderColor = !hasVideo && !hasAudioTrack
    ? "border-muted-foreground/50"
    : hasVideoTrack && hasAudioTrack
      ? "border-green-500"
      : hasVideoTrack || hasAudioTrack
        ? "border-yellow-500"
        : "border-red-500";

  const micIsOn = forceMicOff ? false : hasAudioTrack;

  // Speaking detection — pulse the border when this guest is actually making sound
  const isSpeaking = useAudioActivity(attachedStream, { enabled: micIsOn && !forceMicOff });

  const truncatedName = guestName && guestName.length > 12 ? guestName.slice(0, 12) + "…" : guestName;

  const speakingRing = "";

  return (
    <div
      className={`${sizeClasses} ${isMainView ? '' : `rounded-lg ${borderColor} border-2 cursor-pointer hover:ring-2 hover:ring-primary ${speakingRing}`} overflow-hidden bg-black transition-all relative group`}
      onClick={onToggleExpand}
    >
      {isSpeaking && (
        <span
          aria-label="speaking"
          className="absolute top-1 left-1 z-30 w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_1px_rgba(34,197,94,0.7)]"
        />
      )}
      {/* CRITICAL: Never use display:none (hidden) — it stops audio playback in most browsers.
          Use opacity-0 so audio-only streams still play.
          object-contain en vue PRINCIPALE (agrandie) : ne rogne jamais le cadre (le flux mobile
          portrait dans un conteneur desktop plus large coupait tête/bas du corps). Les petites
          vignettes gardent object-cover pour un cadrage net. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMe}
        className={`w-full h-full ${isMainView ? 'object-contain' : 'object-cover'} ${hasVideo ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
      />
      {/* Hidden audio element as fallback — ensures audio-only streams play reliably
          across all browsers, especially when mic is activated without camera */}
      {!isMe && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          className="hidden"
        />
      )}

      {!hasVideo && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/30 to-accent/30">
          <Avatar className={isMainView ? "w-16 h-16 md:w-20 md:h-20" : "w-8 h-8 md:w-10 md:h-10"}>
            <AvatarImage src={guestAvatarUrl} />
            <AvatarFallback className={isMainView ? "text-xl" : "text-xs"}>{guestName?.charAt(0)}</AvatarFallback>
          </Avatar>
        </div>
      )}

      {/* Name + status overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 flex items-center justify-between">
        <span className={`${isMainView ? 'text-xs md:text-sm' : 'text-[8px] md:text-[10px]'} text-white font-medium truncate ${isMainView ? 'max-w-[200px]' : 'max-w-[50px] md:max-w-[70px]'}`} style={{ textOverflow: 'ellipsis' }}>
          {isMainView ? guestName : truncatedName}
        </span>
        <div className="flex items-center gap-0.5">
          {hasVideoTrack ? (
            <Video className="w-2.5 h-2.5 text-green-400" />
          ) : (
            <VideoOff className="w-2.5 h-2.5 text-red-400" />
          )}
          {micIsOn ? (
            <Mic className="w-2.5 h-2.5 text-green-400" />
          ) : (
            <MicOff className="w-2.5 h-2.5 text-red-400" />
          )}
        </div>
      </div>

      {/* Speaking timer overlay — visible on both small and large view */}
      {speakingTimeRemaining > 0 && (
        <div className={`absolute ${isMainView ? 'top-3 left-3' : 'top-1 left-1'} bg-black/80 backdrop-blur-sm rounded-lg px-1.5 py-0.5 flex items-center gap-1 z-10 ${speakingTimeRemaining <= 10 ? 'border border-destructive animate-pulse' : 'border border-accent/50'}`}>
          <Timer className={`${isMainView ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'} ${speakingTimeRemaining <= 10 ? 'text-destructive' : 'text-accent'}`} />
          <span className={`${isMainView ? 'text-xs' : 'text-[9px] md:text-[10px]'} font-bold ${speakingTimeRemaining <= 10 ? 'text-destructive' : 'text-accent'} tabular-nums`}>
            {Math.floor(speakingTimeRemaining / 60)}:{String(speakingTimeRemaining % 60).padStart(2, "0")}
          </span>
        </div>
      )}

      {!isMainView && (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {isExpanded ? (
            <Minimize className="w-3 h-3 text-white drop-shadow-lg" />
          ) : (
            <Maximize className="w-3 h-3 text-white drop-shadow-lg" />
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Hook for a guest to broadcast their stream via WebRTC to all viewers.
 */
export const useGuestBroadcast = (liveId: string | undefined, userId: string | null, stream: MediaStream | null) => {
  // This hook is now a no-op — guest publishing is handled directly by GuestVideoBox
  // via useLiveKit with isHost=true when isMe=true.
};
