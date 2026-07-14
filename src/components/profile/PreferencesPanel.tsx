/**
 * Panel préférences utilisateur : timezone, langue (FR/EN), thème, notifications. Persisté via
 * `useUiPreferences` (localStorage + DB sync).
 */
import { VisualNotificationPreferences } from "./VisualNotificationPreferences";
import { CurrencySelector } from "./CurrencySelector";

const PreferencesPanel = () => (
  <div className="space-y-6">
    <CurrencySelector />
    <VisualNotificationPreferences />
  </div>
);

export default PreferencesPanel;
