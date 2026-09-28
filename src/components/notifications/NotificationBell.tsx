/**
 * Cloche notifications header : compteur badge, dropdown liste `notifications` table, mark-as-
 * read. Realtime channel.
 */
import { useCallback, useEffect, useState } from "react";
import * as notificationsApi from "@/api/endpoints/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { useSocketEvent } from "@/realtime/useRoom";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Gift, Award, Trophy, Check, Heart, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDistanceToNow } from "date-fns";
import { fr, enUS } from "date-fns/locale";

const NotificationItem = ({ notification, icon, dateLocale, onMarkRead, expandLabel, collapseLabel }: {
  notification: Notification;
  icon: JSX.Element;
  dateLocale: any;
  onMarkRead: (id: string) => void;
  expandLabel: string;
  collapseLabel: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = (notification.message?.length || 0) > 90;
  return (
    <div
      className={`p-4 hover:bg-accent/50 transition-colors ${!notification.read ? "bg-primary/5" : ""}`}
      onClick={() => !notification.read && onMarkRead(notification.id)}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{notification.title}</p>
          <p className={`text-xs text-muted-foreground whitespace-pre-wrap break-words ${expanded ? "" : "line-clamp-2"}`}>
            {notification.message}
          </p>
          {isLong && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              className="mt-1 text-[11px] font-semibold text-primary hover:underline"
            >
              {expanded ? collapseLabel : expandLabel}
            </button>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: dateLocale })}
          </p>
        </div>
        {!notification.read && <div className="w-2 h-2 rounded-full bg-primary mt-1" />}
      </div>
    </div>
  );
};

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data: any;
  read: boolean;
  created_at: string;
}

export const NotificationBell = () => {
  const { t, language } = useLanguage();
  const dateLocale = language === "fr" ? fr : enUS;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (userId) loadNotifications(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Realtime: the backend pushes `notification:new` on the caller's personal
  // channel (Socket.IO `/notifications` namespace) — replaces the Supabase INSERT
  // subscription.
  const onNewNotification = useCallback((n: Notification) => {
    setNotifications((prev) => [n, ...prev]);
    setUnreadCount((prev) => prev + 1);
  }, []);
  useSocketEvent<Notification>("/notifications", "notification:new", onNewNotification, !!userId);

  const loadNotifications = async (_uid: string) => {
    try {
      const data = (await notificationsApi.listNotifications({ limit: 20 })) as unknown as Notification[];
      setNotifications(data || []);
      setUnreadCount((data || []).filter((n) => !n.read).length);
    } catch {
      /* silent — bell stays empty */
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await notificationsApi.markRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      /* ignore */
    }
  };

  const markAllAsRead = async () => {
    if (!userId) return;
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "vote":
        return <Award className="w-4 h-4 text-blue-500" />;
      case "gift":
        return <Gift className="w-4 h-4 text-pink-500" />;
      case "duel_win":
        return <Trophy className="w-4 h-4 text-yellow-500" />;
      case "dedication_received":
      case "dedication_accepted":
      case "dedication_delivered":
        return <Heart className="w-4 h-4 text-pink-500" />;
      case "dedication_rejected":
        return <X className="w-4 h-4 text-destructive" />;
      default:
        return <Bell className="w-4 h-4 text-primary" />;
    }
  };

  if (!userId) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-destructive text-destructive-foreground text-xs animate-pulse"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h4 className="font-semibold">{t("notifications")}</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              <Check className="w-4 h-4 mr-1" />
              {t("markAllRead")}
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t("noNotifications")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  icon={getNotificationIcon(notification.type)}
                  dateLocale={dateLocale}
                  onMarkRead={markAsRead}
                  expandLabel={language === "fr" ? "Voir plus" : "See more"}
                  collapseLabel={language === "fr" ? "Voir moins" : "See less"}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
