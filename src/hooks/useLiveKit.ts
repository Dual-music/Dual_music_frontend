/**
 * useLiveKit
 * ----------
 * Hook central pour toute connexion à LiveKit Cloud SFU (lives, concerts, duels).
 *
 * Responsabilités :
 *  - Récupère un token signé via l'edge function `livekit-token`
 *    (payload : identity, room, role, permissions)
 *  - Connecte la `Room` avec adaptive stream + dynacast
 *  - Publie/déconnecte les tracks locaux (`buildLocalStream` côté caméra)
 *  - Expose participants distants, états de connexion, et helpers (mute,
 *    replaceTrack pour flip caméra, leave)
 *  - Re-tente automatiquement sur déconnexion réseau
 *
 * @see supabase/functions/livekit-token/index.ts
 * @see mem://tech-stack/livekit-sfu-infrastructure
 */
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Room,
  RoomEvent,
  Track,
  LocalTrack,
  RemoteParticipant,
  ConnectionState,
  DisconnectReason,
  VideoPresets,
} from "livekit-client";
import * as livekit from "@/api/endpoints/livekit";
import { getDeviceId } from "@/lib/deviceId";

/**
 * Raisons de déconnexion DÉFINITIVES : on ne retente pas (sinon ping-pong entre deux connexions
 * du même compte, ou réessais inutiles sur une room fermée / un participant expulsé).
 */
const FINAL_DISCONNECT_REASONS = new Set<DisconnectReason>([
  DisconnectReason.CLIENT_INITIATED,
  DisconnectReason.DUPLICATE_IDENTITY,
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.ROOM_DELETED,
  DisconnectReason.ROOM_CLOSED,
  DisconnectReason.USER_REJECTED,
]);
const REJOIN_DELAYS_MS = [1500, 3000, 6000, 10000, 15000];

/**
 * Clé d'un participant distant = son `userId`. L'identité LiveKit brute est `userId#deviceId`
 * (voir lib/deviceId.ts) ; on la ramène au `userId` pour que toutes les comparaisons existantes
 * avec des ids métier (candidats bannis, profils, focus imposé…) restent valables.
 */
const peerKey = (p: { identity: string }) => p.identity.split("#")[0];

interface UseLiveKitConfig {
  roomName: string;
  userId: string;
  isHost: boolean;
  participantName?: string;
  /** Allow this participant to publish (for guests in lives) */
  canPublish?: boolean;
  onRemoteStream?: (stream: MediaStream, peerId: string) => void;
  onPeerJoin?: (peerId: string) => void;
  onPeerLeave?: (peerId: string) => void;
  onError?: (error: string) => void;
}

interface LiveKitState {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isConnected: boolean;
  connectionState: string;
  peerCount: number;
  room: Room | null;
}

