/**
 * Admin: SocialLinksManager — édite les liens sociaux globaux.
 *
 * URL Instagram, TikTok, X, YouTube, etc. stockés dans
 * `platform_settings.social_links` et affichés via `SocialLinksDisplay`
 * dans le footer et les pages publiques.
 *
 * @access  role=admin
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePlatformSetting, updatePlatformSetting, DEFAULT_SOCIAL, SocialLinks } from "@/hooks/usePlatformSettings";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";

const FIELDS: Array<{ key: keyof SocialLinks; label: string; placeholder: string }> = [
  { key: "facebook",  label: "Facebook",        placeholder: "https://facebook.com/votre-page" },
  { key: "instagram", label: "Instagram",       placeholder: "https://instagram.com/..." },
  { key: "x",         label: "X (Twitter)",     placeholder: "https://x.com/..." },
  { key: "youtube",   label: "YouTube",         placeholder: "https://youtube.com/@..." },
  { key: "tiktok",    label: "TikTok",          placeholder: "https://tiktok.com/@..." },
  { key: "whatsapp",  label: "WhatsApp",        placeholder: "https://chat.whatsapp.com/..." },
  { key: "telegram",  label: "Telegram",        placeholder: "https://t.me/..." },
  { key: "linkedin",  label: "LinkedIn",        placeholder: "https://linkedin.com/company/..." },
  { key: "discord",   label: "Discord",         placeholder: "https://discord.gg/..." },
];

const SocialLinksManager = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { data } = usePlatformSetting<SocialLinks>("social_links_config", DEFAULT_SOCIAL);
  const [form, setForm] = useState<SocialLinks>(DEFAULT_SOCIAL);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm({ ...DEFAULT_SOCIAL, ...data }); }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      await updatePlatformSetting("social_links_config", form);
      qc.invalidateQueries({ queryKey: ["platform_setting", "social_links_config"] });
      toast({ title: t("commonSavedTitle"), description: t("slmSavedDesc") });
    } catch (e: any) {
      toast({ title: t("commonError"), description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("slmTitle")}</CardTitle>
        <CardDescription>{t("slmDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input
                value={form[f.key] || ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder}
              />
            </div>
          ))}
        </div>
        <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" /> {t("commonSave")}</Button>
      </CardContent>
    </Card>
  );
};

export default SocialLinksManager;
