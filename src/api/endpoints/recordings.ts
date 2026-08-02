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
}

/** État d'enregistrement d'un événement (mode admin + enregistrement en cours). */
export function getRecordingStatus(sourceType: RecordingSource, sourceId: string): Promise<RecordingStatus> {
  return http.get<RecordingStatus>("/recordings/status", { query: { sourceType, sourceId } });
}

/** L'hôte/manager lance l'enregistrement (mode `manual`). */
export function startRecording(sourceType: RecordingSource, sourceId: string): Promise<RecordingStatus> {
  return http.post<RecordingStatus>("/recordings/start", { sourceType, sourceId });
}

/** L'hôte/manager arrête l'enregistrement. */
export function stopRecording(sourceType: RecordingSource, sourceId: string): Promise<RecordingStatus> {
  return http.post<RecordingStatus>("/recordings/stop", { sourceType, sourceId });
}