export const useLiveKit = ({
  roomName,
  userId,
  isHost,
  participantName,
  canPublish,
  onRemoteStream,
  onPeerJoin,
  onPeerLeave,
  onError,
}: UseLiveKitConfig) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("new");
  const [peerCount, setPeerCount] = useState(0);
  /**
   * `false` quand le navigateur bloque la lecture audio (autoplay) : la page doit afficher un
   * bouton « Activer le son » qui appelle [startAudio]. `true` par défaut (rien à faire).
   */
  const [canPlaybackAudio, setCanPlaybackAudio] = useState(true);
  /** Incrémenté quand le SFU change MES permissions (ex. droit de publier accordé à chaud). */
  const [permissionsVersion, setPermissionsVersion] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isJoinedRef = useRef(false);
  /** Vrai entre `joinRoom()` et `leaveRoom()` : autorise la reconnexion automatique. */
  const wantsConnectionRef = useRef(false);
  const rejoinAttemptRef = useRef(0);
  const rejoinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinRoomRef = useRef<() => Promise<void>>(async () => {});

  // Stable callback refs
  const onRemoteStreamRef = useRef(onRemoteStream);
  const onPeerJoinRef = useRef(onPeerJoin);
  const onPeerLeaveRef = useRef(onPeerLeave);
  const onErrorRef = useRef(onError);

  useEffect(() => { onRemoteStreamRef.current = onRemoteStream; }, [onRemoteStream]);
  useEffect(() => { onPeerJoinRef.current = onPeerJoin; }, [onPeerJoin]);
  useEffect(() => { onPeerLeaveRef.current = onPeerLeave; }, [onPeerLeave]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Get LiveKit token from edge function
  const getToken = useCallback(async (): Promise<{ token: string; url: string } | null> => {
    try {
      const data = await livekit.getToken({
        // Le backend attend `roomName` (Joi .required()) ; `room` seul était retiré par
        // stripUnknown → 422. On envoie `roomName` (le spectateur/host web peut rejoindre).
        room: roomName,
        roomName,
        identity: participantName || userId,
        isHost,
        participantName: participantName || userId,
        canPublish: canPublish ?? isHost,
        // Identité LiveKit unique par onglet/appareil (voir lib/deviceId.ts).
        deviceId: getDeviceId(),
      });

      if (!data?.token) {
        console.error("Error getting LiveKit token: empty token");
        onErrorRef.current?.("Impossible d'obtenir le token de connexion");
        return null;
      }

      return data as { token: string; url: string };
    } catch (err) {
      console.error("Failed to fetch LiveKit token:", err);
      onErrorRef.current?.("Erreur de connexion au serveur");
      return null;
    }
  }, [roomName, isHost, participantName, userId, canPublish]);

  // Build a MediaStream from a participant's tracks
  const buildStreamForParticipant = useCallback((participant: RemoteParticipant): MediaStream => {
    const stream = new MediaStream();
    participant.trackPublications.forEach((pub) => {
      if (pub.track && pub.isSubscribed) {
        stream.addTrack(pub.track.mediaStreamTrack);
      }
    });
    return stream;
  }, []);

  // Update remote streams state
  const updateRemoteStreams = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;

    const newStreams = new Map<string, MediaStream>();
    room.remoteParticipants.forEach((participant) => {
      const stream = buildStreamForParticipant(participant);
      if (stream.getTracks().length > 0) {
        newStreams.set(peerKey(participant), stream);
      }
    });

    setRemoteStreams(newStreams);
    setPeerCount(room.remoteParticipants.size);
  }, [buildStreamForParticipant]);

  // Start local stream (camera + mic)
  // Build a MediaStream from the local participant's published tracks
  const buildLocalStream = useCallback((): MediaStream | null => {
    const room = roomRef.current;
    if (!room) return null;
    const stream = new MediaStream();
    room.localParticipant.trackPublications.forEach((pub) => {
      if (pub.track && pub.track instanceof LocalTrack) {
        stream.addTrack(pub.track.mediaStreamTrack);
      }
    });
    if (stream.getTracks().length === 0) return null;
    return stream;
  }, []);

  const startLocalStream = useCallback(async (video = true, audio = true): Promise<MediaStream | null> => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) {
      console.error("[LiveKit] Room not connected, cannot start local stream");
      onErrorRef.current?.("Salle non connectée");
      return null;
    }

    try {
      // Use LiveKit's native methods to enable camera/mic – avoids "Device in use" errors
      if (video) {
        await room.localParticipant.setCameraEnabled(true);
      }
      if (audio) {
        await room.localParticipant.setMicrophoneEnabled(true);
      }

      // Build a MediaStream from the now-published local tracks
      const stream = buildLocalStream();
      if (stream) {
        setLocalStream(stream);
        localStreamRef.current = stream;
      }

      return stream;
    } catch (err: any) {
      console.error("Error accessing media devices:", err);
      // Message précis selon le type d'échec getUserMedia (le SDK LiveKit propage
      // le DOMException sous-jacent via `err.name`).
      const name = err?.name || "";
      const msg =
        name === "NotAllowedError" || name === "SecurityError"
          ? "Autorisez la caméra/micro dans votre navigateur"
          : name === "NotReadableError" || name === "AbortError"
            ? "Caméra déjà utilisée par une autre appli/onglet"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "Aucune caméra détectée"
              : (err?.message || "Impossible d'accéder à la caméra/microphone");
      onErrorRef.current?.(msg);
      return null;
    }
  }, [buildLocalStream]);

  // Join the LiveKit room
  const joinRoom = useCallback(async () => {
    if (isJoinedRef.current) return;
    wantsConnectionRef.current = true;
    if (rejoinTimerRef.current) {
      clearTimeout(rejoinTimerRef.current);
      rejoinTimerRef.current = null;
    }

    try {
      setConnectionState("connecting");

      const tokenData = await getToken();
      if (!tokenData) {
        setConnectionState("failed");
        return;
      }

      if (!tokenData.url || !tokenData.token) {
        console.error("[LiveKit] Invalid token data received");
        onErrorRef.current?.("Configuration de streaming manquante");
        setConnectionState("failed");
        return;
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: VideoPresets.h720.resolution,
          facingMode: "user",
        },
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      roomRef.current = room;

      // Connection state changes
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        console.log("[LiveKit] Connection state:", state);
        setConnectionState(state);
        setIsConnected(state === ConnectionState.Connected);
      });

      // Remote participant joins
      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log("[LiveKit] Participant joined:", peerKey(participant));
        setPeerCount(room.remoteParticipants.size);
        onPeerJoinRef.current?.(peerKey(participant));
      });

      // Remote participant leaves
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log("[LiveKit] Participant left:", peerKey(participant));
        setRemoteStreams((prev) => {
          const updated = new Map(prev);
          updated.delete(peerKey(participant));
          return updated;
        });
        setPeerCount(room.remoteParticipants.size);
        onPeerLeaveRef.current?.(peerKey(participant));
      });

      // Track subscribed (remote track available).
      // Merge the new track into the participant's existing MediaStream
      // instead of creating a brand-new one, so viewer <video> elements
      // keep their srcObject reference and don't restart (no visible cut).
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log("[LiveKit] Track subscribed:", track.kind, "from", peerKey(participant));
        setRemoteStreams((prev) => {
          const updated = new Map(prev);
          let stream = updated.get(peerKey(participant));
          if (!stream) {
            stream = new MediaStream();
            updated.set(peerKey(participant), stream);
          }
          // Only add if not already there — avoids duplicate track errors.
          const already = stream.getTracks().some((t) => t.id === track.mediaStreamTrack.id);
          if (!already) stream.addTrack(track.mediaStreamTrack);
          onRemoteStreamRef.current?.(stream, peerKey(participant));
          return updated;
        });
      });

      // Track unsubscribed: remove only that track from the existing stream
      // (keep the same MediaStream reference so the <video> element does not
      // reload its srcObject).
      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log("[LiveKit] Track unsubscribed:", track.kind, "from", peerKey(participant));
        setRemoteStreams((prev) => {
          const updated = new Map(prev);
          const stream = updated.get(peerKey(participant));
          if (stream) {
            try { stream.removeTrack(track.mediaStreamTrack); } catch {}
            if (stream.getTracks().length === 0) {
              updated.delete(peerKey(participant));
            }
          }
          return updated;
        });
      });

      // TrackMuted / TrackUnmuted intentionally NOT rebuilding the stream map.
      // A muted track stays in the MediaStream; the video element just shows
      // the last frame / silence — no need to reassign srcObject. Rebuilding
      // here was the main cause of visible "cuts" for competition viewers.

      // Reconnection
      room.on(RoomEvent.Reconnecting, () => {
        console.log("[LiveKit] Reconnecting...");
        setConnectionState("reconnecting");
      });

      room.on(RoomEvent.Reconnected, () => {
        console.log("[LiveKit] Reconnected!");
        setConnectionState("connected");
        setIsConnected(true);
      });

      // Autoplay audio bloqué par le navigateur → la page affiche « Activer le son ».
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setCanPlaybackAudio(room.canPlaybackAudio);
      });
      // Le backend accorde/retire le droit de publier à chaud (invité accepté/retiré).
      room.on(RoomEvent.ParticipantPermissionsChanged, () => setPermissionsVersion((v) => v + 1));

      room.on(RoomEvent.Disconnected, (reason) => {
        console.log("[LiveKit] Disconnected", reason);
        // Un handler d'une ANCIENNE room ne doit pas écraser la room courante (remount rapide).
        if (roomRef.current !== room) return;
        setIsConnected(false);
        setConnectionState("disconnected");
        isJoinedRef.current = false;
        roomRef.current = null;

        // Reconnexion automatique : le SDK ne la tente que pour les coupures réseau courtes ;
        // au-delà (ou après un redémarrage du serveur) il émet `Disconnected` et c'était
        // définitif → participant muet sans recours. On rejoint avec un jeton frais.
        if (!wantsConnectionRef.current) return;
        if (reason !== undefined && FINAL_DISCONNECT_REASONS.has(reason)) {
          if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
            onErrorRef.current?.("Connecté ailleurs avec ce compte : cette connexion a été fermée");
          }
          return;
        }
        const attempt = rejoinAttemptRef.current;
        if (attempt >= REJOIN_DELAYS_MS.length) {
          setConnectionState("failed");
          onErrorRef.current?.("Connexion au direct perdue");
          return;
        }
        rejoinAttemptRef.current = attempt + 1;
        setConnectionState("reconnecting");
        rejoinTimerRef.current = setTimeout(() => {
          rejoinTimerRef.current = null;
          if (wantsConnectionRef.current && !isJoinedRef.current) void joinRoomRef.current();
        }, REJOIN_DELAYS_MS[attempt]);
      });

      // Connect to room with timeout
      const connectPromise = room.connect(tokenData.url, tokenData.token);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Délai de connexion dépassé (15s)")), 15000)
      );

      await Promise.race([connectPromise, timeoutPromise]);

      isJoinedRef.current = true;
      rejoinAttemptRef.current = 0;
      setIsConnected(true);
      setConnectionState("connected");
      setCanPlaybackAudio(room.canPlaybackAudio);

      console.log("[LiveKit] Connected to room:", roomName);

      // Update initial peer count
      setPeerCount(room.remoteParticipants.size);

      // Build initial remote streams for already-connected participants
      updateRemoteStreams();

    } catch (err: any) {
      console.error("[LiveKit] Failed to join room:", err);
      setConnectionState("failed");
      
      // Clean up on failure
      if (roomRef.current) {
        try { roomRef.current.disconnect(); } catch {}
        roomRef.current = null;
      }
      isJoinedRef.current = false;

      const message = err.message || "Impossible de rejoindre la salle";
      onErrorRef.current?.(message);

      // Échec de connexion initiale (réseau instable, jeton lent…) : on réessaie aussi, avec le
      // même backoff que la reconnexion — sinon un spectateur arrivé pendant une micro-coupure
      // restait définitivement sans son ni image.
      if (wantsConnectionRef.current) {
        const attempt = rejoinAttemptRef.current;
        if (attempt < REJOIN_DELAYS_MS.length) {
          rejoinAttemptRef.current = attempt + 1;
          rejoinTimerRef.current = setTimeout(() => {
            rejoinTimerRef.current = null;
            if (wantsConnectionRef.current && !isJoinedRef.current) void joinRoomRef.current();
          }, REJOIN_DELAYS_MS[attempt]);
        }
      }
    }
  }, [getToken, roomName, buildStreamForParticipant, updateRemoteStreams]);
  joinRoomRef.current = joinRoom;

  /** Vrai si le jeton courant autorise la publication (invité accepté, hôte). */
  const hasPublishPermission = useCallback((): boolean => {
    const room = roomRef.current;
    return !!room && room.state === ConnectionState.Connected && room.localParticipant.permissions?.canPublish === true;
  }, []);

  /**
   * Aligne les pistes publiées sur `stream` (publie les nouvelles, remplace celles changées —
   * flip caméra —, dépublie celles disparues, reflète `track.enabled` en mute/unmute côté SFU).
   * Publie DIRECTEMENT les pistes du MediaStream fourni par la page (pas de seconde capture
   * caméra/micro). Sans effet tant que la room n'est pas connectée : rappeler à la connexion.
   * `null` = tout dépublier (descente de scène).
   */
  const publishStreamTracks = useCallback(async (stream: MediaStream | null) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const lp = room.localParticipant;
    const kinds: Array<{ kind: "audio" | "video"; source: Track.Source }> = [
      { kind: "audio", source: Track.Source.Microphone },
      { kind: "video", source: Track.Source.Camera },
    ];
    for (const { kind, source } of kinds) {
      const wanted = stream?.getTracks().find((t) => t.kind === kind && t.readyState === "live") ?? null;
      const pub = lp.getTrackPublication(source);
      const published = pub?.track?.mediaStreamTrack ?? null;
      try {
        if (!wanted) {
          // `false` : la piste appartient à la page, ne pas la stopper.
          if (pub?.track) await lp.unpublishTrack(pub.track, false);
          continue;
        }
        if (published && published.id !== wanted.id && pub?.track) await lp.unpublishTrack(pub.track, false);
        let current = lp.getTrackPublication(source);
        if (!current?.track) {
          await lp.publishTrack(wanted, { source, name: kind === "audio" ? "microphone" : "camera" });
          current = lp.getTrackPublication(source);
        }
        if (current?.track) {
          if (wanted.enabled && current.isMuted) await current.track.unmute();
          if (!wanted.enabled && !current.isMuted) await current.track.mute();
        }
      } catch (err) {
        console.warn(`[LiveKit] publication ${kind} :`, err);
        onErrorRef.current?.(kind === "audio" ? "Impossible de publier le micro" : "Impossible de publier la caméra");
      }
    }
  }, []);

  /** Débloque la lecture audio après un geste utilisateur (autoplay bloqué). */
  const startAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setCanPlaybackAudio(room.canPlaybackAudio);
    } catch (err) {
      console.warn("[LiveKit] startAudio failed:", err);
    }
  }, []);

  // Leave the room
  const leaveRoom = useCallback(async () => {
    wantsConnectionRef.current = false;
    rejoinAttemptRef.current = 0;
    if (rejoinTimerRef.current) {
      clearTimeout(rejoinTimerRef.current);
      rejoinTimerRef.current = null;
    }
    const room = roomRef.current;
    if (room) {
      room.disconnect();
      roomRef.current = null;
    }

    // Stop local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    isJoinedRef.current = false;
    setIsConnected(false);
    setRemoteStreams(new Map());
    setPeerCount(0);
    setConnectionState("disconnected");
  }, []);

  // Toggle video
  const toggleVideo = useCallback(async (enabled: boolean) => {
    const room = roomRef.current;
    if (!room) return;

    await room.localParticipant.setCameraEnabled(enabled);

    // Rebuild local stream so the local preview updates with the new track
    const stream = buildLocalStream();
    if (stream) {
      setLocalStream(stream);
      localStreamRef.current = stream;
    }
  }, [buildLocalStream]);

  // Toggle audio
  const toggleAudio = useCallback(async (enabled: boolean) => {
    const room = roomRef.current;
    if (!room) return;

    await room.localParticipant.setMicrophoneEnabled(enabled);

    // Rebuild local stream so audio track reference stays current
    const stream = buildLocalStream();
    if (stream) {
      setLocalStream(stream);
      localStreamRef.current = stream;
    }
  }, [buildLocalStream]);

  // Switch camera (front/back)
  const switchCamera = useCallback(async (currentFacingMode: "user" | "environment"): Promise<MediaStream | null> => {
    const room = roomRef.current;
    if (!room) return null;

    const newFacingMode: "user" | "environment" = currentFacingMode === "user" ? "environment" : "user";

    try {
      // 1. Enumerate video devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      console.log("[LiveKit] Available cameras:", videoDevices.map((d) => d.label));

      // 2. Find the device matching the new facing mode (heuristic on label)
      const wantBack = newFacingMode === "environment";
      const matchByLabel = videoDevices.find((d) => {
        const label = d.label.toLowerCase();
        return wantBack
          ? /(back|rear|environment|arrière|arriere|trasera)/i.test(label)
          : /(front|user|face|avant|frontal)/i.test(label);
      });

      // 3. Get current device id to pick a different one as fallback
      const currentTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      const currentDeviceId = currentTrack?.mediaStreamTrack?.getSettings().deviceId;
      const fallback = videoDevices.find((d) => d.deviceId && d.deviceId !== currentDeviceId);

      const targetDevice = matchByLabel || fallback;

      if (videoDevices.length < 2 && !matchByLabel) {
        console.warn("[LiveKit] No second camera detected on this device");
        onErrorRef.current?.("Aucune autre caméra détectée sur cet appareil");
        return null;
      }

      // 4. Try switchActiveDevice first (cleanest, keeps publication alive)
      if (targetDevice?.deviceId) {
        try {
          await room.switchActiveDevice("videoinput", targetDevice.deviceId);
          console.log("[LiveKit] Switched to camera:", targetDevice.label);
        } catch (switchErr) {
          console.warn("[LiveKit] switchActiveDevice failed, falling back to republish:", switchErr);
          // Fallback: republish camera with deviceId constraint
          await room.localParticipant.setCameraEnabled(false);
          await room.localParticipant.setCameraEnabled(true, {
            deviceId: { exact: targetDevice.deviceId },
            resolution: VideoPresets.h720.resolution,
          });
        }
      } else {
        // No deviceId available — fall back to facingMode constraint
        await room.localParticipant.setCameraEnabled(false);
        await room.localParticipant.setCameraEnabled(true, {
          facingMode: newFacingMode,
          resolution: VideoPresets.h720.resolution,
        });
      }

      // 5. Rebuild local stream
      const stream = buildLocalStream();
      if (stream) {
        setLocalStream(stream);
        localStreamRef.current = stream;
        return stream;
      }
    } catch (err) {
      console.error("[LiveKit] Switch camera failed:", err);
      try { await room.localParticipant.setCameraEnabled(true); } catch {}
    }

    return null;
  }, [buildLocalStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wantsConnectionRef.current = false;
      if (rejoinTimerRef.current) {
        clearTimeout(rejoinTimerRef.current);
        rejoinTimerRef.current = null;
      }
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      isJoinedRef.current = false;
    };
  }, []);

  return {
    localStream,
    remoteStreams,
    isConnected,
    connectionState,
    peerCount,
    room: roomRef.current,
    canPlaybackAudio,
    startAudio,
    permissionsVersion,
    hasPublishPermission,
    publishStreamTracks,
    startLocalStream,
    joinRoom,
    leaveRoom,
    toggleVideo,
    toggleAudio,
    switchCamera,
  };
};
