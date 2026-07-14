/**
 * Badge diagnostic WebRTC d'un invité : RTT, packet loss, bitrate (via `useWebRTC` stats).
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Video, VideoOff, Mic, MicOff, Wifi, WifiOff, Loader2 } from "lucide-react";
import { useLiveKit } from "@/hooks/useLiveKit";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";

interface GuestDiagnosticBadgeProps {
  guestUserId: string;
  liveId: string;
  currentUserId: string;
}

type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export const GuestDiagnosticBadge = ({ guestUserId, liveId, currentUserId }: GuestDiagnosticBadgeProps) => {
  const { t } = useLanguage();
  const [hasVideo, setHasVideo] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [connState, setConnState] = useState<ConnectionState>("connecting");
  const streamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const guestRoomId = `live-guest-${liveId}-${guestUserId}`;

  // Ephemeral peer broadcast (Socket.IO /live) — replaces the debug-diag supabase channel.
  const { broadcast } = useRoomBroadcast(liveId ? `debug-diag-${liveId}` : null);

  const syncTracks = useCallback((stream: MediaStream | null) => {
    if (!stream) { setHasVideo(false); setHasAudio(false); return; }
    setHasVideo(stream.getVideoTracks().some(t => t.readyState === "live" && t.enabled && !t.muted));
    setHasAudio(stream.getAudioTracks().some(t => t.readyState === "live" && t.enabled && !t.muted));
  }, []);

  const { remoteStreams, joinRoom, leaveRoom } = useLiveKit({
    roomName: guestRoomId,
    userId: `diag-${currentUserId}`,
    isHost: false,
    onRemoteStream: (stream: MediaStream) => { streamRef.current = stream; setConnState("connected"); syncTracks(stream); },
    onPeerLeave: () => { streamRef.current = null; setConnState("disconnected"); setHasVideo(false); setHasAudio(false); },
  });

  useEffect(() => {
    joinRoom();
    setConnState("connecting");
    return () => { leaveRoom(); };
  }, [guestUserId, liveId]);

  useEffect(() => {
    pollRef.current = setInterval(() => {
      const streams = Array.from(remoteStreams.values()) as MediaStream[];
      const stream: MediaStream | null = streams[0] || streamRef.current;
      if (stream) {
        if (connState === "connecting") setConnState("connected");
        syncTracks(stream);
        broadcast("guest_diag", {
          guestUserId, iceState: connState === "connecting" ? "checking" : connState, hasVideo: stream.getVideoTracks().some(t => t.readyState === "live" && t.enabled && !t.muted), hasAudio: stream.getAudioTracks().some(t => t.readyState === "live" && t.enabled && !t.muted), signalingState: "stable",
        });
      }
    }, 500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [remoteStreams, connState, syncTracks, liveId, guestUserId, broadcast]);

  const connIcon = connState === "connected" ? (
    <Wifi className="w-3 h-3 text-green-400" />
  ) : connState === "connecting" || connState === "reconnecting" ? (
    <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
  ) : (
    <WifiOff className="w-3 h-3 text-red-400" />
  );

  const connLabel = connState === "connected" ? t("connectedStatus")
    : connState === "connecting" ? t("connectingStatus")
    : connState === "reconnecting" ? t("reconnectingStatus")
    : t("disconnectedStatus");

  const connColor = connState === "connected" ? "bg-green-500/10 border-green-500/30" 
    : connState === "connecting" || connState === "reconnecting" ? "bg-yellow-500/10 border-yellow-500/30"
    : "bg-red-500/10 border-red-500/30";

  return (
    <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${connColor}`}>
      {connIcon}
      <span className="text-[10px] text-muted-foreground hidden md:inline">{connLabel}</span>
      <div className="flex items-center gap-1 ml-1">
        {hasVideo ? <Video className="w-3 h-3 text-green-400" /> : <VideoOff className="w-3 h-3 text-muted-foreground/50" />}
        {hasAudio ? <Mic className="w-3 h-3 text-green-400" /> : <MicOff className="w-3 h-3 text-muted-foreground/50" />}
      </div>
    </div>
  );
};
