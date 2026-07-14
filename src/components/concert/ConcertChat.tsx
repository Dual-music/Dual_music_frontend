/**
 * Chat concert (`concert_chat_messages`) — variante `ThreadedChat` avec réponses imbriquées, modération inline.
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
import { Send, MessageCircle, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  user_name?: string;
  avatar_url?: string;
}

interface ConcertChatProps {
  concertId: string;
}

const BAD_WORDS = ["spam", "scam", "idiot", "stupid", "hate", "kill"];

const containsBadWords = (text: string): boolean => {
  const lowerText = text.toLowerCase();
  return BAD_WORDS.some(word => lowerText.includes(word));
};

export const ConcertChat = ({ concertId }: ConcertChatProps) => {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { user: currentUser } = useAuth();
  const { messages: rawMessages, send } = useEventChat("concert", concertId);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Derive display rows (author name + avatar) from the hook messages.
  const messages: ChatMessage[] = useMemo(
    () =>
      rawMessages.map(m => ({
        ...m,
        user_name: m.profile?.full_name || t("userDefault"),
        avatar_url: m.profile?.avatar_url ?? undefined,
      })),
    [rawMessages, t],
  );

  // Auto-scroll chat without moving the whole page
  useEffect(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    
    if (!currentUser) {
      toast({
        title: t("loginRequired"),
        description: t("mustBeLoggedToChat"),
        variant: "destructive"
      });
      return;
    }

    if (containsBadWords(newMessage)) {
      toast({
        title: t("messageRefused"),
        description: t("inappropriateContent"),
        variant: "destructive"
      });
      return;
    }

    setSending(true);
    const messageToSend = newMessage.trim();
    setNewMessage("");

    try {
      await send(messageToSend);
    } catch (error: any) {
      setNewMessage(messageToSend);
      toast({
        title: t("errorTitle"),
        description: error.message || t("cannotSendMessage"),
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(language === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="py-3 border-b shrink-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          {t("concertChat")}
          <span className="ml-auto" title={t("autoModeration")}>
            <Shield className="w-4 h-4 text-green-500" />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 p-4 overflow-y-auto overflow-x-hidden" ref={scrollRef}>
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 mb-3"
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage src={msg.avatar_url || ""} />
                  <AvatarFallback className="text-xs">
                    {msg.user_name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {msg.user_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.message}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{t("beFirstToSendMessage")}</p>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="p-3 border-t flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={t("writeMessage")}
            maxLength={200}
            disabled={!currentUser}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={sending || !currentUser}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
