/**
 * Pilotage de l'enregistrement serveur (LiveKit Egress) d'un direct.
 * Le mode par type d'événement est choisi par l'admin (`recording_config`) :
 * off (rien) · auto (automatique au passage en live) · manual (l'hôte lance).
 */
import { http } from "../http";

export type RecordingMode = "off" | "auto" | "manual";
export type RecordingSource = "live" | "duel" | "concert" | "competition";

export interface RecordingStatus {
  mode: RecordingMode;
  active: boolean;
  /** En pause (LiveKit egress n'a pas de vraie pause : le segment en cours a été arrêté). */
  paused: boolean;
  /** Sauvegarde en cours (dernier segment en cours de clôture / recollage ffmpeg). */
  finalizing: boolean;
  /** Un enregistrement récent a échoué (segment jamais démarré, aucun segment récupérable au
   *  moment de la sauvegarde…) — affiché une fois, `error` porte le détail technique. */
  failed: boolean;
  error: string | null;
  /** Durée cumulée des segments déjà clos (secondes) — additionner le temps écoulé depuis
   *  `runStartedAt` quand `active` est vrai pour obtenir le chrono live. */
  accumulatedSeconds: number;
  /** Horodatage ISO de départ du segment EN COURS (null si en pause / rien en cours). */
  runStartedAt: string | null;
}

/** État d'enregistrement d'un événement (mode admin + enregistrement en cours + chrono). */
export function getRecordingStatus(sourceType: RecordingSource, sourceId: string): Promise<RecordingStatus> {
  return http.get<RecordingStatus>("/recordings/status", { query: { sourceType, sourceId } });
}

/** L'hôte/manager lance l'enregistrement (mode `manual`). */
export function startRecording(sourceType: RecordingSource, sourceId: string): Promise<RecordingStatus> {
  return http.post<RecordingStatus>("/recordings/start", { sourceType, sourceId });
}

/** Met en pause (arrête le segment en cours ; `resumeRecording` en ouvrira un nouveau). */
export function pauseRecording(sourceType: RecordingSource, sourceId: string): Promise<RecordingStatus> {
  return http.post<RecordingStatus>("/recordings/pause", { sourceType, sourceId });
}

/** Reprend un enregistrement en pause (nouveau segment sous la même session). */
export function resumeRecording(sourceType: RecordingSource, sourceId: string): Promise<RecordingStatus> {
  return http.post<RecordingStatus>("/recordings/resume", { sourceType, sourceId });
}

/** Annule tout l'enregistrement en cours — aucun replay n'est créé. */
export function cancelRecording(sourceType: RecordingSource, sourceId: string): Promise<RecordingStatus> {
  return http.post<RecordingStatus>("/recordings/cancel", { sourceType, sourceId });
}

/** L'hôte/manager sauvegarde l'enregistrement (les segments sont recollés en un seul fichier). */
export function stopRecording(sourceType: RecordingSource, sourceId: string): Promise<RecordingStatus> {
  return http.post<RecordingStatus>("/recordings/stop", { sourceType, sourceId });
}
