import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import * as usersApi from "@/api/endpoints/users";
import * as lifestyle from "@/api/endpoints/lifestyle";
import * as concertsApi from "@/api/endpoints/concerts";
import * as creatorsApi from "@/api/endpoints/creators";
import { listDuels } from "@/api/endpoints/duels";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Instagram, Twitter, Youtube, Facebook, Music, Calendar, Swords, Users, Play } from "lucide-react";
import { ShareButton } from "@/components/sharing/ShareButton";
import { motion } from "framer-motion";
import { ImageZoomDialog } from "@/components/ui/image-zoom-dialog";
import { PriceBadge } from "@/components/profile/PriceBadge";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import SEO from "@/components/seo/SEO";
import { AccountReportButton } from "@/components/streaming/AccountReportButton";
import { CountryBadge } from "@/components/profile/CountryBadge";
interface ArtistProfile {
  id: string;
  user_id: string;
  stage_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  social_links: {
    instagram?: string;
    twitter?: string;
    youtube?: string;
    facebook?: string;
    tiktok?: string;
  } | null;
  total_earnings: number | null;
}

interface Concert {
  id: string;
  title: string;
  scheduled_date: string;
  cover_image_url: string | null;
  ticket_price: number;
  status: string;
}

interface Duel {
  id: string;
  scheduled_time: string | null;
  status: string;
}

interface LifestyleVideo {
  id: string;
  title: string;
  thumbnail_url: string | null;
  views_count: number;
  duration: string;
}

