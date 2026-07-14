/**
 * useWebRTCSignaling
 * ------------------
 * Canal de signalisation sur le relais broadcast Socket.IO (`useRoomBroadcast`)
 * pour échanger SDP offers/answers et candidats ICE entre pairs WebRTC
 * (utilisé par `useWebRTC`).
 *
 * Convention : un channel par room (`webrtc-{roomId}`), évènement unique
 * `signal` dont le payload transporte le message typé
 * (`offer` | `answer` | `ice-candidate` | `join` | `leave`) avec ciblage par
 * peer id (`to`/`target_id`). Le relais exclut déjà l'émetteur (pas d'auto-écho).
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";

interface SignalingMessage {
  id: string;
  room_id: string;
  sender_id: string;
  target_id: string | null;
  type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave';
  payload: any;
  created_at: string;
}

interface PeerConnection {
  peerId: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

interface WebRTCSignalingConfig {
  roomId: string;
  userId: string;
  isHost: boolean;
  /** Provide an existing stream instead of creating one via getUserMedia */
  externalStream?: MediaStream | null;
  onRemoteStream?: (stream: MediaStream, peerId: string) => void;
  onPeerJoin?: (peerId: string) => void;
  onPeerLeave?: (peerId: string) => void;
  onError?: (error: string) => void;
}

