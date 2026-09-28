/**
 * EventModeratorsDialog — host-only popup to appoint/revoke up to 2 viewer
 * moderators for a live/concert/duel/competition (see `useEventModerators`).
 * Appointed moderators can ban and hide chat messages, but never toggle chat
 * on/off (host-exclusive).
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Shield, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { useEventModerators, MAX_EVENT_MODERATORS } from "@/hooks/useEventModerators";
import type { EventType } from "@/api/endpoints/moderation";

interface Props {
  eventType: EventType;
  eventId: string;
  isHost: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export const EventModeratorsDialog = ({ eventType, eventId, isHost, open, onOpenChange }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { moderators, viewers, viewersLoading, loadViewers, appoint, revoke, atLimit } = useEventModerators({
    eventType, eventId, isHost,
  });

  useEffect(() => {
    if (open && isHost) loadViewers();
  }, [open, isHost, loadViewers]);

  const moderatorIds = new Set(moderators.map((m) => m.user_id as string));
  const pickable = viewers.filter((v) => !moderatorIds.has(v.id as string));

  const handleAppoint = async (userId: string) => {
    setBusyId(userId);
    const res = await appoint(userId);
    setBusyId(null);
    if (!res.ok) toast({ title: res.error || t("errorTitle"), variant: "destructive" });
  };

  const handleRevoke = async (userId: string) => {
    setBusyId(userId);
    await revoke(userId);
    setBusyId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" /> {t("eventModeratorsTitle") || "Modérateurs"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">
              {t("eventModeratorsCurrentLabel") || "Modérateurs désignés"} ({moderators.length}/{MAX_EVENT_MODERATORS})
            </p>
            {moderators.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("eventModeratorsNone") || "Aucun modérateur désigné."}</p>
            ) : (
              <div className="space-y-2">
                {moderators.map((m: any) => (
                  <div key={m.user_id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="w-7 h-7">
                        <AvatarImage src={m.user?.avatar_url || ""} />
                        <AvatarFallback>{(m.user?.full_name || "M")[0]}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">{m.user?.full_name || m.user_id.slice(0, 8)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      disabled={busyId === m.user_id}
                      onClick={() => handleRevoke(m.user_id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isHost && (
            <div>
              <p className="text-sm font-medium mb-2">{t("eventModeratorsPickLabel") || "Spectateurs actuellement présents"}</p>
              {atLimit ? (
                <Badge variant="secondary">{t("eventModeratorsLimitReached") || "Limite de 2 modérateurs atteinte"}</Badge>
              ) : viewersLoading ? (
                <p className="text-sm text-muted-foreground">{t("loading") || "Chargement..."}</p>
              ) : pickable.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("eventModeratorsNoViewers") || "Aucun spectateur disponible en ce moment."}</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {pickable.map((v: any) => (
                    <div key={v.id} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/40">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="w-7 h-7">
                          <AvatarImage src={v.avatar_url || ""} />
                          <AvatarFallback>{(v.full_name || "U")[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate">{v.full_name || v.id.slice(0, 8)}</span>
                      </div>
                      <Button size="sm" variant="outline" disabled={busyId === v.id} onClick={() => handleAppoint(v.id)}>
                        {t("eventModeratorsAppoint") || "Nommer"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EventModeratorsDialog;
