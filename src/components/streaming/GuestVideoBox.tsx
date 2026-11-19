/**
 * Tuile vidéo d'un invité multi-cam : nom, indicateurs micro/caméra, agrandir/réduire.
 *
 * Composant d'AFFICHAGE uniquement : la connexion LiveKit à la room de l'invité est portée par
 * la page `LiveStream` (room unique `live-<id>`, via WebRTCHost/WebRTCViewer) qui joue aussi l'audio. Monter,
 * démonter ou dupliquer cette tuile (focus, grille saturée, panneau « +N », vignettes masquées)
 * n'a donc plus AUCUN effet sur ce que les autres entendent — avant, chaque tuile ouvrait sa
 * propre connexion et sa disparition rendait l'invité inaudible.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";
import { useAudioActivity } from "@/hooks/useAudioActivity";
import { Maximize, Minimize, Video, VideoOff, Mic, MicOff, Timer } from "lucide-react";

interface GuestVideoBoxProps {
  guestUserId: string;
  guestName: string;
  guestAvatarUrl?: string;
  liveId: string;
  currentUserId: string | null;
  /** Flux DISTANT de cet invité (room unique, par userId). Ignoré pour ma propre tuile. */
  stream?: MediaStream | null;
  /** Mon flux LOCAL (aperçu) quand la tuile est la mienne. */
  localStream?: MediaStream | null;
  isExpanded?: boolean;
  isMainView?: boolean;
  onToggleExpand?: () => void;
  timerRemaining?: number;
  timerTotal?: number;
  forceMicOff?: boolean;
  /** État de la connexion à la room de l'invité (affiché en placeholder si pas encore connecté). */
  connectionState?: string;
}

