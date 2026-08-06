/**
 * SponsorDeadlineControl
 * ----------------------
 * Petit contrôle réutilisable qui laisse un manager (compétitions/duels)
 * ou un artiste (concerts) fixer la date/heure limite de soumission
 * de demandes de sponsoring. La date est stockée dans la colonne
 * `sponsor_submission_deadline` de la table cible.
 */
import { useState } from "react";
import * as sponsors from "@/api/endpoints/sponsors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { getUiPrefs } from "@/hooks/useUiPreferences";
import { formatTz, toTzInputValue, toWireUtc } from "@/lib/datetime";

interface Props {
  table: "competitions" | "duels" | "concerts" | "artist_concerts";
  rowId: string;
  currentValue?: string | null;
  onSaved?: (iso: string | null) => void;
}

export const SponsorDeadlineControl = ({ table, rowId, currentValue, onSaved }: Props) => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const tz = getUiPrefs().timezone;
  const [value, setValue] = useState<string>(toTzInputValue(currentValue, tz));
  const [busy, setBusy] = useState(false);

  // table → the backend `eventType` enum. All four event types carry a
  // `sponsor_submission_deadline` column (artist_concerts added via migration).
  const EVENT_TYPE: Record<string, string> = {
    competitions: "competition",
    duels: "duel",
    concerts: "concert",
    artist_concerts: "artist_concert",
  };

  const persistDeadline = async (deadline: string | null) => {
    const eventType = EVENT_TYPE[table];
    if (!eventType) throw new Error(t("sponsorDeadlineUnsupported") || "Not available for this event type");
    await sponsors.setDeadline({ eventType, eventId: rowId, deadline });
  };

  const save = async () => {
    if (!value) return;
    setBusy(true);
    const iso = toWireUtc(value, tz);
    try {
      await persistDeadline(iso);
      toast({ title: t("sponsorDeadlineSaved") || "Deadline saved" });
      onSaved?.(iso);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await persistDeadline(null);
      setValue("");
      onSaved?.(null);
    } catch {
      /* leave value as-is on failure */
    } finally {
      setBusy(false);
    }
  };

  const isPast = currentValue ? new Date(currentValue).getTime() < Date.now() : false;

  return (
    <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
      <Label className="flex items-center gap-2 text-sm">
        <CalendarClock className="w-4 h-4 text-primary" />
        {t("closeSponsorRequests") || "Clôturer les candidatures sponsor"}
      </Label>
      <p className="text-xs text-muted-foreground">
        {t("sponsorDeadline") || "Date de fin des candidatures sponsor"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-auto flex-1 min-w-[200px]"
        />
        <Button size="sm" onClick={save} disabled={busy || !value}>
          <Save className="w-4 h-4 mr-1" /> {t("save") || "Enregistrer"}
        </Button>
        {currentValue && (
          <Button size="sm" variant="ghost" onClick={clear} disabled={busy}>
            {t("clear") || "Effacer"}
          </Button>
        )}
      </div>
      {currentValue && (
        <Badge variant={isPast ? "destructive" : "outline"}>
          {isPast ? (t("sponsorDeadlinePassed") || "Candidatures clôturées") : formatTz(currentValue, "dd/MM/yyyy HH:mm", { timezone: tz, language })}
        </Badge>
      )}
    </div>
  );
};

export default SponsorDeadlineControl;
