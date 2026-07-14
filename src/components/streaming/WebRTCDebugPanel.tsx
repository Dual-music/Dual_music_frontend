/**
 * Panneau debug WebRTC dev-only : ICE state, candidats, stats peer-to-peer.
 */
import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bug, ChevronDown, ChevronUp, Wifi, WifiOff, Video, VideoOff, Mic, MicOff, RefreshCw } from "lucide-react";
import { useLiveKit } from "@/hooks/useLiveKit";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";

interface GuestDebugInfo {
  peerId: string;
  guestUserId: string;
  guestName: string;
  iceState: string;
  signalingState: string;
  hasVideoTrack: boolean;
  hasAudioTrack: boolean;
  videoEnabled: boolean;
  audioEnabled: boolean;
  bytesReceived: { video: number; audio: number };
  lastUpdateAt: number;
  latencyMs: number;
}

interface WebRTCDebugPanelProps {
  liveId: string;
  currentUserId: string;
  acceptedGuests: Array<{ user_id: string; user_name: string }>;
}

export const WebRTCDebugPanel = ({ liveId, currentUserId, acceptedGuests }: WebRTCDebugPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState<Map<string, GuestDebugInfo>>(new Map());
  const connectionsRef = useRef<Map<string, { joinRoom: () => void; leaveRoom: () => void; remoteStreams: Map<string, MediaStream> }>>(new Map());
  const prevBytesRef = useRef<Map<string, { video: number; audio: number; ts: number }>>(new Map());

  // Poll debug info from each guest's WebRTC room
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(async () => {
      const updated = new Map<string, GuestDebugInfo>();

      for (const guest of acceptedGuests) {
        const roomId = `live-guest-${liveId}-${guest.user_id}`;
        
        // We can't directly access peer connections from other hooks,
        // so we'll poll based on Supabase channel diagnostics
        const existing = debugInfo.get(guest.user_id);
        
        // Create a diagnostic entry based on available info
        const info: GuestDebugInfo = {
          peerId: guest.user_id,
          guestUserId: guest.user_id,
          guestName: guest.user_name,
          iceState: existing?.iceState || "unknown",
          signalingState: existing?.signalingState || "unknown",
          hasVideoTrack: existing?.hasVideoTrack ?? false,
          hasAudioTrack: existing?.hasAudioTrack ?? false,
          videoEnabled: existing?.videoEnabled ?? false,
          audioEnabled: existing?.audioEnabled ?? false,
          bytesReceived: existing?.bytesReceived ?? { video: 0, audio: 0 },
          lastUpdateAt: Date.now(),
          latencyMs: existing?.latencyMs ?? 0,
        };

        updated.set(guest.user_id, info);
      }

      setDebugInfo(updated);
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, acceptedGuests, liveId, debugInfo]);

  // Listen for diagnostic broadcasts from guest diagnostic badges (Socket.IO /live).
  useRoomBroadcast(isOpen && liveId ? `debug-diag-${liveId}` : null, (event, payload) => {
    if (event !== "guest_diag") return;
    const { guestUserId, iceState, hasVideo, hasAudio, signalingState } = (payload as any) ?? {};
    setDebugInfo(prev => {
      const updated = new Map(prev);
      const existing = updated.get(guestUserId);
      if (existing) {
        const now = Date.now();
        updated.set(guestUserId, {
          ...existing,
          iceState: iceState || existing.iceState,
          signalingState: signalingState || existing.signalingState,
          hasVideoTrack: hasVideo ?? existing.hasVideoTrack,
          hasAudioTrack: hasAudio ?? existing.hasAudioTrack,
          videoEnabled: hasVideo ?? existing.videoEnabled,
          audioEnabled: hasAudio ?? existing.audioEnabled,
          lastUpdateAt: now,
          latencyMs: now - existing.lastUpdateAt,
        });
      }
      return updated;
    });
  });

  const getIceColor = (state: string) => {
    if (state === "connected" || state === "completed") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (state === "checking" || state === "new" || state === "unknown") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-red-500/20 text-red-400 border-red-500/30";
  };

  if (!isOpen) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="gap-1 text-xs border-muted-foreground/30"
      >
        <Bug className="w-3 h-3" />
        Debug WebRTC
      </Button>
    );
  }

  return (
    <Card className="border-yellow-500/30 bg-card/95 backdrop-blur">
      <CardHeader className="py-2 px-3 cursor-pointer" onClick={() => setIsOpen(false)}>
        <CardTitle className="text-xs flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Bug className="w-3.5 h-3.5 text-yellow-400" />
            Debug WebRTC — {acceptedGuests.length} invité(s)
          </span>
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        {acceptedGuests.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-2">Aucun invité connecté</p>
        ) : (
          acceptedGuests.map(guest => {
            const info = debugInfo.get(guest.user_id);
            return (
              <div key={guest.user_id} className="bg-muted/30 rounded-md p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate">{guest.user_name}</span>
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${getIceColor(info?.iceState || "unknown")}`}>
                    ICE: {info?.iceState || "?"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  {/* Tracks received */}
                  <div className="flex items-center gap-1">
                    {info?.hasVideoTrack ? (
                      <Video className="w-3 h-3 text-green-400" />
                    ) : (
                      <VideoOff className="w-3 h-3 text-red-400" />
                    )}
                    <span className="text-muted-foreground">
                      Vidéo: {info?.hasVideoTrack ? "reçue" : "aucune"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {info?.hasAudioTrack ? (
                      <Mic className="w-3 h-3 text-green-400" />
                    ) : (
                      <MicOff className="w-3 h-3 text-red-400" />
                    )}
                    <span className="text-muted-foreground">
                      Audio: {info?.hasAudioTrack ? "reçu" : "aucun"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <RefreshCw className="w-2.5 h-2.5" />
                    Latence MAJ: {info?.latencyMs ? `${info.latencyMs}ms` : "—"}
                  </span>
                  <span>
                    Signal: {info?.signalingState || "?"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
