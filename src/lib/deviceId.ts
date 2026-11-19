/**
 * Identifiant stable de CET onglet/appareil, envoyé au backend avec chaque demande de jeton
 * LiveKit. Le SFU n'accepte qu'une connexion par identité et par room : sans ce suffixe, le
 * même compte ouvert sur le web et sur le mobile (ou dans deux onglets) s'éjectait en boucle
 * (`DUPLICATE_IDENTITY`) — audio qui « disparaît » pour certains participants seulement.
 *
 * `sessionStorage` = un id par onglet (deux onglets du même navigateur restent distincts) ;
 * repli mémoire si le stockage est indisponible (navigation privée stricte).
 *
 * @module lib/deviceId
 */

const KEY = "dm_device_id";
let memory: string | null = null;

function random(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return Math.random().toString(36).slice(2, 18);
}

/** Retourne l'identifiant d'appareil (créé au premier appel). */
export function getDeviceId(): string {
  if (memory) return memory;
  try {
    const stored = sessionStorage.getItem(KEY);
    if (stored) {
      memory = stored;
      return stored;
    }
    const fresh = random();
    sessionStorage.setItem(KEY, fresh);
    memory = fresh;
    return fresh;
  } catch {
    memory = random();
    return memory;
  }
}
