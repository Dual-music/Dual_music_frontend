/**
 * Éditeur profil public manager : bio, expérience, photo. Update `profiles` + `manager_profiles`.
 * Validation admin requise.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ImageUpload } from "@/components/ui/image-upload";
import { Eye, Loader2, Save } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import * as creators from "@/api/endpoints/creators";

interface ManagerPublicProfileEditorProps { userId: string; userName: string; }

interface ManagerProfile {
  id: string; user_id: string; display_name: string | null; bio: string | null;
  experience: string | null; avatar_url: string | null; cover_image_url?: string | null;
  social_links?: Record<string, string>; [key: string]: any;
}

export const ManagerPublicProfileEditor = ({ userId, userName }: ManagerPublicProfileEditorProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ManagerProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [experience, setExperience] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [instagram, setInstagram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [facebook, setFacebook] = useState("");
  const [youtube, setYoutube] = useState("");
  const [tiktok, setTiktok] = useState("");

  useEffect(() => { loadProfile(); }, [userId]);

  const loadProfile = async () => {
    try {
      const data = await creators.myManagerProfile();
      if (data) {
        const p = data as any;
        setProfile(p); setDisplayName(p.display_name || userName); setBio(p.bio || "");
        setExperience(p.experience || ""); setAvatarUrl(p.avatar_url || ""); setCoverImageUrl(p.cover_image_url || "");
        const links = (p.social_links as Record<string, string>) || {};
        setInstagram(links.instagram || ""); setTwitter(links.twitter || "");
        setFacebook(links.facebook || ""); setYoutube(links.youtube || ""); setTiktok(links.tiktok || "");
      }
    } catch (error) { console.error("Error loading manager profile:", error); } finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const socialLinks = {
        ...(instagram && { instagram }), ...(twitter && { twitter }), ...(facebook && { facebook }),
        ...(youtube && { youtube }), ...(tiktok && { tiktok }),
      };
      const updateData = { display_name: userName, bio, experience, avatar_url: null, cover_image_url: coverImageUrl || null, social_links: socialLinks };

      // PATCH /managers/me upserts the caller's own manager profile (create or update).
      await creators.updateManagerProfile(updateData);
      toast({ title: t("mgrProfileSaved"), description: t("mgrProfileSavedDesc") });
      loadProfile();
    } catch (error: any) {
      toast({ title: t("commonError"), description: error.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) return <Card className="p-6 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></Card>;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">{t("mgrProfileTitle")}</h3>
          <Button variant="outline" size="sm" onClick={() => navigate(`/artist/${userId}`)}>
            <Eye className="w-4 h-4 mr-2" />{t("mgrProfileView")}
          </Button>
        </div>

        <div className="space-y-6">
          <ImageUpload value={coverImageUrl} onChange={setCoverImageUrl} label={t("mgrProfileCover")} folder="manager-covers" />

          <div>
            <Label>{t("mgrProfileBio")}</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t("mgrProfileBioPlaceholder")} className="mt-2" rows={4} />
          </div>

          <div>
            <Label>{t("mgrProfileExp")}</Label>
            <Textarea value={experience} onChange={(e) => setExperience(e.target.value)} placeholder={t("mgrProfileExpPlaceholder")} className="mt-2" rows={4} />
          </div>

          <div className="space-y-3">
            <Label className="text-base font-semibold">{t("mgrProfileSocial")}</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: "Instagram", value: instagram, set: setInstagram, ph: "https://instagram.com/..." },
                { label: "Twitter / X", value: twitter, set: setTwitter, ph: "https://x.com/..." },
                { label: "Facebook", value: facebook, set: setFacebook, ph: "https://facebook.com/..." },
                { label: "YouTube", value: youtube, set: setYoutube, ph: "https://youtube.com/..." },
                { label: "TikTok", value: tiktok, set: setTiktok, ph: "https://tiktok.com/@..." },
              ].map(({ label, value, set, ph }) => (
                <div key={label}>
                  <Label className="text-sm text-muted-foreground">{label}</Label>
                  <Input value={value} onChange={(e) => set(e.target.value)} placeholder={ph} className="mt-1" />
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white w-full">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? t("mgrProfileSaving") : t("mgrProfileSave")}
          </Button>
        </div>
      </Card>
    </div>
  );
};