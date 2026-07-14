/**
 * Viewer WebRTC concert : abonnement LiveKit, gestion qualité adaptative, fallback HLS.
 */
import { useEffect, useRef, useState } from "react";
import { useLiveKit } from "@/hooks/useLiveKit";
import { Radio, Wifi, WifiOff, VideoOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";

interface WebRTCViewerProps {
  roomId: string;
  viewerId: string;
  concertTitle: string;
  artistName: string;
  artistAvatarUrl?: string | null;
  onError?: (error: string) => void;
}

export const WebRTCViewer = ({
  roomId,
  viewerId,
  concertTitle,
  artistName,
  artistAvatarUrl,
  onError,
}: WebRTCViewerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { t } = useLanguage();
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  // Track if remote video is actually active — driven by track events, not per-render inspection.
  // This avoids the false "camera off" flash on initial subscription when track.muted is briefly true.
  const [remoteVideoActive, setRemoteVideoActive] = useState(false);
  const hasJoinedRef = useRef(false);

  const {
    remoteStreams,
    isConnected,
    connectionState,
    peerCount,
    joinRoom,
    leaveRoom,
  } = useLiveKit({
    roomName: roomId,
    userId: viewerId,
    isHost: false,
    onRemoteStream: (stream, peerId) => {
      console.log("Received remote stream from host:", peerId);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setHasRemoteStream(true);
        setIsConnecting(false);
      }
    },
    onPeerLeave: (peerId) => {
      console.log("Host disconnected:", peerId);
      setHasRemoteStream(false);
      setRemoteVideoActive(false);
    },
    onError: (error) => {
      console.error("LiveKit error:", error);
      onError?.(error);
      setIsConnecting(false);
    },
  });

  // Auto-join room on mount - only once
  useEffect(() => {
    if (!hasJoinedRef.current) {
      hasJoinedRef.current = true;
      joinRoom();
    }
    
    return () => {
      hasJoinedRef.current = false;
      leaveRoom();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When connected, stop showing spinner (show "waiting for host" if no stream)
  useEffect(() => {
    if (connectionState === 'connected') {
      setIsConnecting(false);
    }
  }, [connectionState]);

  // Update video element when remote streams change
  useEffect(() => {
    const streams = Array.from(remoteStreams.values());
    if (streams.length > 0 && videoRef.current) {
      videoRef.current.srcObject = streams[0];
      setHasRemoteStream(true);
      setIsConnecting(false);
    }
  }, [remoteStreams]);

  // Track remote video active state via track events
  useEffect(() => {
    const remoteStream = Array.from(remoteStreams.values())[0];
    if (!remoteStream) {
      setRemoteVideoActive(false);
      return;
    }

    const evaluate = () => {
      const videoTracks = remoteStream.getVideoTracks();
      // Show video when there is at least one live, enabled video track,
      // even if track.muted is briefly true (common right after subscription).
      const hasAnyLive = videoTracks.some((t) => t.readyState === "live" && t.enabled);
      const hasUsableVideo = videoTracks.some(
        (t) => t.readyState === "live" && t.enabled && !t.muted
      );
      setRemoteVideoActive(hasUsableVideo || hasAnyLive);
    };

    evaluate();

    const handlers: Array<() => void> = [];
    remoteStream.getVideoTracks().forEach((track) => {
      const onMute = () => setTimeout(evaluate, 800);
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
  }, [remoteStreams]);

  const getConnectionStatus = () => {
    switch (connectionState) {
      case 'connected': return 'Connecté';
      case 'connecting': return 'Connexion...';
      case 'checking': return 'Vérification...';
      case 'reconnecting': return 'Reconnexion...';
      case 'disconnected': return 'Déconnecté';
      case 'failed': return 'Échec de connexion';
      default: return 'En attente';
    }
  };

  const isFailed = connectionState === 'failed';

  const handleRetry = () => {
    hasJoinedRef.current = false;
    setIsConnecting(true);
    setHasRemoteStream(false);
    joinRoom();
  };

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />

      {/* Camera-off overlay — show artist avatar instead of black screen when host's camera is off */}
      {hasRemoteStream && !remoteVideoActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted/80">
          <div className="text-center">
            <Avatar className="w-24 h-24 mx-auto mb-3 border-2 border-border">
              <AvatarImage src={artistAvatarUrl || ""} />
              <AvatarFallback className="text-2xl">{artistName?.charAt(0) || "?"}</AvatarFallback>
            </Avatar>
            <p className="text-foreground text-sm font-medium">{artistName}</p>
            <p className="text-muted-foreground text-xs mt-1">
              <VideoOff className="w-3 h-3 inline mr-1" />Caméra désactivée
            </p>
          </div>
        </div>
      )}

      {!hasRemoteStream && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20">
          <div className="text-center p-8">
            {isFailed ? (
              <>
                <WifiOff className="w-12 h-12 text-destructive mx-auto mb-4" />
                <p className="text-foreground text-xl font-bold">Connexion échouée</p>
                <p className="text-muted-foreground mb-4">Impossible de se connecter au serveur de streaming</p>
                <button
                  onClick={handleRetry}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/80 transition"
                >
                  Réessayer
                </button>
              </>
            ) : isConnecting ? (
              <>
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-foreground text-xl font-bold">{concertTitle}</p>
                <p className="text-muted-foreground mb-4">{artistName}</p>
                <div className="flex items-center justify-center gap-2 text-muted-foreground/70">
                  <Radio className="w-5 h-5 animate-pulse" />
                  <p>Connexion au direct...</p>
                </div>
                <p className="text-muted-foreground/60 text-sm mt-2">{getConnectionStatus()}</p>
              </>
            ) : (
              <>
                <Avatar className="w-20 h-20 mx-auto mb-3 border-2 border-border">
                  <AvatarImage src={artistAvatarUrl || ""} />
                  <AvatarFallback className="text-xl">{artistName?.charAt(0) || "?"}</AvatarFallback>
                </Avatar>
                <p className="text-foreground text-xl font-bold">{t("waitingForLive")}</p>
                <p className="text-muted-foreground">{t("waitingForLiveHint")}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
