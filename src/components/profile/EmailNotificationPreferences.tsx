/**
 * Préférences email (`email_notification_preferences`) : toggles par catégorie (concerts, duels, retraits, marketing) consommés par les edges Resend.
 */
import { useEffect, useState } from "react";
import * as notifications from "@/api/endpoints/notifications";
import { getPublicSetting } from "@/api/endpoints/settings";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Bell, Music, Swords, Gift, Vote, FileCheck, Users, Radio, Settings2, Smartphone, BellOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";

interface EmailPrefs {
  email_concerts: boolean;
  email_duels: boolean;
  email_gifts: boolean;
  email_votes: boolean;
  email_requests: boolean;
  email_assignments: boolean;
  email_system: boolean;
  email_lives: boolean;
}

const defaultPrefs: EmailPrefs = {
  email_concerts: true,
  email_duels: true,
  email_gifts: true,
  email_votes: true,
  email_requests: true,
  email_assignments: true,
  email_system: true,
  email_lives: true,
};

interface EmailNotificationPreferencesProps {
  userRoles: string[];
}

export const EmailNotificationPreferences = ({ userRoles }: EmailNotificationPreferencesProps) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<EmailPrefs>(defaultPrefs);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const prefItems = [
    { key: "email_concerts" as keyof EmailPrefs, label: t("profileEmailConcerts"), description: t("profileEmailConcertsDesc"), icon: Music, roles: ["fan", "artist", "manager"] },
    { key: "email_duels" as keyof EmailPrefs, label: t("profileEmailDuels"), description: t("profileEmailDuelsDesc"), icon: Swords, roles: ["fan", "artist", "manager"] },
    { key: "email_lives" as keyof EmailPrefs, label: t("profileEmailLives"), description: t("profileEmailLivesDesc"), icon: Radio, roles: ["fan", "artist", "manager"] },
    { key: "email_gifts" as keyof EmailPrefs, label: t("profileEmailGifts"), description: t("profileEmailGiftsDesc"), icon: Gift, roles: ["artist", "manager"] },
    { key: "email_votes" as keyof EmailPrefs, label: t("profileEmailVotes"), description: t("profileEmailVotesDesc"), icon: Vote, roles: ["artist"] },
    { key: "email_requests" as keyof EmailPrefs, label: t("profileEmailRequests"), description: t("profileEmailRequestsDesc"), icon: FileCheck, roles: ["artist", "manager", "fan"] },
    { key: "email_assignments" as keyof EmailPrefs, label: t("profileEmailAssignments"), description: t("profileEmailAssignmentsDesc"), icon: Users, roles: ["artist", "manager"] },
    { key: "email_system" as keyof EmailPrefs, label: t("profileEmailSystem"), description: t("profileEmailSystemDesc"), icon: Settings2, roles: ["fan", "artist", "manager", "admin"], locked: true },
  ];

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setPushSupported(supported);
    if (supported && Notification.permission === "granted") {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => setPushEnabled(!!sub));
      });
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setUserId(user.id);
      try {
        const data = (await notifications.getPreferences()) as any;
        setPrefs({
          email_concerts: data.email_concerts, email_duels: data.email_duels, email_gifts: data.email_gifts,
          email_votes: data.email_votes, email_requests: data.email_requests, email_assignments: data.email_assignments,
          email_system: data.email_system, email_lives: data.email_lives,
        });
        // Opt-out explicite de la préférence push → reflète OFF même si le navigateur est abonné.
        if (data.push_enabled === false) setPushEnabled(false);
      } catch {
        /* keep defaults on failure */
      }
      setLoaded(true);
    };
    load();
  }, [user]);

  const handleToggle = async (key: keyof EmailPrefs, value: boolean) => {
    if (!userId) return;
    setSaving(true);
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    try {
      await notifications.setEmailPreferences(newPrefs);
      const item = prefItems.find(p => p.key === key);
      toast({ title: t("profileEmailSaved"), description: `${t("profileEmailSavedDesc")} "${item?.label}" ${value ? t("profileEmailEnabled") : t("profileEmailDisabledWord")}.` });
    } catch (error: any) {
      setPrefs(prefs);
      toast({ title: t("error"), description: error?.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handlePushToggle = async (enable: boolean) => {
    setPushLoading(true);
    try {
      if (enable) {
        const cfg = await getPublicSetting<{ vapid_public_key?: string } | null>("push_config", null);
        const vapidKey = cfg?.vapid_public_key;
        if (!vapidKey) {
          toast({ title: t("error"), description: t("profilePushNotConfigured"), variant: "destructive" });
          setPushLoading(false);
          return;
        }
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          const reg = await navigator.serviceWorker.ready;
          const urlBase64ToUint8Array = (base64: string) => {
            const padding = "=".repeat((4 - (base64.length % 4)) % 4);
            const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
            const raw = atob(b64);
            const out = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
            return out;
          };
          const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
          if (userId) {
            const subJson = sub.toJSON();
            await notifications.subscribePush({ endpoint: sub.endpoint, p256dh: subJson.keys?.p256dh || "", auth: subJson.keys?.auth || "" });
          }
          setPushEnabled(true);
          // Persiste la préférence push (respectée par notifyUser, comme sur mobile).
          await notifications.setEmailPreferences({ ...prefs, push_enabled: true } as any).catch(() => {});
          toast({ title: t("profilePushActivated"), description: t("profilePushActivatedDesc") });
        } else {
          toast({ title: t("profilePushPermDenied"), description: t("profilePushPermDeniedDesc"), variant: "destructive" });
        }
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        if (userId) await notifications.unsubscribePush({ endpoint: sub?.endpoint });
        setPushEnabled(false);
        // Opt-out : la préférence push est désactivée (respectée par notifyUser).
        await notifications.setEmailPreferences({ ...prefs, push_enabled: false } as any).catch(() => {});
        toast({ title: t("profilePushDeactivated"), description: t("profilePushDeactivatedDesc") });
      }
    } catch (err: any) {
      console.error("Push toggle error:", err);
      toast({ title: t("error"), description: err?.message || t("profilePushError"), variant: "destructive" });
    }
    setPushLoading(false);
  };

  const visibleItems = prefItems.filter(item => item.roles.some(r => userRoles.includes(r)));

  if (!loaded) return null;

  return (
    <div className="space-y-4">
      {pushSupported && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Smartphone className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">{t("profilePushTitle")}</CardTitle>
                <CardDescription>{t("profilePushDesc")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${pushEnabled ? "border-border bg-accent/20" : "border-border/50 bg-muted/20"}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${pushEnabled ? "bg-primary/10" : "bg-muted"}`}>
                  {pushEnabled ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div>
                  <span className="font-medium text-sm">{pushEnabled ? t("profilePushEnabled") : t("profilePushDisabled")}</span>
                  <p className="text-xs text-muted-foreground">{pushEnabled ? t("profilePushEnabledDesc") : t("profilePushDisabledDesc")}</p>
                </div>
              </div>
              <Switch checked={pushEnabled} onCheckedChange={handlePushToggle} disabled={pushLoading} />
            </div>
            {Notification.permission === "denied" && (
              <p className="text-xs text-destructive mt-2">{t("profilePushDenied")}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{t("profileEmailTitle")}</CardTitle>
              <CardDescription>{t("profileEmailDesc")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isLocked = "locked" in item && item.locked;
            const enabled = isLocked ? true : prefs[item.key];
            return (
              <div key={item.key} className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${enabled ? "border-border bg-accent/20" : "border-border/50 bg-muted/20"}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${enabled ? "bg-primary/10" : "bg-muted"}`}>
                    <Icon className={`w-4 h-4 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{item.label}</span>
                      {isLocked && <Badge variant="secondary" className="text-xs py-0">{t("profileEmailRequired")}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(val) => !isLocked && handleToggle(item.key, val)}
                  disabled={isLocked || saving}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};