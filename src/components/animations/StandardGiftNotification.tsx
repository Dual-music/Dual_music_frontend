/**
 * Notification cadeau standard : toast discret pour petits cadeaux. Broadcast channel realtime.
 */
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface StandardGiftNotificationProps {
  giftName: string;
  giftImage: string;
  senderName: string;
  recipientName: string;
  giftColor?: string;
  onComplete?: () => void;
}

const GIFT_COLORS: Record<string, string> = {
  "Cœur": "#ef4444",
  "Rose": "#f43f5e",
  "Étoile": "#fbbf24",
  "Micro": "#8b5cf6",
  "Feu": "#f97316",
};

export const StandardGiftNotification = ({
  giftName, giftImage, senderName, recipientName, giftColor, onComplete,
}: StandardGiftNotificationProps) => {
  const [show, setShow] = useState(true);
  const color = giftColor || GIFT_COLORS[giftName] || "hsl(var(--primary))";

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const timer = setTimeout(() => setShow(false), 2500);
    const cleanup = setTimeout(() => onCompleteRef.current?.(), 2800);
    return () => { clearTimeout(timer); clearTimeout(cleanup); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!show) return null;

  const notificationContent = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 100, scale: 0.8 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 100, scale: 0.8 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="fixed top-20 right-4 z-[220] pointer-events-none max-w-[300px]"
      >
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3 bg-card/95 backdrop-blur-md shadow-xl"
          style={{ border: `2px solid ${color}`, boxShadow: `0 0 20px ${color}40, 0 4px 12px rgba(0,0,0,0.15)` }}
        >
          <motion.span
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 0.6, repeat: 2 }}
            className="text-3xl shrink-0"
          >
            {giftImage}
          </motion.span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{giftName}</p>
            <p className="text-xs text-muted-foreground truncate">
              <span className="font-semibold" style={{ color }}>{senderName}</span>
              {" → "}
              <span className="font-semibold">{recipientName}</span>
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return notificationContent;
  return createPortal(notificationContent, document.fullscreenElement ?? document.body);
};
