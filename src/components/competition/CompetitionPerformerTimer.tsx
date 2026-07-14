/**
 * Compétition: CompetitionPerformerTimer — chrono visible par tous,
 * piloté par le manager qui désigne le candidat en cours et la durée.
 *
 * EN — Shared timer driven by the manager; visible to everyone during
 * the live so spectators know how long the candidate has on stage.
 */
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Timer } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  startedAt?: string | null;
  durationSec?: number | null;
  performerName?: string | null;
}

export const CompetitionPerformerTimer = ({ startedAt, durationSec, performerName }: Props) => {
  const { t } = useLanguage();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return null;

  const elapsedSec = Math.floor((now - new Date(startedAt).getTime()) / 1000);
  const remaining = (durationSec || 0) - elapsedSec;
  const display = remaining > 0
    ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
    : "00:00";
  const isDone = remaining <= 0;

  return (
    <Card className={isDone ? "border-destructive" : "border-primary"}>
      <CardContent className="p-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          <p>{t("compCurrentPerformer")}</p>
          <p className="font-semibold text-foreground">{performerName || "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4" />
          <span className={`text-xl font-bold tabular-nums ${isDone ? "text-destructive animate-pulse" : ""}`}>{display}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default CompetitionPerformerTimer;
