/**
 * Timer durée concert basé sur `useConcertDuration` (start/end DB), affichage countdown + alerte fin.
 */
import { Clock } from "lucide-react";
import { useConcertDuration } from "@/hooks/useConcertDuration";

interface ConcertDurationTimerProps {
  startedAt: string | null;
  isLive: boolean;
}

export const ConcertDurationTimer = ({ startedAt, isLive }: ConcertDurationTimerProps) => {
  const { formattedDuration } = useConcertDuration(startedAt, isLive);

  if (!isLive) return null;

  return (
    <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-sm font-mono">
      <Clock className="w-4 h-4 text-primary" />
      <span>{formattedDuration}</span>
    </div>
  );
};
