/**
 * Host WebRTC concert payant (`ConcertLive`) : publication via LiveKit (edge `livekit-token`), recording composite (`useMediaRecorder`), gestion durée (`useConcertDuration`).
 */
/**
 * WebRTCHost (Concert)
 * --------------------
 * Composant côté ARTISTE pour diffuser un concert via LiveKit Cloud SFU.
 *
 * Responsabilités :
 *  - Acquisition caméra/micro avec contraintes adaptatives (mobile vs desktop)
 *  - Publication des tracks via `useLiveKit` (token signé par `livekit-token`)
 *  - Gestion invités scène (HostGuestControls) : promouvoir/retirer des spectateurs
 *  - Contrôles enregistrement (ConcertRecordingControls) → replay_videos
 *  - Filtres vidéo temps réel via Canvas pipeline (useVideoFilter)
 *  - Failsafe : auto-stop si durée concert dépassée (useConcertDuration)
 *  - Portail z-index 220 pour animations cadeaux/votes au-dessus de la vidéo
 *
 * @see src/hooks/useLiveKit.ts
 * @see mem://features/concert-platform
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLiveKit } from "@/hooks/useLiveKit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Video, VideoOff, Mic, MicOff, Radio, Users, Pause, Play, Wifi, WifiOff, SwitchCamera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { VideoFiltersPicker } from "@/components/streaming/VideoFiltersPicker";
import { useVideoFilter } from "@/hooks/useVideoFilter";
import { getFilterCss } from "@/lib/videoFilters";

export interface WebRTCHostControls {
  isStreaming: boolean;
  isPaused: boolean;
  isCameraOn: boolean;
  isMicOn: boolean;
  startStreaming: () => void;
  stopStreaming: () => void;
  pauseStreaming: () => void;
  resumeStreaming: () => void;
  handleToggleCamera: () => void;
  handleToggleMic: () => void;
  handleSwitchCamera: () => void;
}

interface WebRTCHostProps {
  roomId: string;
  hostId: string;
  avatarUrl?: string | null;
  hostName?: string;
  onStreamStart?: () => void;
  onStreamStop?: () => void;
  onStreamPause?: () => void;
  onStreamResume?: () => void;
  onStreamReady?: (stream: MediaStream) => void;
  /** Hide bottom controls on mobile (shown in MobileArtistControls instead) */
  hideMobileControls?: boolean;
  /** Hide LIVE badge, viewer count, Connecté when in thumbnail */
  hideOverlays?: boolean;
  /** Callback to expose host controls to parent */
  onControlsReady?: (controls: WebRTCHostControls) => void;
  /** Label for the context: "live" or "concert" */
  streamType?: "live" | "concert";
}