// TURN/STUN server configuration for reliable NAT traversal
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export const useWebRTCSignaling = ({
  roomId,
  userId,
  isHost,
  externalStream,
  onRemoteStream,
  onPeerJoin,
  onPeerLeave,
  onError,
}: WebRTCSignalingConfig) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("new");
  const [peerCount, setPeerCount] = useState(0);
  
  const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const isJoinedRef = useRef(false);
  // Perfect negotiation: track ongoing offer creation per peer
  const makingOfferRef = useRef<Set<string>>(new Set());

  // Handle incoming signaling messages (assigned in a useEffect below).
  const handleSignalingMessageRef = useRef<(msg: SignalingMessage) => void>(() => {});

  // Signaling transport: Socket.IO broadcast relay (replaces Supabase Realtime).
  // One channel per room; the relay excludes the sender, so there is no self-echo.
  const signalingChannel = roomId ? `webrtc-${roomId}` : null;
  const { broadcast } = useRoomBroadcast(signalingChannel, (event, payload) => {
    if (event !== "signal") return;
    // The relay excludes the sender; peer targeting is enforced in the handler.
    handleSignalingMessageRef.current(payload as SignalingMessage);
  });
  const broadcastRef = useRef(broadcast);
  useEffect(() => { broadcastRef.current = broadcast; }, [broadcast]);
  
  // Store callbacks in refs to avoid dependency loops
  const onRemoteStreamRef = useRef(onRemoteStream);
  const onPeerJoinRef = useRef(onPeerJoin);
  const onPeerLeaveRef = useRef(onPeerLeave);
  const onErrorRef = useRef(onError);
  
  useEffect(() => { onRemoteStreamRef.current = onRemoteStream; }, [onRemoteStream]);
  useEffect(() => { onPeerJoinRef.current = onPeerJoin; }, [onPeerJoin]);
  useEffect(() => { onPeerLeaveRef.current = onPeerLeave; }, [onPeerLeave]);

  // Sync external stream to all peer connections
  // Handles both initial track addition AND hot-swapping
  useEffect(() => {
    if (!isHost || !externalStream) return;

    localStreamRef.current = externalStream;
    setLocalStream(externalStream);

    const desiredAudio = externalStream.getAudioTracks().find(t => t.readyState === "live") ?? null;
    const desiredVideo = externalStream.getVideoTracks().find(t => t.readyState === "live") ?? null;

    console.log("[ExternalStream Sync] audio:", desiredAudio?.id?.slice(0, 8), "enabled:", desiredAudio?.enabled, 
                "| video:", desiredVideo?.id?.slice(0, 8), "enabled:", desiredVideo?.enabled);

    peerConnectionsRef.current.forEach((peer) => {
      const pc = peer.connection;
      if (pc.signalingState === 'closed') return;

      (["audio", "video"] as const).forEach((kind) => {
        const desiredTrack = kind === "audio" ? desiredAudio : desiredVideo;
        if (!desiredTrack) return; // Don't clear tracks - just skip if no desired track

        // Find existing sender for this kind
        const senders = pc.getSenders();
        const existingSender = senders.find(s => {
          if (s.track) return s.track.kind === kind;
          // Check transceiver to find senders that had their track set to null
          const transceiver = pc.getTransceivers().find(t => t.sender === s);
          return transceiver?.receiver?.track?.kind === kind;
        });

        if (existingSender) {
          // replaceTrack: never triggers renegotiation
          const currentTrack = existingSender.track;
          if (currentTrack?.id === desiredTrack.id && currentTrack?.enabled === desiredTrack.enabled) {
            return; // Same track, same state - skip
          }
          existingSender.replaceTrack(desiredTrack).then(() => {
            console.log(`[ExternalStream Sync] ${kind} track replaced on peer ${peer.peerId}`);
          }).catch(err => {
            console.error(`[ExternalStream Sync] replaceTrack error for ${kind}:`, err);
          });
        } else {
          // No sender exists for this kind - use addTrack (triggers onnegotiationneeded)
          console.log(`[ExternalStream Sync] Adding NEW ${kind} track to peer ${peer.peerId}`);
          try {
            pc.addTrack(desiredTrack, externalStream);
          } catch (err) {
            console.error(`[ExternalStream Sync] addTrack error for ${kind}:`, err);
          }
        }
      });
    });
  }, [externalStream, isHost]);

  // Sync internally-captured localStream to all existing peers (triggers renegotiation)
  useEffect(() => {
    if (!isHost || !localStream || externalStream) return;
    
    console.log("[InternalStream Sync] Pushing localStream to all peers");
    peerConnectionsRef.current.forEach((peer) => {
      const pc = peer.connection;
      if (pc.signalingState === 'closed') return;

      localStream.getTracks().forEach(track => {
        if (track.readyState !== 'live') return;
        const existingSender = pc.getSenders().find(s => s.track?.kind === track.kind);
        if (existingSender) {
          if (existingSender.track?.id !== track.id) {
            existingSender.replaceTrack(track).catch(err => 
              console.error('[InternalStream Sync] replaceTrack error:', err)
            );
          }
        } else {
          try {
            pc.addTrack(track, localStream);
            console.log(`[InternalStream Sync] Added ${track.kind} track to peer ${peer.peerId}`);
          } catch(e) {
            console.error('[InternalStream Sync] addTrack error:', e);
          }
        }
      });
    });
  }, [localStream, isHost, externalStream]);

  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Send signaling message via the Socket.IO broadcast relay - stable ref.
  // Carries the same fields the former `webrtc_signaling` row held
  // (room_id/sender_id/target_id/type/payload) plus `to`/`from` peer-targeting
  // aliases; the relay forwards it to `webrtc-{roomId}`, excluding the sender.
  const sendSignalingMessageRef = useRef(async (message: {
    type: SignalingMessage['type'];
    target_id?: string | null;
    payload: any;
  }) => {
    try {
      broadcastRef.current("signal", {
        room_id: roomId,
        sender_id: userId,
        target_id: message.target_id || null,
        type: message.type,
        payload: message.payload,
        // peer-targeting aliases
        from: userId,
        to: message.target_id || null,
      });
    } catch (err) {
      console.error("Error sending signaling message:", err);
    }
  });

  // Update sendSignalingMessage ref when roomId/userId change
  useEffect(() => {
    sendSignalingMessageRef.current = async (message) => {
      try {
        broadcastRef.current("signal", {
          room_id: roomId,
          sender_id: userId,
          target_id: message.target_id || null,
          type: message.type,
          payload: message.payload,
          from: userId,
          to: message.target_id || null,
        });
      } catch (err) {
        console.error("Error sending signaling message:", err);
      }
    };
  }, [roomId, userId]);

  // Handle peer disconnect - stable via ref
  const handlePeerDisconnect = useCallback((peerId: string) => {
    const peer = peerConnectionsRef.current.get(peerId);
    if (peer) {
      peer.connection.close();
      peerConnectionsRef.current.delete(peerId);
    }
    makingOfferRef.current.delete(peerId);
    
    setRemoteStreams(prev => {
      const updated = new Map(prev);
      updated.delete(peerId);
      return updated;
    });
    
    setPeerCount(prev => Math.max(0, prev - 1));
    onPeerLeaveRef.current?.(peerId);
  }, []);

  // Create RTCPeerConnection with perfect negotiation pattern
  const createPeerConnection = useCallback((peerId: string): RTCPeerConnection => {
    const config: RTCConfiguration = {
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    };

    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await sendSignalingMessageRef.current({
          type: 'ice-candidate',
          target_id: peerId,
          payload: { candidate: event.candidate.toJSON() },
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${peerId}:`, pc.iceConnectionState);
      setConnectionState(pc.iceConnectionState);
      
      if (pc.iceConnectionState === 'connected') {
        setIsConnected(true);
      } else if (pc.iceConnectionState === 'disconnected') {
        console.log(`Attempting ICE restart for ${peerId}...`);
        setTimeout(async () => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            try {
              if (isHost && pc.signalingState !== 'closed') {
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                await sendSignalingMessageRef.current({
                  type: 'offer',
                  target_id: peerId,
                  payload: { sdp: pc.localDescription },
                });
                console.log(`ICE restart offer sent to ${peerId}`);
              }
            } catch (err) {
              console.error("ICE restart failed:", err);
            }
          }
        }, 2000);

        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            console.log(`Peer ${peerId} definitively disconnected after retry`);
            handlePeerDisconnect(peerId);
            
            if (!isHost) {
              console.log("Viewer auto-reconnecting...");
              sendSignalingMessageRef.current({
                type: 'join',
                payload: { isHost: false },
              });
            }
          }
        }, 10000);
      } else if (pc.iceConnectionState === 'failed') {
        console.log(`Connection failed with ${peerId}, attempting reconnect...`);
        handlePeerDisconnect(peerId);
        
        setTimeout(() => {
          sendSignalingMessageRef.current({
            type: 'join',
            payload: { isHost },
          });
        }, 1000);
      }
    };

    pc.ontrack = (event) => {
      console.log(`[ontrack] Received ${event.track.kind} track from ${peerId}, readyState: ${event.track.readyState}`);
      
      // Use the first stream or create one from the track
      let remoteStream: MediaStream;
      if (event.streams && event.streams[0]) {
        remoteStream = event.streams[0];
      } else {
        // Fallback: create a stream if none provided
        remoteStream = new MediaStream([event.track]);
      }

      setRemoteStreams(prev => {
        const updated = new Map(prev);
        const existing = updated.get(peerId);
        if (existing) {
          // Add track to existing stream if not already there
          const hasTrack = existing.getTracks().some(t => t.id === event.track.id);
          if (!hasTrack) {
            existing.addTrack(event.track);
            console.log(`[ontrack] Added ${event.track.kind} to existing stream for ${peerId}`);
          }
          // Re-set to trigger React state update
          updated.set(peerId, existing);
        } else {
          updated.set(peerId, remoteStream);
        }
        return updated;
      });
      onRemoteStreamRef.current?.(remoteStream, peerId);

      // Listen for track ending/muting to update UI
      event.track.onended = () => {
        console.log(`[ontrack] Track ${event.track.kind} ended from ${peerId}`);
        // Force re-render of remote streams
        setRemoteStreams(prev => new Map(prev));
      };
      event.track.onmute = () => {
        console.log(`[ontrack] Track ${event.track.kind} muted from ${peerId}`);
        setRemoteStreams(prev => new Map(prev));
      };
      event.track.onunmute = () => {
        console.log(`[ontrack] Track ${event.track.kind} unmuted from ${peerId}`);
        setRemoteStreams(prev => new Map(prev));
      };
    };

    // Perfect negotiation: onnegotiationneeded with makingOffer guard
    pc.onnegotiationneeded = async () => {
      if (!isHost) return; // Only the host (polite peer) initiates offers
      
      try {
        makingOfferRef.current.add(peerId);
        console.log(`[negotiation] Creating offer for ${peerId}`);
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        
        // Check signaling state hasn't changed during async operation
        if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
          console.log(`[negotiation] Signaling state changed to ${pc.signalingState}, aborting`);
          return;
        }
        
        await pc.setLocalDescription(offer);
        
        await sendSignalingMessageRef.current({
          type: 'offer',
          target_id: peerId,
          payload: { sdp: pc.localDescription },
        });
        console.log(`[negotiation] Offer sent to ${peerId}`);
      } catch (err) {
        console.error("[negotiation] Error creating offer:", err);
        onErrorRef.current?.("Erreur lors de la création de l'offre");
      } finally {
        makingOfferRef.current.delete(peerId);
      }
    };

    return pc;
  }, [isHost, handlePeerDisconnect]);

  // Handle incoming signaling messages (ref declared above, near the transport).
  useEffect(() => {
    handleSignalingMessageRef.current = async (message: SignalingMessage) => {
      if (message.sender_id === userId) return;
      if (message.target_id && message.target_id !== userId) return;

      console.log(`Received signaling message: ${message.type} from ${message.sender_id}`);

      switch (message.type) {
        case 'join': {
          if (peerConnectionsRef.current.has(message.sender_id)) {
            console.log(`Peer ${message.sender_id} already connected, ignoring join`);
            return;
          }
          
          onPeerJoinRef.current?.(message.sender_id);
          setPeerCount(prev => prev + 1);
          
          if (isHost) {
            const pc = createPeerConnection(message.sender_id);
            const stream = localStreamRef.current;
            
            if (stream && stream.getTracks().length > 0) {
              // Add all live tracks
              stream.getTracks().forEach(track => {
                if (track.readyState === 'live') {
                  console.log(`[join] Adding ${track.kind} track to new peer ${message.sender_id}`);
                  pc.addTrack(track, stream);
                }
              });
              
              // Ensure both audio and video transceivers exist
              const transceivers = pc.getTransceivers();
              const hasAudio = transceivers.some(t => t.receiver.track?.kind === 'audio' || t.sender.track?.kind === 'audio');
              const hasVideo = transceivers.some(t => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video');
              if (!hasAudio) pc.addTransceiver('audio', { direction: 'sendrecv' });
              if (!hasVideo) pc.addTransceiver('video', { direction: 'sendrecv' });
            } else {
              // No stream yet — add transceiver placeholders
              pc.addTransceiver('video', { direction: 'sendrecv' });
              pc.addTransceiver('audio', { direction: 'sendrecv' });
            }
            
            peerConnectionsRef.current.set(message.sender_id, {
              peerId: message.sender_id,
              connection: pc,
            });
          }
          break;
        }

        case 'leave': {
          handlePeerDisconnect(message.sender_id);
          break;
        }

        case 'offer': {
          const peerEntry = peerConnectionsRef.current.get(message.sender_id);
          let pc = peerEntry?.connection;
          
          if (!pc) {
            pc = createPeerConnection(message.sender_id);
            peerConnectionsRef.current.set(message.sender_id, {
              peerId: message.sender_id,
              connection: pc,
            });
          }

          try {
            // Perfect negotiation: handle offer collision
            const offerCollision = makingOfferRef.current.has(message.sender_id) || 
                                   pc.signalingState !== 'stable';
            
            // If we're the host (polite), we rollback on collision
            // If we're the viewer (impolite), we ignore the colliding offer
            if (offerCollision) {
              if (!isHost) {
                console.log(`[offer] Ignoring colliding offer from ${message.sender_id} (we're impolite)`);
                return;
              }
              // Polite peer: rollback and accept incoming offer
              console.log(`[offer] Rolling back local description for ${message.sender_id}`);
              await pc.setLocalDescription({ type: 'rollback' });
            }

            await pc.setRemoteDescription(new RTCSessionDescription(message.payload.sdp));
            
            // If viewer has a local stream, add tracks before creating answer
            if (!isHost && localStreamRef.current) {
              localStreamRef.current.getTracks().forEach(track => {
                const senders = pc!.getSenders();
                const hasSender = senders.some(s => s.track?.id === track.id);
                if (!hasSender) {
                  pc!.addTrack(track, localStreamRef.current!);
                }
              });
            }
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            await sendSignalingMessageRef.current({
              type: 'answer',
              target_id: message.sender_id,
              payload: { sdp: pc.localDescription },
            });
          } catch (err) {
            console.error("Error handling offer:", err);
            onErrorRef.current?.("Erreur lors de la réception de l'offre");
          }
          break;
        }

        case 'answer': {
          const pc = peerConnectionsRef.current.get(message.sender_id)?.connection;
          if (pc) {
            try {
              if (pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(message.payload.sdp));
              } else {
                console.warn(`[answer] Unexpected signaling state: ${pc.signalingState}, ignoring answer`);
              }
            } catch (err) {
              console.error("Error handling answer:", err);
            }
          }
          break;
        }

        case 'ice-candidate': {
          const pc = peerConnectionsRef.current.get(message.sender_id)?.connection;
          if (pc && message.payload.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(message.payload.candidate));
            } catch (err) {
              // Ignore ICE candidate errors during renegotiation
              if (pc.remoteDescription) {
                console.error("Error adding ICE candidate:", err);
              }
            }
          }
          break;
        }
      }
    };
  }, [userId, isHost, createPeerConnection, handlePeerDisconnect]);

  // Start local stream (for host)
  const startLocalStream = useCallback(async (video = true, audio = true): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user',
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        } : false,
      });

      setLocalStream(stream);
      localStreamRef.current = stream;
      return stream;
    } catch (err: any) {
      console.error("Error accessing media devices:", err);
      onErrorRef.current?.(err.message || "Impossible d'accéder à la caméra/microphone");
      return null;
    }
  }, []);

  // Join room - STABLE (idempotent: re-sends join if already connected)
  const joinRoom = useCallback(async () => {
    if (isJoinedRef.current) {
      // Already joined — just re-send join signal so host picks us up
      await sendSignalingMessageRef.current({
        type: 'join',
        payload: { isHost },
      });
      return;
    }
    isJoinedRef.current = true;

    // The broadcast channel is already subscribed by `useRoomBroadcast` (on mount).
    // Joining just announces our presence so the host picks us up. There is no
    // message history on the relay, so instead of querying past joins we rely on
    // the viewer re-announcing (below + component-level retries) until the host
    // has subscribed and can process a live `join`.
    console.log(`Joined WebRTC room: ${roomId}`);

    await sendSignalingMessageRef.current({
      type: 'join',
      payload: { isHost },
    });

    setIsConnected(true);

    if (!isHost) {
      setTimeout(async () => {
        await sendSignalingMessageRef.current({
          type: 'join',
          payload: { isHost: false },
        });
      }, 2000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost]);

  // Leave room - STABLE
  const leaveRoom = useCallback(async () => {
    if (!isJoinedRef.current) return;
    isJoinedRef.current = false;

    await sendSignalingMessageRef.current({
      type: 'leave',
      payload: {},
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    peerConnectionsRef.current.forEach(peer => {
      peer.connection.close();
    });
    peerConnectionsRef.current.clear();
    makingOfferRef.current.clear();

    // The broadcast channel unsubscribes automatically via `useRoomBroadcast`
    // cleanup when the hook unmounts.

    setRemoteStreams(new Map());
    setIsConnected(false);
    setPeerCount(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Toggle video
  const toggleVideo = useCallback((enabled: boolean) => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, []);

  // Toggle audio
  const toggleAudio = useCallback((enabled: boolean) => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, []);

  // Switch camera (front/rear)
  const switchCamera = useCallback(async (currentFacingMode: 'user' | 'environment'): Promise<MediaStream | null> => {
    const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    try {
      // Get current audio state
      const currentAudioEnabled = localStreamRef.current?.getAudioTracks()[0]?.enabled ?? true;
      
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: { ideal: newFacingMode },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      });

      // Preserve audio enabled state
      newStream.getAudioTracks().forEach(t => { t.enabled = currentAudioEnabled; });

      // Stop old video tracks
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => t.stop());
      }

      // Replace tracks in all peer connections
      const newVideoTrack = newStream.getVideoTracks()[0];
      const newAudioTrack = newStream.getAudioTracks()[0];
      
      peerConnectionsRef.current.forEach((peer) => {
        const pc = peer.connection;
        if (pc.signalingState === 'closed') return;
        
        pc.getSenders().forEach(sender => {
          if (sender.track?.kind === 'video' && newVideoTrack) {
            sender.replaceTrack(newVideoTrack).catch(err => 
              console.error('[SwitchCamera] replaceTrack video error:', err)
            );
          } else if (sender.track?.kind === 'audio' && newAudioTrack) {
            sender.replaceTrack(newAudioTrack).catch(err => 
              console.error('[SwitchCamera] replaceTrack audio error:', err)
            );
          }
        });
      });

      // Stop old audio tracks after replacement
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => t.stop());
      }

      setLocalStream(newStream);
      localStreamRef.current = newStream;
      return newStream;
    } catch (err: any) {
      console.error("[SwitchCamera] Error:", err);
      // Fallback without exact constraint
      try {
        const currentAudioEnabled = localStreamRef.current?.getAudioTracks()[0]?.enabled ?? true;
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: newFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        fallbackStream.getAudioTracks().forEach(t => { t.enabled = currentAudioEnabled; });
        
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach(t => t.stop());
          localStreamRef.current.getAudioTracks().forEach(t => t.stop());
        }

        const newVideoTrack = fallbackStream.getVideoTracks()[0];
        const newAudioTrack = fallbackStream.getAudioTracks()[0];
        peerConnectionsRef.current.forEach((peer) => {
          const pc = peer.connection;
          if (pc.signalingState === 'closed') return;
          pc.getSenders().forEach(sender => {
            if (sender.track?.kind === 'video' && newVideoTrack) {
              sender.replaceTrack(newVideoTrack).catch(() => {});
            } else if (sender.track?.kind === 'audio' && newAudioTrack) {
              sender.replaceTrack(newAudioTrack).catch(() => {});
            }
          });
        });

        setLocalStream(fallbackStream);
        localStreamRef.current = fallbackStream;
        return fallbackStream;
      } catch (fallbackErr: any) {
        onErrorRef.current?.(fallbackErr.message || "Impossible de basculer la caméra");
        return null;
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveRoom();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    localStream,
    remoteStreams,
    isConnected,
    connectionState,
    peerCount,
    startLocalStream,
    joinRoom,
    leaveRoom,
    toggleVideo,
    toggleAudio,
    switchCamera,
  };
};
