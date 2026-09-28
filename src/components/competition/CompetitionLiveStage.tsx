/**
 * Compétition: CompetitionLiveStage — wrapper streaming utilisant
 * LiveKit Cloud (`useLiveKit`).
 *
 *  - mode `online`  : multi-publishers (manager + candidats approuvés
 *    peuvent activer caméra/micro, comme dans les duels).
 *  - mode `onsite`  : seul le manager publie, les spectateurs sont
 *    en mode consommation (pattern concert).
 *
 * Le composant expose ses contrôles média (mic, caméra, switch, stop)
 * via `onControlsReady` afin que la page parente puisse les afficher
 * sur desktop ET dans `MobileStreamOverlay` sur mobile.
 *
 * EN — Streaming stage for competitions. Exposes media controls via
 * `onControlsReady` so the parent can render mic/cam/flip/stop buttons
 * both on desktop and inside the mobile overlay.
 *
 * @see useLiveKit
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveKit } from "@/hooks/useLiveKit";
import * as competitions from "@/api/endpoints/competitions";
import { useRoomEvent } from "@/realtime/useRoom";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video as VideoIcon, VideoOff, SwitchCamera, LogOut, Loader2, Trophy, Pin, PinOff, EyeOff, Eye, Maximize2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";


export interface CompetitionStageControls {
  isStreaming: boolean;
  isPaused: boolean;
  isCameraOn: boolean;
  isMicOn: boolean;
  canPublish: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onSwitchCamera: () => void;
  onStart: () => void;
}

interface Props {
  competition: any;
  currentUserId: string;
  isHost: boolean;           // manager
  isCandidate: boolean;      // candidat approuvé (mode online seulement)
  displayName: string;
  /** Callback exposant le flux local (utilisé pour l'enregistrement composite). */
  onLocalStream?: (stream: MediaStream | null) => void;
  /** Reçoit les contrôles média pour pilotage externe (desktop bar + mobile overlay). */
  onControlsReady?: (controls: CompetitionStageControls) => void;
  /** Reçoit le nombre de participants distants pour affichage du compteur. */
  onPeerCountChange?: (count: number) => void;
  /** Désactive les contrôles intégrés (cas où l'on rend ses propres contrôles). */
  hideBuiltInControls?: boolean;
  /** Mode plein écran (mobile overlay) — supprime la carte et étire la vidéo. */
  fullBleed?: boolean;
  /** Candidats coupés d'autorité par l'organisateur (hard-mute micro, parité duel). */
  mutedArtistIds?: Set<string>;
  /** Candidats bannis de la compétition — masqués pour tous ; si c'est MOI, ma diffusion s'arrête. */
  bannedArtistIds?: Set<string>;
  /** Map userId → profil, pour afficher le nom de chaque publieur distant sur sa case
   *  (manager + candidats) — sans ça, seule ma propre case locale affichait un nom. */
  profiles?: Record<string, { full_name?: string; avatar_url?: string } | undefined>;
  /** Notifie le parent quand la bande de vignettes multi-cam s'affiche/se masque, pour que
   *  `MobileStreamOverlay` (rendu par-dessus, en plein écran) décale son rail d'icônes et ne se
   *  mélange plus avec les vignettes ni avec la ligne des messages (voir `hasTopThumbnails`). */
  onThumbnailsVisibleChange?: (visible: boolean) => void;
}