const ArtistPublicProfile = () => {
  const { id } = useParams();
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const fmtDt = (d: string) => formatTz(d, "dd MMM yyyy HH:mm", { timezone: tz, language });
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [videos, setVideos] = useState<LifestyleVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [followerCount, setFollowerCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const { user: currentUser } = useAuth();

  useEffect(() => {
    const fetchProfile = async () => {
      if (!id) return;

      // Fetch public profile (profile + artistProfile + followerCount + isFollowing)
      let pub: usersApi.PublicProfile | null = null;
      try {
        pub = await usersApi.getPublicProfile(id);
      } catch {
        pub = null;
      }

      const artistProfile = pub?.artistProfile as any;

      // If not an artist, fall back to a public manager profile
      // (GET /managers/:id). We reuse the artist profile layout, mapping the
      // manager's display_name → stage_name.
      if (!artistProfile) {
        try {
          const mgr = await creatorsApi.getManagerById(id);
          if (mgr) {
            setProfile({
              id: (mgr.id as string) || id,
              user_id: (mgr.user_id as string) || id,
              stage_name: (mgr.display_name as string) ?? null,
              bio: (mgr.bio as string) ?? null,
              avatar_url: (mgr.avatar_url as string) ?? null,
              cover_image_url: (mgr.cover_image_url as string) ?? null,
              social_links: (mgr.social_links as ArtistProfile["social_links"]) ?? null,
              total_earnings: null,
            });
            setUserProfile(
              pub?.profile ?? {
                full_name: mgr.full_name,
                avatar_url: mgr.avatar_url,
                country_code: mgr.country_code,
              },
            );
            setFollowerCount(pub?.followerCount || 0);
            setIsFollowing(pub?.isFollowing ?? false);
          }
        } catch {
          /* no manager profile either — falls through to the not-found screen */
        }
        setLoading(false);
        return;
      } else {
        setProfile({
          ...artistProfile,
          social_links: artistProfile.social_links as ArtistProfile["social_links"]
        });
      }

      // User profile for name/avatar fallback (+ follower/follow state)
      if (pub?.profile) setUserProfile(pub.profile);
      setFollowerCount(pub?.followerCount || 0);
      setIsFollowing(pub?.isFollowing ?? false);

      // Fetch concerts
      try {
        const concertsData = await concertsApi.listArtistConcerts({ artistId: id });
        if (concertsData) setConcerts(concertsData.slice(0, 6) as unknown as Concert[]);
      } catch {
        /* non-blocking */
      }

      // Duels this artist takes part in (either combatant), newest first.
      try {
        const duelsData = (await listDuels({ artistId: id, limit: 6 })) as unknown as Duel[];
        if (duelsData) setDuels(duelsData.slice(0, 6));
      } catch {
        /* non-blocking: leave the duels section empty on failure */
      }

      // Fetch lifestyle videos
      try {
        const videosData = await lifestyle.listVideos({ artistId: id });
        if (videosData) setVideos(videosData.slice(0, 6) as unknown as LifestyleVideo[]);
      } catch {
        /* non-blocking */
      }

      setLoading(false);
    };

    fetchProfile();
  }, [id]);

  const handleFollow = async () => {
    if (!currentUser) {
      return;
    }
    
    if (!id) return;
    if (isFollowing) {
      await usersApi.unfollow(id);
      setIsFollowing(false);
      setFollowerCount(prev => prev - 1);
    } else {
      await usersApi.follow(id);
      setIsFollowing(true);
      setFollowerCount(prev => prev + 1);
    }
  };

  const getSocialIcon = (platform: string) => {
    switch (platform) {
      case "instagram": return <Instagram className="w-5 h-5" />;
      case "twitter":
      case "x": return <Twitter className="w-5 h-5" />;
      case "youtube": return <Youtube className="w-5 h-5" />;
      case "facebook": return <Facebook className="w-5 h-5" />;
      default: return <Music className="w-5 h-5" />;
    }
  };

  /**
   * Normalise une valeur de lien social en URL absolue cliquable.
   * Les artistes saisissent parfois un `@handle` (ou un nom d'utilisateur nu) plutôt
   * qu'une URL complète — sans ce préfixe, le `href` serait relatif et cassé.
   */
  const normalizeSocialUrl = (platform: string, value: string): string => {
    const v = value.trim();
    if (/^https?:\/\//i.test(v)) return v;
    const handle = v.replace(/^@/, "");
    switch (platform) {
      case "instagram": return `https://instagram.com/${handle}`;
      case "tiktok": return `https://tiktok.com/@${handle}`;
      case "twitter":
      case "x": return `https://x.com/${handle}`;
      case "youtube": return `https://youtube.com/@${handle}`;
      case "facebook": return `https://facebook.com/${handle}`;
      case "spotify": return `https://open.spotify.com/${handle}`;
      default: return `https://${v}`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t("loadingProfile")}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 pt-24 pb-16 text-center">
          <h1 className="text-2xl font-bold mb-4">{t("profileNotFound")}</h1>
          <p className="text-muted-foreground mb-6">{t("profileNotFoundDesc")}</p>
          <Link to="/">
            <Button>{t("backToHome2")}</Button>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const displayName = profile.stage_name || userProfile?.full_name || t("artistDefault");
  const avatarUrl = profile.avatar_url || userProfile?.avatar_url;

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${profile.stage_name || "Artiste"} — Dual Music`}
        description={(profile.bio || `Découvrez ${profile.stage_name} sur Dual Music. Concerts, duels, lifestyle et plus.`).slice(0, 160)}
        path={`/artist/${profile.user_id}`}
        image={profile.avatar_url || profile.cover_image_url || undefined}
        type="profile"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "MusicGroup",
          name: profile.stage_name,
          description: profile.bio || undefined,
          image: profile.avatar_url || undefined,
          url: `https://rhythm-remix-arena.lovable.app/artist/${profile.user_id}`,
        }}
      />
      <Header />
      
      {/* Cover Image */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative h-80 bg-gradient-to-b from-primary/30 to-background"
      >
        {profile.cover_image_url && (
          <ImageZoomDialog src={profile.cover_image_url} alt="Cover">
            <img 
              src={profile.cover_image_url} 
              alt="Cover" 
              className="absolute inset-0 w-full h-full object-cover cursor-zoom-in"
            />
          </ImageZoomDialog>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background pointer-events-none" />
      </motion.div>

      <main className="container mx-auto px-4 -mt-24 relative z-10 pb-16">
        {/* Profile Header */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col md:flex-row items-center md:items-end gap-6 mb-8"
        >
          <ImageZoomDialog src={avatarUrl || ""} alt={displayName}>
            <Avatar className="w-40 h-40 border-4 border-background shadow-xl cursor-zoom-in">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="text-4xl">{displayName[0]}</AvatarFallback>
            </Avatar>
          </ImageZoomDialog>
          
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-4xl font-bold mb-2">{displayName}</h1>
            <div className="flex flex-wrap justify-center md:justify-start gap-4 mb-4">
              <Badge variant="secondary" className="text-sm">
                <Users className="w-4 h-4 mr-1" />
                {followerCount.toLocaleString()} {t("fansLabel")}
              </Badge>
              <Badge variant="secondary" className="text-sm">
                <Swords className="w-4 h-4 mr-1" />
                {duels.length} {t("duelsLabel")}
              </Badge>
              <Badge variant="secondary" className="text-sm">
                <Calendar className="w-4 h-4 mr-1" />
                {concerts.length} {t("concertsLabel")}
              </Badge>
              {userProfile?.country_code && (
                <CountryBadge countryCode={userProfile.country_code} size="sm" />
              )}
            </div>
            
            {/* Social Links */}
            {profile.social_links && Object.keys(profile.social_links).length > 0 && (
              <div className="flex flex-wrap justify-center md:justify-start gap-3">
                {Object.entries(profile.social_links).map(([platform, url]) => url && (
                  <a
                    key={platform}
                    href={normalizeSocialUrl(platform, String(url))}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={platform.charAt(0).toUpperCase() + platform.slice(1)}
                    aria-label={platform}
                    className="p-2 rounded-full bg-card hover:bg-primary/20 transition-colors"
                  >
                    {getSocialIcon(platform)}
                  </a>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <ShareButton contentType="artist_profile" contentId={id!} title={displayName} />
            <Button 
              onClick={handleFollow}
              className={isFollowing ? "bg-muted hover:bg-muted/80" : "bg-gradient-primary hover:shadow-glow"}
            >
              {isFollowing ? t("followingBtn") : t("followBtn")}
            </Button>
            {currentUser && currentUser.id !== id && (
              <AccountReportButton
                reportedUserId={id!}
                reportedUserName={displayName}
                variant="outline"
                size="sm"
              />
            )}
          </div>
        </motion.div>

        {/* Bio */}
        {profile.bio && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="mb-8">
              <CardContent className="pt-6">
                <p className="text-muted-foreground whitespace-pre-wrap">{profile.bio}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Lifestyle Videos */}
        {videos.length > 0 && (
          <motion.section
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mb-8"
          >
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Play className="w-6 h-6 text-primary" />
              {t("lifestyleSection")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {videos.map((video) => (
                <Link key={video.id} to={`/video/${video.id}`}>
                  <Card className="overflow-hidden hover:border-primary transition-colors">
                    <div className="aspect-video bg-muted relative">
                      {video.thumbnail_url && (
                        <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
                      )}
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                        {video.duration}
                      </div>
                    </div>
                    <CardContent className="p-3">
                      <h3 className="font-medium truncate">{video.title}</h3>
                      <p className="text-sm text-muted-foreground">{video.views_count.toLocaleString()} {t("viewsLabel")}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </motion.section>
        )}

        {/* Concerts */}
        {concerts.length > 0 && (
          <motion.section
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mb-8"
          >
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-primary" />
              {t("upcomingConcerts")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {concerts.map((concert) => (
                <Link key={concert.id} to={`/concert/${concert.id}`}>
                  <Card className="overflow-hidden hover:border-primary transition-colors">
                    <div className="aspect-video bg-muted relative">
                      {concert.cover_image_url && (
                        <img src={concert.cover_image_url} alt={concert.title} className="w-full h-full object-cover" />
                      )}
                      <Badge className="absolute top-2 left-2">{concert.status}</Badge>
                    </div>
                    <CardContent className="p-3">
                      <h3 className="font-medium truncate">{concert.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {fmtDt(concert.scheduled_date)}
                      </p>
                      <div className="mt-1"><PriceBadge credits={Number(concert.ticket_price) || 0} size="sm" /></div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </motion.section>
        )}

        {/* Duels */}
        {duels.length > 0 && (
          <motion.section
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Swords className="w-6 h-6 text-primary" />
              Duels
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {duels.map((duel) => (
                <Link key={duel.id} to={`/duel/${duel.id}`}>
                  <Card className="hover:border-primary transition-colors p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Badge variant={duel.status === "live" ? "default" : "secondary"}>
                          {duel.status === "live" ? t("liveNow") : duel.status === "ended" ? t("ended") : t("upcoming")}
                        </Badge>
                        {duel.scheduled_time && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {fmtDt(duel.scheduled_time)}
                          </p>
                        )}
                      </div>
                      <Button variant="outline" size="sm">
                        {t("seeDuel")}
                      </Button>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </motion.section>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default ArtistPublicProfile;