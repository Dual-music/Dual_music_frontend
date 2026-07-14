# Plan — Corrections compétitions & sponsors

## 1. Commentaires mobile pour compétitions
Sur mobile, `MobileStreamOverlay` (utilisé sur `CompetitionLive`) doit passer `chatType="competition"` à `ThreadedChat`. À vérifier + corriger si absent, sinon les messages restent chargés depuis `live_chat_messages`.

## 2. Clôturer une demande de sponsor (Manager — duel/compétition)
Dans `ManagerCompetitionsPanel` et gestion duels côté manager :
- Ajouter un bouton **"Clôturer la demande sponsor"** avec un `DateTimePicker` (date + heure de fin).
- Nouvelle colonne `sponsor_submission_deadline TIMESTAMPTZ` sur `competitions` et `duels`.
- Edge/RLS: filtrer côté `SponsorRequestSection` pour bloquer les soumissions après cette date.

## 3. Clôturer une demande de sponsor (Artiste — concert)
Idem sur `ArtistConcertManager` :
- Colonne `sponsor_submission_deadline` sur `concerts`.
- UI de saisie + affichage du deadline aux sponsors.

## 4. Traduction `noGiftsInInventory` dans la partie compétition
Dans `CompetitionGiftPanel`, remplacer l'affichage brut de la clé par `t("noGiftsInInventory")`. Ajouter la clé FR/EN dans `LanguageContext` si absente.

## 5. Onglets Compétitions & bouton d'accès
Dans `Competitions.tsx` :
- Reclasser: `status === 'live'` → tab **Direct** (retirer de "À venir").
- Bouton dynamique :
  - Compétition gratuite (`is_paid=false`) → **"Voir le direct"**.
  - Ticket déjà acheté (`competition_tickets` pour `auth.uid()`) → **"Voir le direct"**.
  - Sinon → **"Acheter un ticket"**.

## 6. Layout vidéo compétition en ligne (mobile + PC)
Refonte de `CompetitionLiveStage` :
- **Vue par défaut** : une case "focus" grande + strip de miniatures (manager + artistes) en bas ou côté.
- **Fan** peut tap/click sur une miniature pour la remonter en focus.
- **Manager** dispose d'un bouton "Imposer cette case" → broadcast (nouvelle table `competition_focus` ou colonne `forced_focus_participant_id` sur `competitions`, mise à jour en realtime). Quand posé, tous les spectateurs suivent (avec possibilité de revenir en libre pour le fan si non-verrouillé).
- Toggle **"Masquer/afficher les mini cases"** pour se concentrer sur la case focus.
- Éviter la disposition côte-à-côte égale du screenshot mobile.
- Sur PC : élargir la zone vidéo (retirer/rétrécir sidebars, pleine largeur > 1024px, et fullscreen réellement fullscreen).

## Détails techniques

- **Migrations**:
  - `ALTER TABLE competitions ADD COLUMN sponsor_submission_deadline TIMESTAMPTZ, ADD COLUMN forced_focus_participant_id UUID;`
  - `ALTER TABLE duels ADD COLUMN sponsor_submission_deadline TIMESTAMPTZ;`
  - `ALTER TABLE concerts ADD COLUMN sponsor_submission_deadline TIMESTAMPTZ;`
- **Realtime**: subscription supabase sur `competitions` pour propager `forced_focus_participant_id`.
- **i18n**: ajouter `noGiftsInInventory`, `sponsorDeadline`, `closeSponsorRequests`, `watchLive`, `forceFocus`, `hideThumbnails` dans `LanguageContext`.
- **Composants touchés**: `Competitions.tsx`, `CompetitionLive.tsx`, `CompetitionLiveStage.tsx`, `CompetitionGiftPanel.tsx`, `MobileStreamOverlay.tsx`, `ManagerCompetitionsPanel.tsx`, `ArtistConcertManager.tsx`, `DuelManagement.tsx`, `SponsorRequestSection.tsx`.

## Ordre d'exécution
1. Migration DB (3 colonnes).
2. Correctifs rapides #1, #4, #5.
3. Sponsor deadline #2, #3.
4. Refonte layout vidéo #6 (le plus lourd).
