/**
 * Chat threadé multi-contexte (duel/concert/live) : messages avec replies imbriquées
 * visuellement, auto-modération, ban host (`useStreamBan`), emojis, scroll `block: nearest`.
 * Realtime via Supabase channels, `get_display_profiles` RPC.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useEventChat } from "@/realtime/useEventChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Send, MessageCircle, Shield, Smile, Reply, X, Ban } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useStreamBan, StreamType } from "@/hooks/useStreamBan";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  user_name?: string;
  avatar_url?: string;
  parent_id?: string | null;
  reply_to_name?: string;
  reply_to_message?: string;
}

interface ThreadedChatProps {
  chatType: "duel" | "concert" | "live" | "competition";
  entityId: string;
  participants?: { id: string; name: string }[];
  /**
   * Identifier of the user allowed to ban people from this stream:
   * - duel: manager_id
   * - live / concert: artist_id (host)
   * - competition: manager_id
   * When provided AND equals the current user, ban controls become available.
   */
  hostId?: string | null;
}

const BAD_WORDS = ["spam", "scam", "idiot", "stupid", "hate", "kill"];
const containsBadWords = (text: string): boolean => {
  return BAD_WORDS.some(word => text.toLowerCase().includes(word));
};

const EMOJI_REACTIONS = ["🔥", "❤️", "👏", "😂", "🎵", "💯", "🏆", "⭐", "🎤", "💎", "🦁", "👑"];


export const ThreadedChat = ({ chatType, entityId, participants = [], hostId }: ThreadedChatProps) => {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { user: currentUser } = useAuth();
  const { messages: rawMessages, send } = useEventChat(chatType, entityId);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [banTarget, setBanTarget] = useState<ChatMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { bannedIds, isCurrentUserBanned, banUser } = useStreamBan({
    streamType: chatType as StreamType,
    streamId: entityId,
    currentUserId: currentUser?.id,
  });

  const canModerate = !!currentUser && !!hostId && currentUser.id === hostId;

  // Derive display rows (author names, reply previews) from the hook messages.
  const messages: ChatMessage[] = useMemo(() => {
    const byId = new Map(rawMessages.map(m => [m.id, m]));
    return rawMessages.map(m => {
      const parent = m.parent_id ? byId.get(m.parent_id) : null;
      return {
        ...m,
        user_name: m.profile?.full_name || t("userDefault"),
        avatar_url: m.profile?.avatar_url ?? undefined,
        reply_to_name: parent ? (parent.profile?.full_name || t("userDefault")) : undefined,
        reply_to_message: parent?.message,
      };
    });
  }, [rawMessages, t]);

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages]);

  const insertEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    if (!currentUser) {
      toast({ title: t("loginRequired"), description: t("mustBeLoggedToChat"), variant: "destructive" });
      return;
    }

    if (isCurrentUserBanned) {
      toast({ title: t("youAreBanned"), variant: "destructive" });
      return;
    }

    if (containsBadWords(newMessage)) {
      toast({ title: t("messageRefused"), description: t("inappropriateContent"), variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const parentId =
        replyTo && (chatType === "duel" || chatType === "concert" || chatType === "competition")
          ? replyTo.id
          : null;
      await send(newMessage.trim(), parentId);
      setNewMessage("");
      setReplyTo(null);
    } catch {
      toast({ title: t("errorTitle"), description: t("cannotSendMessage"), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const confirmBan = async () => {
    if (!banTarget) return;
    const ok = await banUser(banTarget.user_id, banTarget.message.slice(0, 200));
    if (ok) toast({ title: t("userBannedSuccess") });
    setBanTarget(null);
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString(language === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessageText = (text: string) => {
    const parts = text.split(/(@\S+)/g);
    return parts.map((part, i) =>
      part.startsWith("@") ? (
        <span key={i} className="font-bold text-primary">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  const visibleMessages = messages.filter(m => !bannedIds.has(m.user_id));

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="py-3 border-b">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          {chatType === "concert" ? t("concertChat") : t("liveChat")}
          <span className="ml-auto" title={t("autoModeration")}>
            <Shield className="w-4 h-4 text-green-500" />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 flex flex-col min-h-0">
        <ScrollArea className="flex-1 p-4 overflow-x-hidden scrollbar-hidden" ref={scrollRef}>
          <AnimatePresence>
            {visibleMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 mb-3 group"
              >
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarImage src={msg.avatar_url || ""} />
                  <AvatarFallback className="text-xs">
                    {msg.user_name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  {msg.reply_to_name && (
                    <div className="mb-1 flex max-w-full items-start gap-1.5 rounded-md border-l-2 border-primary/70 bg-muted/60 px-2 py-1 text-[10px] text-muted-foreground">
                      <Reply className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                      <div className="min-w-0">
                        <span className="block font-semibold leading-none text-primary">{msg.reply_to_name}</span>
                        <span className="block max-w-[180px] truncate leading-tight">{msg.reply_to_message}</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{msg.user_name}</span>
                    {participants.find(p => p.id === msg.user_id) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">
                        {participants.find(p => p.id === msg.user_id)?.name.includes("Manager") ? "🎙️" : "🎤"}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{formatTime(msg.created_at)}</span>
                    <button
                      onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                      title={t("reply")}
                    >
                      <Reply className="w-3 h-3" />
                    </button>
                    {canModerate && msg.user_id !== currentUser?.id && (
                      <button
                        onClick={() => setBanTarget(msg)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        title={t("banUserLabel")}
                      >
                        <Ban className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{renderMessageText(msg.message)}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {visibleMessages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{t("beFirstToSendMessage")}</p>
            </div>
          )}
          <div ref={bottomRef} />
        </ScrollArea>

        {replyTo && (
          <div className="mx-3 mb-1 flex items-center justify-between rounded-lg border border-border bg-muted/60 px-3 py-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
              <Reply className="w-3 h-3 text-primary shrink-0" />
              <span className="font-medium text-primary">{replyTo.user_name}</span>
              <span className="truncate max-w-[220px]">{replyTo.message}</span>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="p-3 border-t flex gap-2 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="shrink-0" disabled={isCurrentUserBanned}>
                <Smile className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" side="top" align="start">
              <div className="grid grid-cols-6 gap-1">
                {EMOJI_REACTIONS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    className="text-xl p-1 hover:bg-muted rounded transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={
              isCurrentUserBanned
                ? t("youAreBanned")
                : replyTo
                  ? `${t("replyToPlaceholder")} ${replyTo.user_name}...`
                  : "Message..."
            }
            maxLength={200}
            disabled={!currentUser || isCurrentUserBanned}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={sending || !currentUser || isCurrentUserBanned}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </CardContent>

      <ConfirmDialog
        open={!!banTarget}
        onOpenChange={(o) => !o && setBanTarget(null)}
        title={t("banConfirmTitle")}
        description={t("banConfirmDesc")}
        confirmLabel={t("banUserLabel")}
        variant="destructive"
        onConfirm={confirmBan}
      />
    </Card>
  );
};
