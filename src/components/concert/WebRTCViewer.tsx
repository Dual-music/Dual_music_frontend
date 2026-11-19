/**
 * Viewer WebRTC (concert + live) : abonnement LiveKit à la room UNIQUE de l'événement.
 *
 * - Affiche la vidéo de l'HÔTE (`hostId`) ; les autres publieurs de la room (invités d'un live)
 *   sont exposés au parent via `onRemoteStreamsChange` pour les vignettes, et leur audio est joué
 *   ici par `RemoteAudioSink` (tout le monde entend tous ceux qui parlent).
 * - Un spectateur devenu INVITÉ publie ses propres pistes dans cette même room (`canPublish` +
 *   `publishStream`) : plus de room séparée par invité. Le droit de publier est accordé à chaud
 *   par le backend ; à défaut, on se reconnecte une fois avec un jeton qui l'inclut.
 */
import { useEffect, useRef, useState } from "react";
import { useLiveKit } from "@/hooks/useLiveKit";
import { Radio, Wifi, WifiOff, VideoOff, Volume2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";
import { RemoteAudioSink } from "@/components/streaming/RemoteAudioSink";

interface WebRTCViewerProps {
  roomId: string;
  viewerId: string;
  concertTitle: string;
  artistName: string;
  artistAvatarUrl?: string | null;
  /** Id (userId) de l'hôte : seul SON flux est affiché en grand. Absent → premier flux reçu. */
  hostId?: string | null;
  /** Je suis un invité accepté : je peux publier dans la room. */
  canPublish?: boolean;
  /** Mes pistes (caméra/micro) à publier quand `canPublish` ; `null` = rien / dépublier. */
  publishStream?: MediaStream | null;
  /** Tous les flux distants (hôte + invités), par userId — pour les vignettes du parent. */
  onRemoteStreamsChange?: (streams: Map<string, MediaStream>) => void;
  onError?: (error: string) => void;
}

export const WebRTCViewer = ({
  roomId,
  viewerId,
  concertTitle,
  artistName,
  artistAvatarUrl,
  hostId,
  canPublish = false,
  publishStream = null,
  onRemoteStreamsChange,
  onError,
}: WebRTCViewerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { t } = useLanguage();
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  // Track if remote video is actually active — driven by track events, not per-render inspection.
  // This avoids the false "camera off" flash on initial subscription when track.muted is briefly true.
  const [remoteVideoActive, setRemoteVideoActive] = useState(false);
  // Autoplay audio bloqué par le navigateur (aucun geste utilisateur encore) → bouton « Activer le son ».
  const [audioBlocked, setAudioBlocked] = useState(false);
  const hasJoinedRef = useRef(false);

  const hostIdRef = useRef(hostId);
  hostIdRef.current = hostId;

  const {
    remoteStreams,
    isConnected,
    connectionState,
    peerCount,
    joinRoom,
    leaveRoom,
    canPlaybackAudio,
    startAudio,
    permissionsVersion,
    hasPublishPermission,
    publishStreamTracks,
  } = useLiveKit({
    roomName: roomId,
    userId: viewerId,
    isHost: false,
    canPublish,
    onRemoteStream: (stream, peerId) => {
      // Room unique : les invités publient aussi ici — seul l'HÔTE va dans la vue principale.
      const h = hostIdRef.current;
      if (h && peerId !== h) return;
      console.log("Received remote stream from host:", peerId);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setHasRemoteStream(true);
        setIsConnecting(false);
      }
    },
    onPeerLeave: (peerId) => {
      const h = hostIdRef.current;
      if (h && peerId !== h) return;
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

  // Flux de l'hôte (par userId) — ou le premier reçu quand l'hôte n'est pas identifié (concert).
  const hostStream = hostId ? (remoteStreams.get(hostId) ?? null) : (Array.from(remoteStreams.values())[0] ?? null);

  // Remonte TOUS les flux distants au parent (vignettes des invités).
  useEffect(() => {
    onRemoteStreamsChange?.(remoteStreams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteStreams]);

  // Update video element when the host stream changes
  useEffect(() => {
    if (hostStream && videoRef.current) {
      if (videoRef.current.srcObject !== hostStream) videoRef.current.srcObject = hostStream;
      setHasRemoteStream(true);
      setIsConnecting(false);
    } else if (!hostStream) {
      setHasRemoteStream(false);
    }
  }, [hostStream]);

  // Publication (invité accepté) : attend le droit de publier accordé à chaud par le backend
  // (ParticipantPermissionsChanged) ; s'il n'arrive pas vite, se reconnecte UNE fois avec un
  // jeton qui l'inclut. `canPublish` retombé à false (retiré/descendu) → tout dépublier.
  const reconnectingForPublishRef = useRef(false);
  useEffect(() => {
    if (!canPublish) {
      void publishStreamTracks(null);
      return;
    }
    if (!isConnected) return;
    if (hasPublishPermission()) {
      void publishStreamTracks(publishStream ?? null);
      return;
    }
    if (reconnectingForPublishRef.current) return;
    const timer = setTimeout(async () => {
      if (hasPublishPermission() || reconnectingForPublishRef.current) return;
      reconnectingForPublishRef.current = true;
      try {
        await leaveRoom();
        await joinRoom();
      } finally {
        reconnectingForPublishRef.current = false;
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [canPublish, publishStream, isConnected, permissionsVersion, hasPublishPermission, publishStreamTracks, leaveRoom, joinRoom]);

  // Track remote video active state via track events
  useEffect(() => {
    const remoteStream = hostStream;
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
  }, [hostStream]);

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

  const soundBlocked = audioBlocked || !canPlaybackAudio;
  const unlockSound = () => {
    void startAudio();
    setAudioBlocked(false);
  };

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      {/* object-contain (pas cover) : évite de rogner le flux mobile portrait dans le conteneur
          16:9 desktop (tête/bas du corps invisibles côté PC) — voir WebRTCHost.tsx.
          `muted` : l'audio est joué par RemoteAudioSink ci-dessous pour TOUS les publieurs de la
          room (pas seulement le premier flux affiché), avec déblocage autoplay. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain"
      />
      <RemoteAudioSink streams={remoteStreams} onBlockedChange={setAudioBlocked} />

      {soundBlocked && hasRemoteStream && (
        <button
          type="button"
          onClick={unlockSound}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex items-center gap-2 rounded-full bg-black/80 px-5 py-3 text-white font-semibold shadow-lg ring-2 ring-primary animate-pulse"
        >
          <Volume2 className="w-5 h-5" /> Activer le son
        </button>
      )}

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