export const WebRTCHost = ({
  roomId,
  hostId,
  avatarUrl,
  hostName,
  onStreamStart,
  onStreamStop,
  onStreamPause,
  onStreamResume,
  onStreamReady,
  hideMobileControls = false,
  hideOverlays = false,
  onControlsReady,
  streamType = "concert",
}: WebRTCHostProps) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [filterSlot, setFilterSlot] = useState<HTMLElement | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const notifiedPeersRef = useRef<Set<string>>(new Set());
  // Dernier message d'erreur média (getUserMedia) remonté par useLiveKit — sert au toast précis.
  const lastMediaErrorRef = useRef<string | null>(null);

  const {
    localStream,
    isConnected,
    connectionState,
    peerCount,
    room,
    startLocalStream,
    joinRoom,
    leaveRoom,
    toggleVideo,
    toggleAudio,
    switchCamera,
  } = useLiveKit({
    roomName: roomId,
    userId: hostId,
    isHost: true,
    onPeerJoin: (peerId) => {
      if (!notifiedPeersRef.current.has(peerId)) {
        notifiedPeersRef.current.add(peerId);
        console.log("New viewer joined:", peerId);
        toast({
          title: "Nouveau spectateur",
          description: "Un spectateur a rejoint le concert",
        });
      }
    },
    onPeerLeave: (peerId) => {
      notifiedPeersRef.current.delete(peerId);
      console.log("Viewer left:", peerId);
    },
    onError: (error) => {
      // Silent pour les erreurs de connexion (UI déjà en "connecting" + reconnexion auto),
      // mais on mémorise le dernier message (utilisé par le toast d'échec caméra/micro).
      lastMediaErrorRef.current = error;
      console.warn("[WebRTCHost] LiveKit error:", error);
    },
  });

  // Video filter (TikTok-style) — applied via canvas processor on published track
  const { filterId, setFilterId } = useVideoFilter(room, isStreaming && isCameraOn && !isPaused);

  // On mobile, mount the filter trigger inside the MobileStreamOverlay slot (below description icon)
  useEffect(() => {
    if (!isMobile || !isStreaming || !isCameraOn || isPaused || hideOverlays) {
      setFilterSlot(null);
      return;
    }
    let raf = 0;
    const find = () => {
      const el = document.getElementById("mobile-video-filter-slot");
      if (el) setFilterSlot(el);
      else raf = requestAnimationFrame(find);
    };
    find();
    return () => { cancelAnimationFrame(raf); setFilterSlot(null); };
  }, [isMobile, isStreaming, isCameraOn, isPaused, hideOverlays]);

  // Update video element when local stream changes
  useEffect(() => {
    if (localStream && videoRef.current) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Notify parent when stream is ready
  useEffect(() => {
    if (localStream) {
      onStreamReady?.(localStream);
    }
  }, [localStream, onStreamReady]);

  const startStreaming = useCallback(async () => {
    if (isStarting || isStreaming) return;
    setIsStarting(true);
    lastMediaErrorRef.current = null;
    try {
      // 1. Connect to the room FIRST
      await joinRoom();
      
      // 2. THEN start local stream (which will publish tracks since room is now connected)
      const stream = await startLocalStream(true, true);
      if (!stream) {
        toast({
          title: "Erreur",
          description: lastMediaErrorRef.current || "Impossible d'accéder à la caméra/microphone.",
          variant: "destructive",
        });
        return;
      }
      
      setIsStreaming(true);
      setIsCameraOn(true);
      setIsMicOn(true);
      onStreamStart?.();
      toast({
        title: streamType === "live" ? "Live démarré" : "Concert démarré",
        description: "Vous êtes maintenant en direct!",
      });
    } catch (err) {
      console.error("Failed to start streaming:", err);
      toast({
        title: "Erreur",
        description: "Impossible de démarrer le streaming. Vérifiez votre connexion.",
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, isStreaming, startLocalStream, joinRoom, onStreamStart, toast, streamType]);

  const stopStreaming = useCallback(async () => {
    await leaveRoom();
    setIsStreaming(false);
    setIsPaused(false);
    notifiedPeersRef.current.clear();
    onStreamStop?.();
    toast({
      title: streamType === "live" ? "Live terminé" : "Concert terminé",
      description: "Le direct est maintenant arrêté",
    });
  }, [leaveRoom, onStreamStop, toast, streamType]);

  const pauseStreaming = useCallback(() => {
    toggleVideo(false);
    toggleAudio(false);
    setIsPaused(true);
    setIsCameraOn(false);
    setIsMicOn(false);
    onStreamPause?.();
    toast({
      title: streamType === "live" ? t("livePaused") : t("concertPaused"),
      description: t("viewersSeeingPause"),
    });
  }, [toggleVideo, toggleAudio, onStreamPause, toast, streamType]);

  const resumeStreaming = useCallback(() => {
    toggleVideo(true);
    toggleAudio(true);
    setIsPaused(false);
    setIsCameraOn(true);
    setIsMicOn(true);
    onStreamResume?.();
    toast({
      title: streamType === "live" ? "Live repris" : "Concert repris",
      description: "Le direct a repris!",
    });
  }, [toggleVideo, toggleAudio, onStreamResume, toast, streamType]);

  const handleToggleCamera = useCallback(() => {
    const newState = !isCameraOn;
    toggleVideo(newState);
    setIsCameraOn(newState);
  }, [isCameraOn, toggleVideo]);

  const handleToggleMic = useCallback(() => {
    const newState = !isMicOn;
    toggleAudio(newState);
    setIsMicOn(newState);
  }, [isMicOn, toggleAudio]);

  const handleSwitchCamera = useCallback(async () => {
    const newStream = await switchCamera(facingMode);
    if (newStream) {
      setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      onStreamReady?.(newStream);
    }
  }, [facingMode, switchCamera, onStreamReady]);

  // Expose controls to parent for mobile controls
  useEffect(() => {
    onControlsReady?.({
      isStreaming,
      isPaused,
      isCameraOn,
      isMicOn,
      startStreaming,
      stopStreaming,
      pauseStreaming,
      resumeStreaming,
      handleToggleCamera,
      handleToggleMic,
      handleSwitchCamera,
    });
  }, [isStreaming, isPaused, isCameraOn, isMicOn, onControlsReady, startStreaming, stopStreaming, pauseStreaming, resumeStreaming, handleToggleCamera, handleToggleMic, handleSwitchCamera]);

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ filter: getFilterCss(filterId) }}
      />

      {isPaused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <Pause className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <p className="text-white text-xl font-bold">{streamType === "live" ? t("livePaused") : t("concertPaused")}</p>
            <p className="text-white/70">{t("viewersSeeingPause")}</p>
          </div>
        </div>
      )}

      {/* Camera off overlay — show avatar instead of black screen */}
      {isStreaming && !isPaused && !isCameraOn && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted/80">
          <div className="text-center">
            <Avatar className="w-24 h-24 mx-auto mb-3 border-2 border-border">
              <AvatarImage src={avatarUrl || ""} />
              <AvatarFallback className="text-2xl">{hostName?.charAt(0) || "?"}</AvatarFallback>
            </Avatar>
            {hostName && <p className="text-foreground text-sm font-medium">{hostName}</p>}
            <p className="text-muted-foreground text-xs mt-1">
              <VideoOff className="w-3 h-3 inline mr-1" />Caméra désactivée
            </p>
          </div>
        </div>
      )}

      {!isStreaming && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/30 to-accent/30 z-40">
          <div className="text-center px-4">
            <Radio className="w-16 h-16 text-white/50 mx-auto mb-4" />
            <p className="text-white text-xl font-bold">{t("readyToStart")}</p>
            <p className="text-white/70 mb-4">{t("clickToStartStream")}</p>
            <Button onClick={startStreaming} disabled={isStarting} size="lg" className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-lg px-8 py-3 disabled:opacity-60">
              {isStarting ? <Radio className="w-5 h-5 mr-2 animate-pulse" /> : <Video className="w-5 h-5 mr-2" />}
              {isStarting
                ? (streamType === "live" ? (t("startingLive") || "Démarrage…") : (t("startingConcert") || "Démarrage…"))
                : (streamType === "live" ? t("startTheLive") : t("startTheConcert"))}
            </Button>
          </div>
        </div>
      )}

      {/* Video filters picker (TikTok-style beauty) — desktop: floating top-left; mobile: portaled into overlay slot below description */}
      {isStreaming && isCameraOn && !isPaused && !hideOverlays && !isMobile && (
        <div className="absolute top-16 left-3 z-50 pointer-events-auto">
          <VideoFiltersPicker filterId={filterId} onChange={setFilterId} compact />
        </div>
      )}
      {isStreaming && isCameraOn && !isPaused && !hideOverlays && isMobile && filterSlot && createPortal(
        <VideoFiltersPicker filterId={filterId} onChange={setFilterId} compact />,
        filterSlot
      )}

      {/* All overlay badges (LIVE, viewers, connection) are handled by LiveStream.tsx / MobileStreamOverlay — removed here to avoid duplication */}

      {isPaused && !hideOverlays && (
        <div className="absolute top-4 left-4">
          <Badge className="bg-yellow-500 text-black flex items-center gap-1">
            <Pause className="w-3 h-3" />
            {t("pausedLabel")}
          </Badge>
        </div>
      )}

      {/* Bottom controls - hidden on mobile when hideMobileControls is true (except start button) */}
      <div className={`absolute bottom-4 left-4 right-4 flex items-center justify-center gap-2 flex-wrap z-40 ${(hideMobileControls && isStreaming) || !isStreaming ? 'hidden' : ''}`}>
        {!isStreaming ? null : (
          <>
            {isPaused ? (
              <Button onClick={resumeStreaming} className="bg-green-500 hover:bg-green-600">
                <Play className="w-4 h-4 mr-2" />
                Reprendre
              </Button>
            ) : (
              <Button 
                onClick={pauseStreaming} 
                variant="outline"
                className="border-yellow-500 text-yellow-500 hover:bg-yellow-500/10"
              >
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </Button>
            )}
            
            <Button onClick={stopStreaming} variant="destructive">
              <VideoOff className="w-4 h-4 mr-2" />
              Arrêter
            </Button>
            
            {!isPaused && (
              <>
                <Button 
                  onClick={handleSwitchCamera}
                  variant="secondary"
                  size="icon"
                  title={t("switchCamera")}
                >
                  <SwitchCamera className="w-4 h-4" />
                </Button>
                <Button 
                  onClick={handleToggleCamera} 
                  variant={isCameraOn ? "secondary" : "outline"}
                  size="icon"
                >
                  {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </Button>
                <Button 
                  onClick={handleToggleMic} 
                  variant={isMicOn ? "secondary" : "outline"}
                  size="icon"
                >
                  {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </Button>
              </>
            )}
          </>
        )}
      </div>

    </div>
  );
};
