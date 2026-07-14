/**
 * EmptyState — Reusable styled empty placeholder for list pages.
 *
 * Affiche une carte centrée plein écran avec icône animée, titre, description
 * et action optionnelle. Garantit que le footer ne remonte pas (min-h fluide).
 *
 * EN — Styled empty placeholder used across listing pages (competitions,
 * duels, lifestyle, replays, artists, etc.). Includes glow/animated icon and
 * preserves layout height so the footer stays at the bottom.
 */
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void; variant?: "default" | "outline" };
  className?: string;
  /** Full viewport height (centered on the page) — default true */
  fullHeight?: boolean;
}

export const EmptyState = ({
  icon,
  title,
  description,
  action,
  className,
  fullHeight = true,
}: EmptyStateProps) => {
  return (
    <div
      className={cn(
        "flex items-center justify-center w-full",
        fullHeight && "min-h-[55vh]",
        className,
      )}
    >
      <div className="relative max-w-md w-full mx-auto text-center px-6 py-12">
        {/* Glow halo */}
        <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
          <div className="w-64 h-64 rounded-full bg-gradient-primary opacity-20 blur-3xl animate-pulse" />
        </div>

        {/* Icon disc */}
        <div className="relative mx-auto mb-6 w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-accent/20 border border-primary/30 flex items-center justify-center shadow-glow">
          <div className="absolute -top-1 -right-1 text-primary animate-pulse">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="text-primary [&>svg]:w-12 [&>svg]:h-12">
            {icon || <Sparkles className="w-12 h-12" />}
          </div>
        </div>

        <h3 className="text-2xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
          {title}
        </h3>
        {description && (
          <p className="text-muted-foreground text-sm md:text-base mb-6 leading-relaxed">
            {description}
          </p>
        )}
        {action && (
          <Button
            onClick={action.onClick}
            variant={action.variant || "default"}
            className={
              action.variant === "outline"
                ? ""
                : "bg-gradient-primary hover:shadow-glow transition-all"
            }
          >
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
};

export default EmptyState;