export const GuestVideoBox = ({
  guestUserId,
  guestName,
  guestAvatarUrl,
  liveId,
  currentUserId,
  stream,
  localStream,
  isExpanded,
  isMainView,
  onToggleExpand,
  timerRemaining: externalTimerRemaining,
  timerTotal: externalTimerTotal,
  forceMicOff = false,
  connectionState,
}: GuestVideoBoxProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [hasAudioTrack, setHasAudioTrack] = useState(false);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);
  const speakingTimeRemaining = externalTimerRemaining || 0;
  const speakingTimeTotal = externalTimerTotal || 0;
  void speakingTimeTotal;
  const isMe = currentUserId === guestUserId;
  const attachedStream: MediaStream | null = (isMe ? localStream : stream) ?? null;

  // L'état diffusé par l'invité lui-même (Socket.IO) prime sur l'inspection des pistes, qui
  // peut être trompeuse (piste « muted » quelques instants après la souscription).
  const broadcastStateRef = useRef<{ isMicOn: boolean; isCamOn: boolean } | null>(null);

  const syncMediaState = useCallback((s: MediaStream | null) => {
    const bc = broadcastStateRef.current;
    if (bc && !isMe) {
      setHasVideo(bc.isCamOn);
      setHasVideoTrack(bc.isCamOn);
      setHasAudioTrack(bc.isMicOn);
      return;
    }
    if (!s) {
      setHasVideo(false);
      setHasVideoTrack(false);
      setHasAudioTrack(false);
      return;
    }
    const liveVideo = s.getVideoTracks().some((t) => t.readyState === "live" && t.enabled && !t.muted);
    const liveAudio = s.getAudioTracks().some((t) => t.readyState === "live" && t.enabled && !t.muted);
    setHasVideo(liveVideo);
    setHasVideoTrack(liveVideo);
    setHasAudioTrack(liveAudio);
  }, [isMe]);

  // Attache le flux à l'élément <video> (rattaché à chaque (re)montage : callback sur le ref).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== attachedStream) {
      el.srcObject = attachedStream;
      if (attachedStream) el.play().catch(() => { /* la vidéo est muette : l'autoplay passe presque toujours */ });
    }
    syncMediaState(attachedStream);
  }, [attachedStream, syncMediaState]);

  // Suit les changements de pistes du flux (ajout/retrait/mute).
  useEffect(() => {
    if (!attachedStream) return;
    const handle = () => syncMediaState(attachedStream);
    attachedStream.addEventListener("addtrack", handle);
    attachedStream.addEventListener("removetrack", handle);
    const tracks = attachedStream.getTracks();
    tracks.forEach((track) => {
      track.addEventListener("ended", handle);
      track.addEventListener("mute", handle);
      track.addEventListener("unmute", handle);
    });
    const interval = setInterval(handle, 2000);
    return () => {
      attachedStream.removeEventListener("addtrack", handle);
      attachedStream.removeEventListener("removetrack", handle);
      tracks.forEach((track) => {
        track.removeEventListener("ended", handle);
        track.removeEventListener("mute", handle);
        track.removeEventListener("unmute", handle);
      });
      clearInterval(interval);
    };
  }, [attachedStream, syncMediaState]);

  // État micro/caméra diffusé par l'invité (canal `live-guest-state-<id>`, émis par LiveStream).
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

  const sizeClasses = isMainView
    ? "w-full h-full"
    : isExpanded
      ? "w-36 h-36 md:w-44 md:h-44"
      : "w-full h-full";

  const borderColor = !hasVideo && !hasAudioTrack
    ? "border-muted-foreground/50"
    : hasVideoTrack && hasAudioTrack
      ? "border-green-500"
      : hasVideoTrack || hasAudioTrack
        ? "border-yellow-500"
        : "border-red-500";

  const micIsOn = forceMicOff ? false : hasAudioTrack;

  // Détection de parole — pulse quand l'invité émet réellement du son.
  const isSpeaking = useAudioActivity(attachedStream, { enabled: micIsOn && !forceMicOff });

  const truncatedName = guestName && guestName.length > 12 ? guestName.slice(0, 12) + "…" : guestName;
  const connecting = !isMe && !attachedStream?.getTracks().length && (connectionState === "connecting" || connectionState === "reconnecting");

  return (
    <div
      className={`${sizeClasses} ${isMainView ? '' : `rounded-lg ${borderColor} border-2 cursor-pointer hover:ring-2 hover:ring-primary`} overflow-hidden bg-black transition-all relative group`}
      onClick={onToggleExpand}
    >
      {isSpeaking && (
        <span
          aria-label="speaking"
          className="absolute top-1 left-1 z-30 w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_1px_rgba(34,197,94,0.7)]"
        />
      )}
      {/* `muted` TOUJOURS : l'audio distant est joué par RemoteAudioSink (une seule fois, quoi
          qu'affiche l'écran) ; mon propre flux ne doit jamais être réentendu (larsen).
          Jamais display:none : opacity-0 pour garder l'élément vivant.
          object-contain en vue principale (ne rogne pas un flux mobile portrait), cover en vignette. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full ${isMainView ? 'object-contain' : 'object-cover'} ${hasVideo ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
      />

      {!hasVideo && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/30 to-accent/30">
          <Avatar className={isMainView ? "w-16 h-16 md:w-20 md:h-20" : "w-8 h-8 md:w-10 md:h-10"}>
            <AvatarImage src={guestAvatarUrl} />
            <AvatarFallback className={isMainView ? "text-xl" : "text-xs"}>{guestName?.charAt(0)}</AvatarFallback>
          </Avatar>
          {connecting && (
            <span className="mt-1 text-[9px] text-white/70 animate-pulse">Connexion…</span>
          )}
        </div>
      )}

      {/* Nom + indicateurs */}
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

      {/* Chrono de temps de parole */}
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
 * @deprecated La publication d'un invité est gérée par WebRTCViewer (room unique).
 * Conservé pour compatibilité d'import ; ne fait rien.
 */
export const useGuestBroadcast = (_liveId: string | undefined, _userId: string | null, _stream: MediaStream | null) => {
  void _liveId; void _userId; void _stream;
};
