/**
 * Bouton suivre/ne plus suivre artiste : toggle sur `followers` table, déclenche
 * `AuthRequiredDialog` si non connecté.
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getPublicProfile, follow, unfollow } from "@/api/endpoints/users";
import { UserPlus, UserCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface FollowArtistButtonProps {
  artistId: string;
  currentUserId: string;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "default";
}

export const FollowArtistButton = ({
  artistId,
  currentUserId,
  size = "sm",
  variant = "outline",
}: FollowArtistButtonProps) => {
  const { t } = useLanguage();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const { isFollowing: following } = await getPublicProfile(artistId);
        if (!cancelled) setIsFollowing(!!following);
      } catch {
        if (!cancelled) setIsFollowing(false);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [artistId, currentUserId]);

  const toggleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      if (isFollowing) {
        await unfollow(artistId);
        setIsFollowing(false);
      } else {
        await follow(artistId);
        setIsFollowing(true);
      }
    } catch {
      // ignore — leave state unchanged on failure
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size={size}
      variant={isFollowing ? "secondary" : variant}
      onClick={toggleFollow}
      disabled={loading}
      className="gap-1"
    >
    {isFollowing ? (
        <>
          <UserCheck className="w-3.5 h-3.5" />
          {t("following")}
        </>
      ) : (
        <>
          <UserPlus className="w-3.5 h-3.5" />
          {t("follow")}
        </>
      )}
    </Button>
  );
};
