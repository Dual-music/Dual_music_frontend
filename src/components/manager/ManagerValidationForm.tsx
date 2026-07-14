/**
 * Formulaire validation manager : documents identité, expérience, stockage `manager_documents`.
 * Validation admin requise pour assignation duels.
 */
import { useEffect, useState } from "react";
import { applyManager } from "@/api/endpoints/creators";
import { getPublicSetting } from "@/api/endpoints/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, CheckCircle, Clock, Lock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ManagerValidationFormProps {
  userId: string;
  existingRequest?: { id: string; status: string } | null;
  onRequestSubmitted?: () => void;
}

export const ManagerValidationForm = ({ userId, existingRequest, onRequestSubmitted }: ManagerValidationFormProps) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [bio, setBio] = useState("");
  const [experience, setExperience] = useState("");
  const [requestsEnabled, setRequestsEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const value = await getPublicSetting<{ enabled?: boolean } | boolean>(
        "manager_requests_enabled",
        { enabled: true },
      );
      const enabled = typeof value === "object" && value !== null ? value.enabled : value;
      setRequestsEnabled(enabled !== false);
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bio.trim() || !experience.trim()) {
      toast({ title: t("commonError"), description: t("mgrValidFillAll"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await applyManager({ bio, experience });
      toast({ title: t("mgrValidSubmitted"), description: t("mgrValidSubmittedDesc") });
      onRequestSubmitted?.();
    } catch (error: any) {
      toast({ title: t("commonError"), description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (requestsEnabled === false && !existingRequest) {
    return (
      <Card className="border-muted">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-muted-foreground" />
            {t("roleManagerRequestsClosedTitle") || "Inscriptions manager fermées"}
          </CardTitle>
          <CardDescription>
            {t("roleManagerRequestsClosedDesc") ||
              "Les candidatures pour devenir manager sont actuellement désactivées par l'administration."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (existingRequest) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {existingRequest.status === "pending" ? <><Clock className="w-5 h-5 text-yellow-500" />{t("mgrValidPending")}</> : existingRequest.status === "approved" ? <><CheckCircle className="w-5 h-5 text-green-500" />{t("mgrValidApproved")}</> : <><Clock className="w-5 h-5 text-red-500" />{t("mgrValidRejected")}</>}
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("mgrValidTitle")}</CardTitle>
        <CardDescription>{t("mgrValidDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>{t("mgrValidBio")}</Label><Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t("mgrValidBioPlaceholder")} required /></div>
          <div><Label>{t("mgrValidExp")}</Label><Textarea value={experience} onChange={(e) => setExperience(e.target.value)} placeholder={t("mgrValidExpPlaceholder")} required /></div>
          <Button type="submit" disabled={loading} className="w-full"><Upload className="w-4 h-4 mr-2" />{loading ? t("mgrValidSubmitting") : t("mgrValidSubmitBtn")}</Button>
        </form>
      </CardContent>
    </Card>
  );
};