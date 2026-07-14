/**
 * Profil public artiste : bio, photos, concerts/lives à venir, replays, lifestyle, bouton suivre
 * (`FollowArtistButton`), partage. Lit `profiles`, `followers`, `concerts`, `lives`,
 * `replay_videos`, `lifestyle_videos`.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getDisplayProfiles, getPublicProfile } from "@/api/endpoints/users";
import { updateArtistProfile } from "@/api/endpoints/creators";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Instagram, Youtube, Twitter, Facebook, Music, Save, Eye, EyeOff, ExternalLink } from "lucide-react";
import { ImageUpload } from "@/components/ui/image-upload";

interface ArtistPublicProfileProps {
  userId: string;
}

interface SocialLinks {
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  twitter?: string;
  facebook?: string;
  spotify?: string;
}

interface ArtistProfile {
  id: string;
  user_id: string;
  stage_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  social_links: SocialLinks;
  is_public: boolean;
  total_earnings: number;
  available_balance: number;
}

export const ArtistPublicProfile = ({ userId }: ArtistPublicProfileProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [formData, setFormData] = useState({
    stage_name: "",
    bio: "",
    avatar_url: "",
    cover_image_url: "",
    is_public: true,
    social_links: {
      instagram: "",
      tiktok: "",
      youtube: "",
      twitter: "",
      facebook: "",
      spotify: ""
    }
  });

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    try {
      const pub = await getPublicProfile(userId);
      const data = pub.artistProfile as any;

      if (data) {
        const socialLinks = (typeof data.social_links === 'object' && data.social_links !== null 
          ? data.social_links 
          : {}) as SocialLinks;
        const profileData: ArtistProfile = {
          ...data,
          stage_name: data.stage_name || null,
          bio: data.bio || null,
          avatar_url: data.avatar_url || null,
          cover_image_url: data.cover_image_url || null,
          social_links: socialLinks,
          is_public: data.is_public ?? true,
          total_earnings: Number(data.total_earnings) || 0,
          available_balance: Number(data.available_balance) || 0
        };
        setProfile(profileData);
        setFormData({
          stage_name: data.stage_name || "",
          bio: data.bio || "",
          avatar_url: data.avatar_url || "",
          cover_image_url: data.cover_image_url || "",
          is_public: data.is_public ?? true,
          social_links: {
            instagram: socialLinks.instagram || "",
            tiktok: socialLinks.tiktok || "",
            youtube: socialLinks.youtube || "",
            twitter: socialLinks.twitter || "",
            facebook: socialLinks.facebook || "",
            spotify: socialLinks.spotify || ""
          }
        });
      }
    } catch (error) {
      console.error("Error loading artist profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Get current profile photo from profiles table (single source of truth)
      const mainProfiles = await getDisplayProfiles([userId]);
      const mainAvatar = mainProfiles[0]?.avatar_url || null;

      // PATCH /artists/me upserts (creates the artist profile if missing).
      await updateArtistProfile({
        stage_name: formData.stage_name || null,
        bio: formData.bio || null,
        avatar_url: mainAvatar,
        cover_image_url: formData.cover_image_url || null,
        is_public: formData.is_public,
        social_links: formData.social_links,
      });

      toast({
        title: "Profil mis à jour",
        description: "Votre profil public a été sauvegardé.",
      });
      
      loadProfile();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">{t("artistProfileLoading")}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Quick access to view public profile */}
      {profile && formData.is_public && (
        <Card className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{t("artistPublicActiveTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("artistPublicActiveDesc")}</p>
            </div>
            <Button 
              onClick={() => navigate(`/artist/${userId}`)}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
            >
              <Eye className="w-4 h-4 mr-2" />
              {t("artistPublicViewBtn")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            {t("artistFormCardTitle")}
            <div className="flex items-center gap-2">
              {formData.is_public ? (
                <Eye className="w-4 h-4 text-green-500" />
              ) : (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              )}
              <Switch
                checked={formData.is_public}
                onCheckedChange={(checked) => setFormData({...formData, is_public: checked})}
              />
              <span className="text-sm text-muted-foreground">
                {formData.is_public ? t("artistFormPublic") : t("artistFormPrivate")}
              </span>
            </div>
          </CardTitle>
          <CardDescription>
            {t("artistFormCardDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ImageUpload
            value={formData.cover_image_url}
            onChange={(url) => setFormData({...formData, cover_image_url: url})}
            label={t("artistFormCoverLabel")}
            folder="artist-covers"
          />

          <div className="space-y-2">
            <Label htmlFor="stage_name">{t("artistFormStageName")}</Label>
            <Input
              id="stage_name"
              value={formData.stage_name}
              onChange={(e) => setFormData({...formData, stage_name: e.target.value})}
              placeholder={t("artistFormStageNamePh")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">{t("artistFormBio")}</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData({...formData, bio: e.target.value})}
              placeholder={t("artistFormBioPh")}
              className="min-h-[150px]"
            />
          </div>

          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4" />
              {t("artistFormSocial")}
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Instagram className="w-5 h-5 text-pink-500" />
                <Input
                  value={formData.social_links.instagram}
                  onChange={(e) => setFormData({
                    ...formData,
                    social_links: {...formData.social_links, instagram: e.target.value}
                  })}
                  placeholder="@instagram"
                />
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                </svg>
                <Input
                  value={formData.social_links.tiktok}
                  onChange={(e) => setFormData({
                    ...formData,
                    social_links: {...formData.social_links, tiktok: e.target.value}
                  })}
                  placeholder="@tiktok"
                />
              </div>
              <div className="flex items-center gap-2">
                <Youtube className="w-5 h-5 text-red-500" />
                <Input
                  value={formData.social_links.youtube}
                  onChange={(e) => setFormData({
                    ...formData,
                    social_links: {...formData.social_links, youtube: e.target.value}
                  })}
                  placeholder={t("artistFormSocialYoutubePh")}
                />
              </div>
              <div className="flex items-center gap-2">
                <Music className="w-5 h-5 text-green-500" />
                <Input
                  value={formData.social_links.spotify}
                  onChange={(e) => setFormData({
                    ...formData,
                    social_links: {...formData.social_links, spotify: e.target.value}
                  })}
                  placeholder={t("artistFormSocialSpotifyPh")}
                />
              </div>
              <div className="flex items-center gap-2">
                <Twitter className="w-5 h-5" />
                <Input
                  value={formData.social_links.twitter}
                  onChange={(e) => setFormData({
                    ...formData,
                    social_links: {...formData.social_links, twitter: e.target.value}
                  })}
                  placeholder="@twitter"
                />
              </div>
              <div className="flex items-center gap-2">
                <Facebook className="w-5 h-5 text-blue-500" />
                <Input
                  value={formData.social_links.facebook}
                  onChange={(e) => setFormData({
                    ...formData,
                    social_links: {...formData.social_links, facebook: e.target.value}
                  })}
                  placeholder={t("artistFormSocialFacebookPh")}
                />
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            {saving ? t("artistFormSaving") : t("artistFormSave")}
          </Button>
        </CardContent>
      </Card>

      {profile && (
        <Card className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/20">
          <CardHeader>
            <CardTitle>{t("artistFormRevenues")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-background/50 rounded-lg">
              <p className="text-3xl font-bold text-purple-500">
                {profile.total_earnings?.toFixed(2) || "0.00"} $
              </p>
              <p className="text-sm text-muted-foreground">{t("artistFormTotalEarnings")}</p>
            </div>
            <div className="text-center p-4 bg-background/50 rounded-lg">
              <p className="text-3xl font-bold text-green-500">
                {profile.available_balance?.toFixed(2) || "0.00"} $
              </p>
              <p className="text-sm text-muted-foreground">{t("artistFormAvailableBalance")}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
