/**
 * Vue « enregistrement » d'un duel — page interne SANS UI, utilisée UNIQUEMENT par le
 * navigateur headless de l'egress LiveKit (voir `recording.service.js#buildDuelRecordingUrl` /
 * `startWebEgress`) pour produire un replay composite. Un duel n'a AUCUNE room LiveKit unique
 * contenant les deux artistes (chacun publie dans SA PROPRE room) — cette page se connecte donc
 * aux DEUX rooms directement (jetons de lecture seule passés en query string, mintés
 * server-side : le navigateur headless n'a ni cookies ni JWT utilisateur) et affiche les deux
 * flux côte à côte, plein écran, fond noir, sans aucun contrôle.
 *
 * Émet `console.log('START_RECORDING')` dès que les deux vidéos ont une frame réelle (LiveKit
 * egress est démarré avec `awaitStartSignal: true` côté serveur) — évite d'enregistrer des
 * secondes de noir en attendant la connexion.
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Room, RoomEvent, RemoteTrack, Track } from "livekit-client";

/** Se connecte à UNE room LiveKit (lecture seule) et affiche son premier flux vidéo. */
const ArtistFeed = ({ url, token, label, onFrame }: { url: string; token: string; label: string; onFrame: () => void }) => {
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
        onFrame();
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
    <div className="relative w-1/2 h-full bg-black flex items-center justify-center overflow-hidden">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
    </div>
  );
};

const DuelRecordingView = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const url = params.get("u") || "";
  const t1 = params.get("t1") || "";
  const t2 = params.get("t2") || "";
  const [frame1, setFrame1] = useState(false);
  const [frame2, setFrame2] = useState(false);

  // Signal LiveKit egress (`awaitStartSignal`) dès que les deux flux ont une frame — pas avant,
  // pour ne jamais enregistrer un écran noir en attendant la connexion. Filet de sécurité : si
  // un des deux artistes n'a (encore) aucune vidéo (caméra coupée, connexion lente…), on démarre
  // quand même après 8 s — mieux vaut un replay partiel qu'un enregistrement qui n'arrive jamais.
  useEffect(() => {
    let signaled = false;
    const signal = () => {
      if (signaled) return;
      signaled = true;
      // eslint-disable-next-line no-console
      console.log("START_RECORDING");
    };
    if (frame1 && frame2) {
      signal();
      return;
    }
    const timeout = setTimeout(signal, 8000);
    return () => clearTimeout(timeout);
  }, [frame1, frame2]);

  if (!id || !url || !t1 || !t2) {
    return <div className="w-screen h-screen bg-black" />;
  }

  return (
    <div className="w-screen h-screen bg-black flex overflow-hidden">
      <ArtistFeed url={url} token={t1} label="artist1" onFrame={() => setFrame1(true)} />
      <ArtistFeed url={url} token={t2} label="artist2" onFrame={() => setFrame2(true)} />
    </div>
  );
};

export default DuelRecordingView;
