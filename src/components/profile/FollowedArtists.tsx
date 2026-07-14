/**
 * Artistes suivis par l'utilisateur (`artist_followers` + `get_display_profiles` RPC). Unfollow inline, lien vers `ArtistPublicProfile`.
 */
import { useState, useEffect } from "react";
import * as users from "@/api/endpoints/users";
import * as creators from "@/api/endpoints/creators";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Music2, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface FollowedArtist {
  artist_id: string;
  stage_name: string | null;
  avatar_url: string | null;
  full_name: string | null;
  followers_count: number;
}

interface FollowedArtistsProps {
  userId: string;
}

export const FollowedArtists = ({ userId }: FollowedArtistsProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [artists, setArtists] = useState<FollowedArtist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFollowedArtists();
  }, [userId]);

  const loadFollowedArtists = async () => {
    try {
      const followedIds = (await users.myFollowing()) as unknown as string[];
      if (!followedIds || followedIds.length === 0) {
        setArtists([]);
        setLoading(false);
        return;
      }

      const followedSet = new Set(followedIds);
      const allArtists = await creators.listArtists();
      const enrichedArtists: FollowedArtist[] = (allArtists || [])
        .filter((a: any) => followedSet.has(a.user_id))
        .map((a: any) => ({
          artist_id: a.user_id,
          stage_name: a.stage_name ?? null,
          avatar_url: a.avatar_url ?? null,
          full_name: a.full_name ?? null,
          followers_count: Number(a.followers_count) || 0,
        }));

      setArtists(enrichedArtists);
    } catch (error) {
      console.error("Error loading followed artists:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnfollow = async (artistId: string) => {
    try {
      await users.unfollow(artistId);
      setArtists(prev => prev.filter(a => a.artist_id !== artistId));
    } catch (error) {
      console.error("Error unfollowing:", error);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Music2 className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">{t("profileFollowedTitle")}</h3>
        </div>
        <p className="text-muted-foreground text-center py-4">{t("profileFollowedLoading")}</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Music2 className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">{t("profileFollowedTitle")} ({artists.length})</h3>
      </div>

      {artists.length === 0 ? (
        <div className="text-center py-8">
          <Music2 className="w-12 h-12 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-muted-foreground mb-4">{t("profileFollowedNone")}</p>
          <Button variant="outline" onClick={() => navigate("/artists")}>
            {t("profileFollowedDiscover")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {artists.map((artist) => (
            <div
              key={artist.artist_id}
              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
            >
              <Avatar 
                className="w-12 h-12 cursor-pointer"
                onClick={() => navigate(`/artist/${artist.artist_id}`)}
              >
                <AvatarImage src={artist.avatar_url || ""} />
                <AvatarFallback className="bg-primary/20 text-primary">
                  {(artist.stage_name || artist.full_name)?.[0]?.toUpperCase() || "A"}
                </AvatarFallback>
              </Avatar>
              <div 
                className="flex-1 cursor-pointer"
                onClick={() => navigate(`/artist/${artist.artist_id}`)}
              >
                <p className="font-medium">
                  {artist.stage_name || artist.full_name || t("profileFollowedDefaultName")}
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {artist.followers_count} {t("profileFollowedSubscribers")}
                </p>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => handleUnfollow(artist.artist_id)}
              >
                {t("profileFollowedUnfollow")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};