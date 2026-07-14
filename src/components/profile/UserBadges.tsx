/**
 * Affiche badges donateur de l'utilisateur (`user_badges`), assignés mensuellement par l'edge `assign-monthly-badges` (CRON).
 */
import { useQuery } from "@tanstack/react-query";
import * as users from "@/api/endpoints/users";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface UserBadgesProps {
  userId: string;
  compact?: boolean;
}

const badgeStyles: Record<string, { bg: string; border: string }> = {
  top1_monthly: { bg: "from-yellow-400 to-amber-500", border: "border-yellow-400" },
  top3_monthly: { bg: "from-gray-300 to-gray-400", border: "border-gray-400" },
  top10_monthly: { bg: "from-amber-600 to-orange-700", border: "border-amber-600" },
  generous: { bg: "from-pink-400 to-rose-500", border: "border-pink-400" },
  super_generous: { bg: "from-purple-400 to-violet-500", border: "border-purple-400" },
  legendary_donor: { bg: "from-red-500 to-orange-500", border: "border-red-500" },
};

export const UserBadges = ({ userId, compact = false }: UserBadgesProps) => {
  const { data: badges } = useQuery({
    queryKey: ["user-badges", userId],
    queryFn: async () => {
      return (await users.getBadges(userId)) as any[];
    },
    enabled: !!userId,
  });

  if (!badges || badges.length === 0) return null;

  const displayBadges = compact ? badges.slice(0, 3) : badges;

  return (
    <div className="flex flex-wrap gap-1.5">
      {displayBadges.map((badge) => {
        const style = badgeStyles[badge.badge_type] || badgeStyles.generous;
        return (
          <Tooltip key={badge.id}>
            <TooltipTrigger>
              <Badge
                className={`bg-gradient-to-r ${style.bg} text-white border-0 text-xs px-2 py-0.5 cursor-default`}
              >
                {badge.badge_icon} {compact ? "" : badge.badge_name}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-semibold">{badge.badge_name}</p>
              {badge.month_year && (
                <p className="text-xs text-muted-foreground">{badge.month_year}</p>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {compact && badges.length > 3 && (
        <Badge variant="outline" className="text-xs">
          +{badges.length - 3}
        </Badge>
      )}
    </div>
  );
};
