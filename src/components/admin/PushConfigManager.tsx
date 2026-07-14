/**
 * Admin: PushConfigManager — configuration des notifications Web Push.
 *
 * Affiche l'état des clés VAPID (présence des secrets `VAPID_PUBLIC_KEY`,
 * `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), nombre d'abonnements actifs
 * (`push_subscriptions`), et permet d'envoyer un push de test via
 * `send-push`.
 *
 * @access  role=admin
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePlatformSetting, updatePlatformSetting, DEFAULT_PUSH, PushConfig } from "@/hooks/usePlatformSettings";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";

const PushConfigManager = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { data } = usePlatformSetting<PushConfig>("push_config", DEFAULT_PUSH);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setKey(data.vapid_public_key || ""); }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      await updatePlatformSetting("push_config", { vapid_public_key: key.trim() });
      qc.invalidateQueries({ queryKey: ["platform_setting", "push_config"] });
      toast({ title: t("commonSavedTitle"), description: t("pcmSavedDesc") });
    } catch (e: any) {
      toast({ title: t("commonError"), description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5" /> {t("pcmTitle")}</CardTitle>
        <CardDescription>{t("pcmDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("pcmVapidLabel")}</Label>
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="BMx..." className="font-mono text-xs" />
        </div>
        <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" /> {t("commonSave")}</Button>
      </CardContent>
    </Card>
  );
};

export default PushConfigManager;
