/**
 * Chat duel (`duel_chat_messages`) — ThreadedChat avec mute commandé par modérateurs.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useEventChat } from "@/realtime/useEventChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Send, MessageCircle, Shield, Smile, Reply, X, Ban } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useStreamBan } from "@/hooks/useStreamBan";
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

interface LiveChatProps {
  duelId: string;
  participants?: { id: string; name: string }[];
  /** Manager id of the duel — only this user (or admin) can ban from chat. */
  managerId?: string | null;
}

const BAD_WORDS = ["spam", "scam", "idiot", "stupid", "hate", "kill"];
const containsBadWords = (text: string): boolean => {
  const lowerText = text.toLowerCase();
  return BAD_WORDS.some(word => lowerText.includes(word));
};

const EMOJI_REACTIONS = ["🔥", "❤️", "👏", "😂", "🎵", "💯", "🏆", "⭐", "🎤", "💎", "🦁", "👑"];

export const LiveChat = ({ duelId, participants = [], managerId }: LiveChatProps) => {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { user: currentUser } = useAuth();
  const { messages: rawMessages, send } = useEventChat("duel", duelId);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [banTarget, setBanTarget] = useState<ChatMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { bannedIds, isCurrentUserBanned, banUser } = useStreamBan({
    streamType: "duel",
    streamId: duelId,
    currentUserId: currentUser?.id,
  });

  const canModerate = !!currentUser && !!managerId && currentUser.id === managerId;

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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewMessage(val);
    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1 && lastAt === val.length - 1) {
      setShowMentions(true);
      setMentionFilter("");
    } else if (lastAt !== -1) {
      const afterAt = val.slice(lastAt + 1);
      if (!afterAt.includes(" ")) {
        setShowMentions(true);
        setMentionFilter(afterAt.toLowerCase());
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (name: string) => {
    const lastAt = newMessage.lastIndexOf("@");
    setNewMessage(newMessage.slice(0, lastAt) + `@${name} `);
    setShowMentions(false);
    inputRef.current?.focus();
  };

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
      await send(newMessage.trim(), replyTo?.id || null);
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

  const renderMessage = (text: string) => {
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

  const allMentionable = [
    ...participants,
    ...visibleMessages
      .filter(m => !participants.find(p => p.id === m.user_id))
      .map(m => ({ id: m.user_id, name: m.user_name || t("userDefault") }))
      .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
  ].filter(p => !mentionFilter || p.name.toLowerCase().includes(mentionFilter));

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="py-3 border-b">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          {t("liveChat")}
          <span className="ml-auto" title={t("autoModeration")}>
            <Shield className="w-4 h-4 text-green-500" />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 flex flex-col min-h-0">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
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
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{msg.user_name}</span>
                    {participants.find(p => p.id === msg.user_id) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">
                        {participants.find(p => p.id === msg.user_id)?.name.includes("Manager") ? "🎙️" : "🎤"}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{formatTime(msg.created_at)}</span>
                    {canModerate && msg.user_id !== currentUser?.id && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 ml-auto opacity-0 group-hover:opacity-100 text-destructive"
                        title={t("banUserLabel")}
                        onClick={() => setBanTarget(msg)}
                      >
                        <Ban className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm break-words">{renderMessage(msg.message)}</p>
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
        </ScrollArea>

        {showMentions && allMentionable.length > 0 && (
          <div className="mx-3 mb-1 bg-popover border border-border rounded-lg shadow-lg max-h-32 overflow-y-auto">
            {allMentionable.slice(0, 5).map(p => (
              <button
                key={p.id}
                onClick={() => insertMention(p.name)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                @{p.name}
              </button>
            ))}
          </div>
        )}

        {replyTo && (
          <div className="mx-3 mb-1 bg-primary/10 rounded-lg px-3 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
              <Reply className="w-3 h-3 text-primary" />
              <span className="font-medium text-primary">{replyTo.user_name}</span>
              <span className="truncate max-w-[150px]">{replyTo.message}</span>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
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
            onChange={handleInputChange}
            placeholder={isCurrentUserBanned ? t("youAreBanned") : t("messagePlaceholder")}
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
