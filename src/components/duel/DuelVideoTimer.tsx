/**
 * Timer duel en DB (`duels.timer_state`) : phases warmup/round1/round2/voting, broadcast Realtime à tous les viewers.
 */
import { memo } from "react";
import { Timer } from "lucide-react";

interface DuelVideoTimerProps {
  targetUserId: string;
  activeTargetId: string | null;
  remaining: number;
}

const DuelVideoTimerInner = ({ targetUserId, activeTargetId, remaining }: DuelVideoTimerProps) => {
  // Only show if this timer target matches and there's time remaining
  if (activeTargetId !== targetUserId || remaining <= 0) return null;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div
      className="absolute top-1 sm:top-2 left-1/2 -translate-x-1/2 z-30 rounded-full px-2 sm:px-4 py-0.5 sm:py-1.5 flex items-center gap-1 sm:gap-2 pointer-events-none border border-primary/50 shadow-lg"
      style={{ backgroundColor: "hsl(var(--background) / 0.75)", backdropFilter: "blur(8px)" }}
    >
      <Timer className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
      <span className={`text-xs sm:text-base font-bold tabular-nums ${remaining <= 10 ? "text-destructive animate-pulse" : "text-foreground"}`}>
        {minutes}:{String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
};

export const DuelVideoTimer = memo(DuelVideoTimerInner);