/**
 * Bouton/toggle rappel concert (`concert_reminders`) : email/push avant début (edge `concert-reminders` CRON).
 */
import { useState, useEffect } from "react";
import { getReminder, setReminder, removeReminder } from "@/api/endpoints/concerts";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface ConcertReminderProps {
  concertId: string;
  concertTitle: string;
  scheduledDate: string;
}

export const ConcertReminder = ({ concertId, concertTitle, scheduledDate }: ConcertReminderProps) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [hasReminder, setHasReminder] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkReminder();
  }, [concertId, user]);

  const checkReminder = async () => {
    if (!user) { setLoading(false); return; }
    try {
      const { active } = await getReminder(concertId);
      setHasReminder(active);
    } catch {
      /* ignore */
    }
    setLoading(false);
  };

  const toggleReminder = async () => {
    if (!user) {
      toast({ title: t("loginRequired"), description: t("loginForReminder"), variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      if (hasReminder) {
        await removeReminder(concertId);
        setHasReminder(false);
        toast({ title: t("reminderDisabled"), description: t("reminderDisabledDesc") });
      } else {
        await setReminder(concertId);
        setHasReminder(true);
        toast({ title: t("reminderActivated"), description: t("reminderActivatedDesc") });
        if ("Notification" in window && Notification.permission === "default") {
          Notification.requestPermission();
        }
      }
    } catch (error) {
      toast({ title: t("errorTitle"), description: t("reminderError"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Bell className="w-4 h-4 mr-2 animate-pulse" />
        {t("reminderLoading")}
      </Button>
    );
  }

  return (
    <Button 
      onClick={toggleReminder}
      variant={hasReminder ? "secondary" : "outline"}
      size="sm"
      className={hasReminder ? "border-green-500" : ""}
    >
      {hasReminder ? (
        <>
          <Check className="w-4 h-4 mr-2 text-green-500" />
          {t("reminderOn")}
        </>
      ) : (
        <>
          <Bell className="w-4 h-4 mr-2" />
          {t("remindMe")}
        </>
      )}
    </Button>
  );
};
