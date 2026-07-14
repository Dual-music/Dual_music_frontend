/**
 * Visualisation du split d'une transaction (artiste/manager/plateforme) en pourcentages avec barres et badges.
 */
import { Badge } from "@/components/ui/badge";

interface Props {
  total: number;
  myCredits: number;
  platformCredits: number;
  managerCredits?: number;
  artistsCredits?: number;
  compact?: boolean;
}

/**
 * Displays the percentage split for a single revenue distribution row.
 * Inline style — shows what the user (artist/manager) actually receives
 * vs what the platform takes vs (optional) other parties.
 */
export const PercentBreakdown = ({
  total,
  myCredits,
  platformCredits,
  managerCredits = 0,
  artistsCredits = 0,
  compact = false,
}: Props) => {
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
  const myPct = pct(myCredits);
  const platformPct = pct(platformCredits);
  const managerPct = pct(managerCredits);
  const artistsPct = pct(artistsCredits);
  // "Others" = artists + manager that are not "me" (already broken out)
  const othersCredits = Math.max(0, artistsCredits + managerCredits - myCredits);
  const othersPct = pct(othersCredits);

  const cls = compact ? "text-[10px]" : "text-[11px]";

  return (
    <div className={`flex flex-wrap gap-1 ${cls}`}>
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">
        Reçu : {myCredits.toLocaleString()} ({myPct}%)
      </Badge>
      <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300">
        Plateforme : {platformCredits.toLocaleString()} ({platformPct}%)
      </Badge>
      {othersCredits > 0 && (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300">
          Autres : {othersCredits.toLocaleString()} ({othersPct}%)
        </Badge>
      )}
    </div>
  );
};

export default PercentBreakdown;
