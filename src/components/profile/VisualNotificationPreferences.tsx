/**
 * Préférences visuelles (`user_ui_preferences`) : mode TopDonor (bubble/banner), animations cadeaux, fuseau horaire pour `formatTz`.
 */
import { useUiPreferences, TopDonorMode, TopDonorAnimation } from "@/hooks/useUiPreferences";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const TIMEZONES = [
  { value: "GMT", label: "GMT (UTC)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET/CEST)" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Africa/Abidjan", label: "Africa/Abidjan (GMT)" },
  { value: "Africa/Lagos", label: "Africa/Lagos (WAT)" },
  { value: "Africa/Casablanca", label: "Africa/Casablanca" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "Asia/Dubai", label: "Asia/Dubai" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
];

export const VisualNotificationPreferences = () => {
  const { prefs, update, loading } = useUiPreferences();
  const { t } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-4 h-4" /> {t("vnpTitle")}
        </CardTitle>
        <CardDescription>
          {t("vnpDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label className="text-sm font-semibold">{t("vnpTopDonorCard")}</Label>
          <RadioGroup
            value={prefs.top_donor_mode}
            onValueChange={(v) => update({ top_donor_mode: v as TopDonorMode })}
            disabled={loading}
            className="grid gap-2"
          >
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/30 transition">
              <RadioGroupItem value="full" id="td-full" className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t("vnpFull")}</div>
                <p className="text-xs text-muted-foreground">{t("vnpFullDesc")}</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/30 transition">
              <RadioGroupItem value="reduced" id="td-reduced" className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t("vnpReduced")}</div>
                <p className="text-xs text-muted-foreground">{t("vnpReducedDesc")}</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/30 transition">
              <RadioGroupItem value="off" id="td-off" className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t("vnpOff")}</div>
                <p className="text-xs text-muted-foreground">{t("vnpOffDesc")}</p>
              </div>
            </label>
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-semibold">{t("vnpTopDonorAnim")}</Label>
          <RadioGroup
            value={prefs.top_donor_animation}
            onValueChange={(v) => update({ top_donor_animation: v as TopDonorAnimation })}
            disabled={loading || prefs.top_donor_mode === "off"}
            className="grid sm:grid-cols-2 gap-2"
          >
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/30 transition">
              <RadioGroupItem value="default" id="anim-default" className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t("vnpDefault")}</div>
                <p className="text-xs text-muted-foreground">{t("vnpDefaultDesc")}</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/30 transition">
              <RadioGroupItem value="traversing" id="anim-trav" className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t("vnpTraversing")}</div>
                <p className="text-xs text-muted-foreground">{t("vnpTraversingDesc")}</p>
              </div>
            </label>
          </RadioGroup>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div className="flex-1 pr-3">
            <Label htmlFor="reduce-anim" className="text-sm font-medium">{t("vnpReduceAnim")}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t("vnpReduceAnimDesc")}</p>
          </div>
          <Switch
            id="reduce-anim"
            checked={prefs.reduce_animations}
            onCheckedChange={(v) => update({ reduce_animations: v })}
            disabled={loading}
          />
        </div>

        <div className="space-y-2 p-3 rounded-lg border">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Globe className="w-4 h-4" /> {t("vnpTimezone")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("vnpTimezoneDesc")}
          </p>
          <Select
            value={prefs.timezone}
            onValueChange={(v) => update({ timezone: v })}
            disabled={loading}
          >
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};

export default VisualNotificationPreferences;
