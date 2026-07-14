/**
 * Admin: ContactInfoManager — édite les infos de contact publiques.
 *
 * Email support, téléphone, adresse, horaires — stockés dans
 * `platform_settings.contact_info` et affichés sur `/contact` et footer.
 *
 * @access  role=admin
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Mail, Phone, MapPin, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePlatformSetting, updatePlatformSetting, DEFAULT_CONTACT, ContactInfo } from "@/hooks/usePlatformSettings";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";

const ContactInfoManager = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { data } = usePlatformSetting<ContactInfo>("contact_info", DEFAULT_CONTACT);
  const [form, setForm] = useState<ContactInfo>(DEFAULT_CONTACT);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm({ ...DEFAULT_CONTACT, ...data }); }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      await updatePlatformSetting("contact_info", form);
      qc.invalidateQueries({ queryKey: ["platform_setting", "contact_info"] });
      toast({ title: t("commonSavedTitle"), description: t("ciSavedDesc") });
    } catch (e: any) {
      toast({ title: t("commonError"), description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("ciTitle")}</CardTitle>
        <CardDescription>{t("ciDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2"><Mail className="w-4 h-4" /> {t("ciEmail")}</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contact@example.com" />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2"><Phone className="w-4 h-4" /> {t("ciPhone")}</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+33 ..." />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {t("ciAddress")}</Label>
          <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
        </div>
        <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" /> {t("commonSave")}</Button>
      </CardContent>
    </Card>
  );
};

export default ContactInfoManager;
