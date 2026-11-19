/**
 * RemoteAudioSink
 * ---------------
 * Joue l'AUDIO de tous les flux distants reçus, indépendamment de ce qui est affiché.
 *
 * Règle produit : un spectateur ou un invité doit TOUJOURS entendre tous ceux qui parlent.
 * Avant, le son d'un participant n'était lu que par l'élément <video> de sa vignette : une
 * vignette non affichée (grille saturée, vignettes masquées, « +N », focus) = participant muet,
 * et chaque écran perdait des participants différents selon sa taille.
 *
 * Ce composant rend un <audio> caché par flux, relance `play()` si le navigateur bloque
 * l'autoplay (déblocage au premier clic/toucher) et expose un bouton « Activer le son » via
 * `onBlockedChange` pour que la page puisse l'afficher.
 */
import { useEffect, useRef, useState } from "react";

interface RemoteAudioSinkProps {
  /** Flux distants (clé = identité du participant). */
  streams: Map<string, MediaStream> | MediaStream[];
  /** Coupe tout (ex. page en pause). */
  muted?: boolean;
  /** Notifie la page quand l'autoplay est bloqué / débloqué (pour afficher un bouton). */
  onBlockedChange?: (blocked: boolean) => void;
}

const AudioElement = ({
  stream,
  muted,
  onBlocked,
}: {
  stream: MediaStream;
  muted: boolean;
  onBlocked: (blocked: boolean) => void;
}) => {
  const ref = useRef<HTMLAudioElement>(null);
  // Callback dans un ref : l'effet ne dépend que du flux (sinon chaque rendu du parent
  // ré-attachait les écouteurs et relançait `play()`).
  const onBlockedRef = useRef(onBlocked);
  onBlockedRef.current = onBlocked;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;

    let cancelled = false;
    const tryPlay = () => {
      el.play()
        .then(() => { if (!cancelled) onBlockedRef.current(false); })
        .catch(() => { if (!cancelled) onBlockedRef.current(true); });
    };
    tryPlay();

    // Un flux audio peut recevoir sa piste APRÈS l'attache (TrackSubscribed tardif) → rejouer.
    const onAddTrack = () => tryPlay();
    stream.addEventListener("addtrack", onAddTrack);

    // Déblocage autoplay : première interaction utilisateur n'importe où dans la page.
    const unlock = () => tryPlay();
    document.addEventListener("click", unlock, { passive: true });
    document.addEventListener("touchstart", unlock, { passive: true });
    document.addEventListener("keydown", unlock);

    // Filet de sécurité : certains navigateurs mettent l'élément en pause lors d'un changement
    // de piste ; on vérifie périodiquement qu'il joue tant qu'il y a une piste audio live.
    const interval = setInterval(() => {
      const hasLive = stream.getAudioTracks().some((t) => t.readyState === "live");
      if (hasLive && el.paused) tryPlay();
    }, 2000);

    return () => {
      cancelled = true;
      stream.removeEventListener("addtrack", onAddTrack);
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("keydown", unlock);
      clearInterval(interval);
    };
  }, [stream]);

  // `display:none` arrête la lecture sur certains navigateurs → on cache visuellement seulement.
  return <audio ref={ref} autoPlay playsInline muted={muted} style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }} />;
};

export const RemoteAudioSink = ({ streams, muted = false, onBlockedChange }: RemoteAudioSinkProps) => {
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const entries: Array<[string, MediaStream]> = Array.isArray(streams)
    ? streams.map((s) => [s.id, s] as [string, MediaStream])
    : Array.from(streams.entries());

  const onBlockedRef = useRef(onBlockedChange);
  onBlockedRef.current = onBlockedChange;

  useEffect(() => {
    onBlockedRef.current?.(blockedIds.size > 0);
  }, [blockedIds]);

  // Nettoie les ids de flux disparus.
  useEffect(() => {
    setBlockedIds((prev) => {
      const live = new Set(entries.map(([k]) => k));
      const next = new Set([...prev].filter((k) => live.has(k)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.map(([k]) => k).join("|")]);

  return (
    <>
      {entries.map(([key, stream]) => (
        <AudioElement
          key={key}
          stream={stream}
          muted={muted}
          onBlocked={(b) =>
            setBlockedIds((prev) => {
              if (b === prev.has(key)) return prev;
              const next = new Set(prev);
              if (b) next.add(key); else next.delete(key);
              return next;
            })
          }
        />
      ))}
    </>
  );
};

export default RemoteAudioSink;
