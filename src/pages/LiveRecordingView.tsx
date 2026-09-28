/**
 * Vue « enregistrement » d'un live — page interne SANS UI, utilisée UNIQUEMENT par le
 * navigateur headless de l'egress LiveKit (voir `recording.service.js#buildLiveRecordingUrl` /
 * `startWebEgress`) pour produire un replay composite incluant les invités. `live-<id>` ne
 * contient que l'hôte — chaque invité accepté publie dans SA PROPRE room
 * (`live-guest-<liveId>-<guestUserId>`) — cette page se connecte donc à la room de l'hôte (jeton
 * de lecture seule en query string, minté server-side) ET interroge en continu
 * `GET /recordings/live/:liveId/guests` (protégée par une clé signée, également en query string)
 * pour suivre les invités qui rejoignent/quittent EN COURS d'enregistrement et rejoindre/quitter
 * leurs rooms en conséquence.
 *
 * Émet `console.log('START_RECORDING')` dès que l'hôte a une frame réelle (LiveKit egress est
 * démarré avec `awaitStartSignal: true` côté serveur) — les invités sont optionnels et peuvent
 * arriver à tout moment, on ne bloque donc pas dessus.
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Room, RoomEvent, RemoteTrack, Track } from "livekit-client";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";
const GUEST_POLL_MS = 5000;

interface GuestToken {
  userId: string;
  url: string;
  token: string;
}

/** Se connecte à UNE room LiveKit (lecture seule) et affiche son premier flux vidéo. */
const ParticipantFeed = ({
  url,
  token,
  label,
  large,
  onFrame,
}: {
  url: string;
  token: string;
  label: string;
  large: boolean;
  onFrame?: () => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!url || !token) return;
    const room = new Room();
    let signaled = false;

    const onTrackSubscribed = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Video || !videoRef.current) return;
      track.attach(videoRef.current);
      if (!signaled) {
        signaled = true;
        onFrame?.();
      }
    };
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);

    room.connect(url, token).catch((err) => {
      console.error(`[recording-view] connect failed (${label}):`, err);
    });

    return () => {
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token]);

  return (
    <div
      className={`relative bg-black flex items-center justify-center overflow-hidden ${
        large ? "flex-1 h-full" : "w-56 h-56"
      }`}
    >
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
    </div>
  );
};

const LiveRecordingView = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const url = params.get("u") || "";
  const t0 = params.get("t0") || "";
  const recordingId = params.get("rid") || "";
  const key = params.get("key") || "";
  const [hostFrame, setHostFrame] = useState(false);
  const [guests, setGuests] = useState<GuestToken[]>([]);

  // Signal LiveKit egress (`awaitStartSignal`) dès que l'hôte a une frame — filet de sécurité :
  // après 8 s on démarre quand même (mieux vaut un replay partiel qu'un enregistrement qui
  // n'arrive jamais si l'hôte tarde à publier).
  useEffect(() => {
    let signaled = false;
    const signal = () => {
      if (signaled) return;
      signaled = true;
      // eslint-disable-next-line no-console
      console.log("START_RECORDING");
    };
    if (hostFrame) {
      signal();
      return;
    }
    const timeout = setTimeout(signal, 8000);
    return () => clearTimeout(timeout);
  }, [hostFrame]);

  // Sondage de la liste des invités actuellement acceptés — un live, contrairement au duel,
  // gagne/perd des invités EN COURS d'enregistrement.
  useEffect(() => {
    if (!id || !recordingId || !key) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const qs = new URLSearchParams({ recordingId, key });
        const res = await fetch(`${API_BASE_URL}/recordings/live/${id}/guests?${qs.toString()}`);
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setGuests(body?.data?.guests || []);
      } catch (err) {
        console.error("[recording-view] guest poll failed:", err);
      }
    };

    poll();
    const interval = setInterval(poll, GUEST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, recordingId, key]);

  if (!id || !url || !t0) {
    return <div className="w-screen h-screen bg-black" />;
  }

  return (
    <div className="w-screen h-screen bg-black flex overflow-hidden">
      <ParticipantFeed url={url} token={t0} label="host" large onFrame={() => setHostFrame(true)} />
      {guests.length > 0 && (
        <div className="flex flex-col gap-2 p-2 overflow-hidden">
          {guests.map((g) => (
            <ParticipantFeed key={g.userId} url={g.url} token={g.token} label={`guest-${g.userId}`} large={false} />
          ))}
        </div>
      )}
    </div>
  );
};

export default LiveRecordingView;
