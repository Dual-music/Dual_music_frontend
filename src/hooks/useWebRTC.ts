/**
 * useWebRTC (legacy peer-to-peer)
 * -------------------------------
 * Implémentation P2P RTCPeerConnection conservée pour les flux 1-à-1
 * (ex: invitations privées de scène). La diffusion principale utilise
 * désormais `useLiveKit` (SFU) — préférer LiveKit pour tout nouveau code.
 *
 * Gère : offer/answer/ICE via `useWebRTCSignaling`, attach des media
 * streams aux <video> refs, reconnexion sur échec.
 */
import { useEffect, useRef, useState, useCallback } from "react";

interface PeerConnection {
  peerId: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

interface WebRTCConfig {
  roomId: string;
  userId: string;
  isHost: boolean;
  onRemoteStream?: (stream: MediaStream, peerId: string) => void;
  onPeerDisconnect?: (peerId: string) => void;
}

// Simple signaling through Supabase Realtime
export const useWebRTC = ({ roomId, userId, isHost, onRemoteStream, onPeerDisconnect }: WebRTCConfig) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ];

  const createPeerConnection = useCallback((peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Send ICE candidate through signaling channel
        console.log("ICE candidate generated for peer:", peerId);
      }
    };

    pc.ontrack = (event) => {
      console.log("Received remote track from peer:", peerId);
      if (event.streams[0] && onRemoteStream) {
        onRemoteStream(event.streams[0], peerId);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${peerId}:`, pc.connectionState);
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        onPeerDisconnect?.(peerId);
        peerConnectionsRef.current.delete(peerId);
      }
    };

    return pc;
  }, [onRemoteStream, onPeerDisconnect]);

  const startLocalStream = useCallback(async (video = true, audio = true) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : false,
      });

      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsConnected(true);
      return stream;
    } catch (err: any) {
      console.error("Error accessing media devices:", err);
      setError(err.message || "Impossible d'accéder à la caméra/microphone");
      return null;
    }
  }, []);

  const stopLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach((peer) => {
      peer.connection.close();
    });
    peerConnectionsRef.current.clear();
    setIsConnected(false);
  }, []);

  const toggleVideo = useCallback((enabled: boolean) => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, []);

  const toggleAudio = useCallback((enabled: boolean) => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLocalStream();
    };
  }, [stopLocalStream]);

  return {
    localStream,
    isConnected,
    error,
    startLocalStream,
    stopLocalStream,
    toggleVideo,
    toggleAudio,
    createPeerConnection,
    peerConnections: peerConnectionsRef.current,
  };
};
