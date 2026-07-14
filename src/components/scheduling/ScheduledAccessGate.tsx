/**
 * Gate accès concert programmé : bloque entrée avant heure programmée, compteur countdown. Check
 * `concerts.scheduled_at`.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, CreditCard } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import * as wallet from "@/api/endpoints/wallet";
import { ApiError } from "@/api/http";
import { useToast } from "@/hooks/use-toast";

interface Props {
  type: "duel" | "concert";
  scheduledAt: string | null | undefined;
  status: string | null | undefined;
  eventId: string;
  ticketPrice: number;
  /** True if current user is artist/manager/admin (cannot purchase access). */
  isActor: boolean;
  /** True if user already has a ticket. */
  hasTicket: boolean;
  /** True if user is logged in. */
  isAuthenticated: boolean;
  onPurchased?: () => void;
}

/**
 * Blocks access to a scheduled event until its scheduled date/time.
 * - Even for actors (artist, manager, admin) before the start time.
 * - Spectators without ticket on a paid event get a "Pay for access" button.
 */
export const ScheduledAccessGate = ({
  type, scheduledAt, status, eventId, ticketPrice, isActor, hasTicket, isAuthenticated, onPurchased,
}: Props) => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [now, setNow] = useState(Date.now());
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(i);
  }, []);

  const startTs = useMemo(() => (scheduledAt ? new Date(scheduledAt).getTime() : null), [scheduledAt]);
  const notStartedYet =
    !!startTs && now < startTs && status !== "live" && status !== "ended";

  // Paid event already live but user has no ticket → still must pay to enter.
  const liveRequiresPayment =
    status === "live" && !isActor && !hasTicket && Number(ticketPrice) > 0;

  const blocked = notStartedYet || liveRequiresPayment;
  if (!blocked) return null;

  const formatted = scheduledAt
    ? formatTz(scheduledAt, "dd MMMM yyyy HH:mm", { timezone: prefs.timezone, language })
    : "";

  const msgKey = type === "duel" ? "scheduledNotStartedMsgDuel" : "scheduledNotStartedMsgConcert";
  const baseMessage = (t(msgKey) || "").replace("{date}", formatted);
  const message = liveRequiresPayment
    ? (language === "fr"
        ? "Cet événement est déjà en cours. Pour y accéder, vous devez régler votre billet."
        : "This event is already live. To join, you must purchase your ticket.")
    : baseMessage;
  const title = liveRequiresPayment
    ? (language === "fr" ? "Accès payant requis" : "Paid access required")
    : t("scheduledNotStartedTitle");

  const purchase = async () => {
    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }
    setPaying(true);
    try {
      const idemKey = crypto.randomUUID();
      if (type === "duel") {
        await wallet.buyDuelTicket({ duelId: eventId }, idemKey);
      } else {
        await wallet.buyConcertTicket({ concertId: eventId }, idemKey);
      }
      toast({ title: "✓", description: t("ticketBooked") || "Accès acquis" });
      onPurchased?.();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "—";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setPaying(false);
    }
  };

  const canPay = !isActor && !hasTicket && Number(ticketPrice) > 0;
  const isFreeForAll = !isActor && !hasTicket && Number(ticketPrice) === 0;

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {liveRequiresPayment ? <CreditCard className="w-5 h-5 text-primary" /> : <Calendar className="w-5 h-5 text-primary" />}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base whitespace-pre-line">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasTicket && (
          <p className="text-sm text-emerald-500 font-semibold">{t("scheduledAccessAlready")}</p>
        )}

        <AlertDialogFooter className="gap-2">
          <Button variant="outline" onClick={() => navigate(type === "duel" ? "/duels" : "/lives")}>
            {t("scheduledBackHome")}
          </Button>
          {canPay && (
            <Button onClick={purchase} disabled={paying} className="bg-gradient-primary">
              {paying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
              {t("scheduledPayAccess")} ({Number(ticketPrice).toLocaleString()} {t("creditUnit")})
            </Button>
          )}
          {isFreeForAll && (
            <AlertDialogAction onClick={() => navigate(type === "duel" ? "/duels" : "/lives")}>
              {t("scheduledBackHome")}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ScheduledAccessGate;