export const CompetitionLiveStage = ({
  competition,
  currentUserId,
  isHost,
  isCandidate,
  displayName,
  onLocalStream,
  onControlsReady,
  onPeerCountChange,
  hideBuiltInControls,
  fullBleed,
  mutedArtistIds,
  bannedArtistIds,
  profiles,
  onThumbnailsVisibleChange,
}: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const canPublish = isHost || (competition.mode === "online" && isCandidate);
  const {
    localStream,
    remoteStreams,
    joinRoom,
    leaveRoom,
    startLocalStream,
    toggleVideo,
    toggleAudio,
    switchCamera,
    isConnected,
    connectionState,
    peerCount,
  } = useLiveKit({
    roomName: competition.livekit_room || `comp-${competition.id}`,
    userId: currentUserId,
    isHost,
    participantName: displayName,
    canPublish,
    // Sans ce callback, un échec de connexion/caméra (permission refusée, caméra déjà utilisée,
    // salle pas encore prête…) échouait en silence : le bouton « Démarrer » ne semblait rien
    // faire, sans aucun message pour comprendre pourquoi.
    onError: (message: string) => toast({ title: message, variant: "destructive" }),
  });

  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isPaused, setIsPaused] = useState(false);
  const togglingCamRef = useRef(false);
  const togglingMicRef = useRef(false);

  // Auto-join the room when component mounts. We deliberately depend only on
  // `currentUserId` (not on the memoised joinRoom whose identity flips with
  // props like `canPublish`) so a candidate becoming approved mid-live does
  // NOT trigger a re-join that would flash the viewer stream.
  const joinRoomRef = useRef(joinRoom);
  useEffect(() => { joinRoomRef.current = joinRoom; }, [joinRoom]);
  useEffect(() => {
    if (!currentUserId) return;
    joinRoomRef.current();
  }, [currentUserId]);

  // Publishers start their local stream once connected
  useEffect(() => {
    if (isConnected && canPublish && !localStream) {
      startLocalStream(true, true);
    }
  }, [isConnected, canPublish, localStream, startLocalStream]);

  /**
   * Auto-reconnect : si la salle décroche ("failed", "disconnected"), on
   * planifie une nouvelle tentative de connexion avec backoff léger afin
   * que le direct des compétitions se rétablisse automatiquement sans
   * intervention manuelle du spectateur (parité avec Duel/Concert).
   */
  const reconnectAttemptsRef = useRef(0);
  useEffect(() => {
    if (!currentUserId) return;
    if (connectionState === "connected" || connectionState === "connecting" || connectionState === "reconnecting") {
      reconnectAttemptsRef.current = 0;
      return;
    }
    if (connectionState === "failed" || connectionState === "disconnected") {
      const attempt = reconnectAttemptsRef.current;
      const delay = Math.min(2000 * 2 ** attempt, 15000);
      const tm = setTimeout(() => {
        reconnectAttemptsRef.current += 1;
        joinRoomRef.current();
      }, delay);
      return () => clearTimeout(tm);
    }
  }, [connectionState, currentUserId]);


  const localRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (localRef.current && localStream) localRef.current.srcObject = localStream;
  }, [localStream]);

  // Ref-callback STABLE (mémoïsée) pour la vidéo locale — voir son usage plus bas. Une fonction
  // fléchée inline aurait une IDENTITÉ NEUVE à chaque rendu de ce composant (donc à chaque clic
  // emoji/j'aime ailleurs sur la page, qui re-rend ce parent) : React détache alors l'ancien
  // callback ref (appel avec `null`) PUIS rattache le nouveau (réassigne `srcObject`) À CHAQUE
  // rendu, même quand l'élément <video> et le flux n'ont pas changé — cette réassignation répétée
  // de `srcObject` provoque un clignotement visible de l'image (bug signalé : « la vidéo clignote
  // quand on clique sur un emoji »). En dépendant de `[localStream]`, l'identité ne change que
  // quand le flux change réellement, tout en gérant toujours correctement le VRAI remontage
  // (bascule focus ↔ vignette, voir commentaire sur le <video> plus bas).
  const attachLocalVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      localRef.current = el;
      if (el && localStream) el.srcObject = localStream;
    },
    [localStream],
  );

  useEffect(() => {
    onLocalStream?.(localStream || null);
  }, [localStream, onLocalStream]);

  useEffect(() => {
    onPeerCountChange?.(peerCount);
  }, [peerCount, onPeerCountChange]);

  // ---- Control handlers ---------------------------------------------------
  const handleToggleCamera = useCallback(async () => {
    if (togglingCamRef.current) return;
    togglingCamRef.current = true;
    try {
      const next = !isCameraOn;
      await toggleVideo(next);
      setIsCameraOn(next);
    } catch (err) {
      console.warn("[CompetitionLiveStage] toggleCamera failed:", err);
    } finally {
      togglingCamRef.current = false;
    }
  }, [isCameraOn, toggleVideo]);

  const handleToggleMic = useCallback(async () => {
    if (togglingMicRef.current) return;
    // Coupé d'autorité par l'organisateur : je ne peux pas me réactiver moi-même (parité duel).
    if (!isMicOn && mutedArtistIds?.has(currentUserId)) return;
    togglingMicRef.current = true;
    try {
      const next = !isMicOn;
      await toggleAudio(next);
      setIsMicOn(next);
    } catch (err) {
      console.warn("[CompetitionLiveStage] toggleMic failed:", err);
    } finally {
      togglingMicRef.current = false;
    }
  }, [isMicOn, toggleAudio, mutedArtistIds, currentUserId]);

  // Micro coupé/réactivé d'autorité par l'organisateur (diffusion `competition-mute-<id>`) :
  // force l'état local sur chaque TRANSITION de mon id dans `mutedArtistIds` (parité duel —
  // `WebRTCDuelStream.tsx`). Avant ce correctif, seule l'entrée dans le Set coupait le micro ;
  // la sortie (FORCE_UNMUTE) ne faisait que mettre à jour l'affichage du bouton manager sans
  // jamais rallumer la piste audio réelle — le compétiteur restait muet malgré la démute.
  // `wasForceMutedRef` évite de rallumer le micro de tout le monde à chaque changement du Set
  // (recréé à chaque toggle, même pour un AUTRE candidat) : on ne réagit qu'à MA transition.
  const wasForceMutedRef = useRef(false);
  useEffect(() => {
    if (!currentUserId) return;
    const mutedNow = !!mutedArtistIds?.has(currentUserId);
    if (mutedNow && !wasForceMutedRef.current) {
      if (isMicOn) {
        toggleAudio(false).catch(() => {});
        setIsMicOn(false);
      }
    } else if (!mutedNow && wasForceMutedRef.current) {
      toggleAudio(true).catch(() => {});
      setIsMicOn(true);
    }
    wasForceMutedRef.current = mutedNow;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutedArtistIds, currentUserId]);

  // Banni de la compétition (parité concert/live `stream:banned`) : ma diffusion s'arrête pour
  // tous — je ne peux plus publier caméra/micro tant que le ban n'est pas levé.
  useEffect(() => {
    if (currentUserId && bannedArtistIds?.has(currentUserId) && localStream) {
      leaveRoom().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannedArtistIds, currentUserId]);

  const handleSwitchCamera = useCallback(async () => {
    await switchCamera(facingMode);
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  }, [facingMode, switchCamera]);

  const handlePause = useCallback(async () => {
    setIsPaused(true);
    setIsCameraOn(false);
    setIsMicOn(false);
    await toggleVideo(false);
    await toggleAudio(false);
  }, [toggleVideo, toggleAudio]);

  const handleResume = useCallback(async () => {
    setIsPaused(false);
    setIsCameraOn(true);
    setIsMicOn(true);
    await toggleVideo(true);
    await toggleAudio(true);
  }, [toggleVideo, toggleAudio]);

  const handleStop = useCallback(async () => {
    await leaveRoom();
  }, [leaveRoom]);

  const handleStart = useCallback(async () => {
    await startLocalStream(true, true);
    setIsCameraOn(true);
    setIsMicOn(true);
    setIsPaused(false);
  }, [startLocalStream]);

  // Forward control surface upward (stable identity not required: parent uses last value)
  useEffect(() => {
    if (!onControlsReady) return;
    onControlsReady({
      isStreaming: !!localStream && isConnected,
      isPaused,
      isCameraOn,
      isMicOn,
      canPublish,
      onPause: handlePause,
      onResume: handleResume,
      onStop: handleStop,
      onToggleCamera: handleToggleCamera,
      onToggleMic: handleToggleMic,
      onSwitchCamera: handleSwitchCamera,
      onStart: handleStart,
    });
  }, [
    onControlsReady,
    localStream,
    isConnected,
    isPaused,
    isCameraOn,
    isMicOn,
    canPublish,
    handlePause,
    handleResume,
    handleStop,
    handleToggleCamera,
    handleToggleMic,
    handleSwitchCamera,
    handleStart,
  ]);

  // ---- Focus & thumbnail layout ------------------------------------------
  const showLocal = canPublish && localStream;

  // All tiles indexed by identity (userId string), with a "local" pseudo-id.
  // `remoteStreams` (pas un `tracks` intermédiaire recréé à chaque rendu, ce qui aurait rendu ce
  // `useMemo` inopérant) est la vraie dépendance stable : `allTiles` ne se recalcule donc plus à
  // chaque rendu de ce composant (clic emoji/j'aime ailleurs sur la page, etc.), seulement quand
  // les flux changent réellement.
  type Tile = { id: string; stream: MediaStream; isLocal: boolean };
  const allTiles: Tile[] = useMemo(() => {
    const list: Tile[] = [];
    if (showLocal && localStream) list.push({ id: currentUserId, stream: localStream, isLocal: true });
    // Un candidat banni disparaît de l'écran de TOUS (pas seulement du sien) — parité concert/live.
    remoteStreams.forEach((s, pid) => { if (!bannedArtistIds?.has(pid)) list.push({ id: pid, stream: s, isLocal: false }); });
    return list;
  }, [showLocal, localStream, remoteStreams, currentUserId, bannedArtistIds]);

  const [userFocusId, setUserFocusId] = useState<string | null>(null);
  const [forcedFocusId, setForcedFocusId] = useState<string | null>(competition.forced_focus_participant_id || null);
  const [hideThumbs, setHideThumbs] = useState(false);
  // « Masquer les autres cases » diffusé par l'organisateur à TOUS les spectateurs (distinct de
  // `hideThumbs`, qui reste un choix personnel de chaque spectateur pour son propre écran).
  const [forcedHideOthers, setForcedHideOthers] = useState(false);
  const { broadcast: broadcastHideOthers } = useRoomBroadcast(
    competition?.id ? `competition-hide-others-${competition.id}` : null,
    (event) => setForcedHideOthers(event === "HIDE"),
  );
  const effectiveHideThumbs = hideThumbs || forcedHideOthers;
  const toggleHideThumbs = useCallback(() => {
    const next = !effectiveHideThumbs;
    if (isHost) broadcastHideOthers(next ? "HIDE" : "SHOW");
    setHideThumbs(next);
  }, [effectiveHideThumbs, isHost, broadcastHideOthers]);

  // Realtime forced-focus updates via the Socket.IO `/live` room `focus` event.
  useRoomEvent("/live", "competition", competition?.id, "focus", (payload: any) => {
    setForcedFocusId(payload?.participantId ?? null);
  });

  const setForcedFocusRemote = useCallback(async (id: string | null) => {
    if (!isHost) return;
    try {
      await competitions.setFocus(competition.id, { participantId: id });
      setForcedFocusId(id);
    } catch {
      /* ignore */
    }
  }, [isHost, competition?.id]);

  const effectiveFocusId = forcedFocusId || userFocusId || allTiles[0]?.id || null;
  const focusTile = allTiles.find((t) => t.id === effectiveFocusId) || allTiles[0];
  const thumbnailTiles = allTiles.filter((t) => t.id !== focusTile?.id);
  const showThumbStrip = !effectiveHideThumbs && thumbnailTiles.length > 0;

  // Informe le parent (mobile plein écran) que la bande de vignettes est visible, pour qu'il
  // décale le rail d'icônes de `MobileStreamOverlay` en conséquence.
  useEffect(() => {
    onThumbnailsVisibleChange?.(showThumbStrip);
  }, [showThumbStrip, onThumbnailsVisibleChange]);

  // Badge micro visible par TOUS (organisateur + spectateurs) sur chaque case candidat,
  // synchronisé avec la coupure d'autorité `mutedArtistIds` (diffusion `competition-mute-<id>`)
  // — parité visuelle avec le badge micro de `GuestVideoBox` (concerts).
  const renderTile = (tile: Tile, opts: { className: string; showName?: boolean }) => {
    const isMuted = tile.isLocal ? !isMicOn : !!mutedArtistIds?.has(tile.id);
    // Nom du publieur (manager ou candidat) : avant ce correctif, seule MA propre case locale
    // affichait un nom (`displayName`) — les cases distantes restaient vides, contrairement au
    // mobile qui résout déjà le nom de chaque candidat via `candidates`. `profiles` (userId →
    // profil) est indexé identiquement pour le manager (`manager_id`) et chaque candidat
    // (`artist_id`), donc `profiles?.[tile.id]` couvre les deux cas sans distinction.
    const tileName = tile.isLocal ? displayName : (profiles?.[tile.id]?.full_name || "");
    return (
      <div className="relative w-full h-full">
        {tile.isLocal ? (
          <video
            // Callback ref (pas juste `ref={localRef}`) : le même tile local est rendu tour à
            // tour dans le bloc focus OU dans une vignette selon qui est épinglé — à chaque
            // bascule, React démonte l'ancien <video> et en monte un nouveau à un autre endroit
            // de l'arbre. Le `useEffect([localStream])` plus bas ne se redéclenche PAS pour un
            // remount (le stream, lui, n'a pas changé), donc le nouvel élément restait sans
            // `srcObject` → écran noir pour l'artiste dès qu'il tapait une case (signalé).
            // Le callback ref réattache le flux dès que l'élément (re)monte, peu importe la cause
            // — mémoïsé (`attachLocalVideo`) pour ne PAS se redéclencher à chaque rendu, voir plus haut.
            ref={attachLocalVideo}
            autoPlay
            muted
            playsInline
            className={opts.className}
          />
        ) : (
          <RemoteVideo stream={tile.stream} className={opts.className} />
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 flex items-center justify-between gap-1">
          <span className="text-[10px] text-white truncate">
            {tileName}
          </span>
          {isMuted ? (
            <MicOff className="w-2.5 h-2.5 text-red-400 shrink-0" />
          ) : (
            <Mic className="w-2.5 h-2.5 text-green-400 shrink-0" />
          )}
        </div>
      </div>
    );
  };

  const wrapperClass = fullBleed
    ? "relative w-full h-full bg-black overflow-hidden"
    : "p-2 relative overflow-hidden";
  const Wrapper: any = fullBleed ? "div" : Card;

  // Bloc « caméra principale ». En plein écran mobile, `MobileStreamOverlay` empile son propre
  // chat/rail par-dessus depuis le BAS de l'écran (parité live/duel) : si la bande de vignettes
  // ci-dessous restait après ce bloc (flex-col → vignettes en bas), elle finissait juste derrière
  // la ligne des messages. On la fait donc passer AVANT ce bloc en plein écran (haut de l'écran,
  // sous le header), et `hasTopThumbnails` (passé au parent via `onThumbnailsVisibleChange`)
  // décale le rail d'icônes de `MobileStreamOverlay` sous elle.
  const focusBlock = (
    <div key="focus" className={fullBleed ? "relative flex-1 min-h-0 w-full bg-black" : "relative w-full aspect-video bg-black rounded overflow-hidden"}>
            {/* object-contain (pas cover) en vue PRINCIPALE : un flux mobile portrait forcé en
                cover dans ce conteneur plus large côté web rognait la tête/le bas du corps —
                même correctif que GuestVideoBox (concerts). Les vignettes restent en cover
                (cadrage serré attendu pour une petite case). */}
            {focusTile && renderTile(focusTile, { className: "w-full h-full bg-black object-contain", showName: true })}

            {/* Overlay controls on focus (top-right) */}
            <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
              {thumbnailTiles.length > 0 && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 bg-black/60 hover:bg-black/80 text-white"
                  onClick={toggleHideThumbs}
                  title={
                    isHost
                      ? (effectiveHideThumbs ? (t("showThumbnails") || "Afficher les mini-cases (pour tous)") : (t("hideThumbnails") || "Masquer les mini-cases (pour tous)"))
                      : (effectiveHideThumbs ? (t("showThumbnails") || "Afficher les mini-cases") : (t("hideThumbnails") || "Masquer les mini-cases"))
                  }
                >
                  {effectiveHideThumbs ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </Button>
              )}
              {isHost && focusTile && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 bg-black/60 hover:bg-black/80 text-white"
                  onClick={() => setForcedFocusRemote(forcedFocusId === focusTile.id ? null : focusTile.id)}
                  title={forcedFocusId === focusTile.id ? (t("releaseFocus") || "Libérer le focus") : (t("forceFocus") || "Imposer cette caméra")}
                >
                  {forcedFocusId === focusTile.id ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                </Button>
              )}
            </div>
            {forcedFocusId && (
              <div className="absolute top-2 left-2 z-10 text-[10px] bg-amber-500/90 text-black font-bold px-2 py-0.5 rounded">
                {t("forceFocus") || "Focus imposé"}
              </div>
            )}
    </div>
  );

  const renderThumbButton = (tile: Tile, size: { width: number; height: number }) => (
    <button
      key={tile.id}
      onClick={() => setUserFocusId(tile.id)}
      className={`relative shrink-0 rounded overflow-hidden ring-2 transition-all ${effectiveFocusId === tile.id ? "ring-primary" : "ring-transparent hover:ring-white/40"}`}
      style={size}
      title={t("watchLive") || "Voir cette case"}
    >
      {renderTile(tile, { className: "w-full h-full bg-black object-cover" })}
      <Maximize2 className="absolute top-1 right-1 w-3 h-3 text-white/80 drop-shadow" />
      {isHost && (
        <span
          onClick={(e) => { e.stopPropagation(); setForcedFocusRemote(forcedFocusId === tile.id ? null : tile.id); }}
          className="absolute bottom-1 right-1 bg-black/70 rounded p-0.5 text-white cursor-pointer"
        >
          {forcedFocusId === tile.id ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
        </span>
      )}
    </button>
  );

  const thumbStripBlock = showThumbStrip ? (
    fullBleed ? (
      // Mobile plein écran : rail horizontal en HAUT (au-dessus du focus, sous le header de
      // `MobileStreamOverlay`) — le placer en bas superposerait sa propre ligne de messages/
      // actions rendue par-dessus depuis le bas de l'écran (voir commentaire plus haut).
      <div key="thumbs" className="shrink-0 w-full bg-black/80 px-1 pb-1 pt-14 overflow-x-auto">
        <div className="flex gap-2 min-w-min">
          {thumbnailTiles.map((tile) => renderThumbButton(tile, { width: 110, height: 62 }))}
        </div>
      </div>
    ) : (
      // Desktop : petites cases en BAS À DROITE, empilées verticalement, en overlay par-dessus
      // la caméra principale (ne pousse plus la mise en page vers le bas).
      <div key="thumbs" className="absolute bottom-2 right-2 z-10 flex flex-col gap-2 max-h-[80%] overflow-y-auto">
        {thumbnailTiles.map((tile) => renderThumbButton(tile, { width: 96, height: 54 }))}
      </div>
    )
  ) : null;

  return (
    <Wrapper className={wrapperClass}>
      {allTiles.length > 0 ? (
        <div className={fullBleed ? "relative w-full h-full flex flex-col" : "relative flex flex-col gap-2"}>
          {fullBleed ? (
            <>
              {thumbStripBlock}
              {focusBlock}
            </>
          ) : (
            <>
              {focusBlock}
              {thumbStripBlock}
            </>
          )}
        </div>
      ) : (
        <div className={fullBleed ? "w-full h-full relative" : "aspect-video rounded-lg overflow-hidden relative"}>
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-fuchsia-900 to-amber-900 animate-gradient" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_40%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(255,200,80,0.18),transparent_45%)]" />
          <div className="relative h-full w-full flex flex-col items-center justify-center text-center px-4 gap-3 text-white">
            <div className="relative w-20 h-20 rounded-full bg-white/10 backdrop-blur-md ring-2 ring-white/30 flex items-center justify-center">
              <Trophy className="w-10 h-10 text-amber-300 drop-shadow-lg" />
              <span className="absolute inset-0 rounded-full ring-2 ring-amber-300/40 animate-ping" />
            </div>
            {!isConnected ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-amber-200" />
                <p className="font-semibold text-lg">{t("compConnecting") || "Connexion en cours…"}</p>
              </>
            ) : (
              <>
                <p className="font-bold text-xl">{t("compWaitingTitle") || "En attente du direct"}</p>
                <p className="text-sm text-white/80 max-w-xs">{t("compWaitingDesc") || "La compétition démarrera très bientôt."}</p>
              </>
            )}
          </div>
        </div>
      )}

      {showLocal && isPaused && (
        <div className="absolute inset-2 rounded-lg bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-white gap-2 z-10">
          <div className="w-14 h-14 rounded-full bg-amber-500/30 ring-2 ring-amber-300 flex items-center justify-center">
            <VideoOff className="w-7 h-7 text-amber-200" />
          </div>
          <p className="font-bold">{t("compStreamPaused") || "Direct en pause"}</p>
          <p className="text-xs text-white/70">{t("compStreamPausedDesc") || "Le direct reprend dans un instant."}</p>
        </div>
      )}



      {/* Built-in publisher controls bar (desktop) — can be hidden if parent renders custom UI */}
      {canPublish && !hideBuiltInControls && (
        <div className="hidden md:flex items-center justify-center gap-2 mt-2 flex-wrap">
          {!localStream && isConnected && (
            <Button onClick={handleStart} size="sm" variant="default">
              <VideoIcon className="w-4 h-4 mr-1" /> {t("startCamera") || "Démarrer"}
            </Button>
          )}
          {localStream && (
            <>
              <Button
                onClick={handleToggleMic}
                size="icon"
                variant={isMicOn ? "default" : "destructive"}
                title={isMicOn ? t("muteMic") || "Couper micro" : t("unmuteMic") || "Activer micro"}
              >
                {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </Button>
              <Button
                onClick={handleToggleCamera}
                size="icon"
                variant={isCameraOn ? "default" : "destructive"}
                title={isCameraOn ? t("turnOffCamera") || "Couper caméra" : t("turnOnCamera") || "Activer caméra"}
              >
                {isCameraOn ? <VideoIcon className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </Button>
              <Button
                onClick={handleSwitchCamera}
                size="icon"
                variant="outline"
                title={t("switchCamera") || "Changer caméra"}
              >
                <SwitchCamera className="w-4 h-4" />
              </Button>
              <Button
                onClick={handleStop}
                size="icon"
                variant="destructive"
                title={t("stopStream") || "Arrêter"}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      )}

      {/* Reconnect / buffering fallback : prend toute la zone vidéo et
          informe le spectateur que le flux se rétablit. */}
      {(connectionState === "reconnecting" ||
        connectionState === "failed" ||
        connectionState === "disconnected") && (
        <div className="absolute inset-0 z-[5] bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center gap-3 text-white pointer-events-none">
          <div className="relative w-16 h-16 rounded-full bg-white/10 ring-2 ring-white/30 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-300" />
            <span className="absolute inset-0 rounded-full ring-2 ring-amber-300/40 animate-ping" />
          </div>
          <p className="font-bold text-base">
            {t("compReconnecting") || "Reconnexion en cours…"}
          </p>
          <p className="text-xs text-white/70 max-w-xs text-center px-3">
            {t("compReconnectingDesc") ||
              "Le direct se rétablit automatiquement, restez sur la page."}
          </p>
        </div>
      )}

      {/* Tiny connection indicator */}
      {!isConnected && connectionState && (
        <div className="absolute top-2 left-2 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded z-[6]">
          {connectionState}
        </div>
      )}

    </Wrapper>
  );
};

const RemoteVideo = ({ stream, className }: { stream: MediaStream; className?: string }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay playsInline className={className || "w-full aspect-video bg-black rounded object-cover"} />;
};

export default CompetitionLiveStage;
