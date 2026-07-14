/**
 * Animation cœurs flottants : particules cœurs montantes sur `live_likes`/`replay_likes`.
 * Persistance via realtime channel.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";
import { useRoomBroadcast } from "@/realtime/useRoomBroadcast";

interface FloatingHeart {
  id: number;
  x: number;
  scale: number;
  color: string;
}

const HEART_COLORS = [
  "text-red-500",
  "text-pink-500",
  "text-rose-400",
  "text-red-400",
  "text-pink-400",
];

export const useFloatingHearts = () => {
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);

  const addHeart = useCallback(() => {
    const id = Date.now() + Math.random();
    const heart: FloatingHeart = {
      id,
      x: Math.random() * 60 - 30,
      scale: 0.6 + Math.random() * 0.8,
      color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
    };
    setHearts((prev) => [...prev.slice(-15), heart]);
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h.id !== id));
    }, 2500);
  }, []);

  return { hearts, addHeart };
};

/**
 * Format like counts using K/M abbreviations to save space.
 * 1000 -> "1K", 1500 -> "1.5K", 1000000 -> "1M".
 */
export const formatLikeCount = (count: number): string => {
  if (count >= 1_000_000) {
    const v = count / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (count >= 1000) {
    const v = count / 1000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return count.toString();
};

/**
 * Hook to broadcast and receive heart "like" animations in real-time
 * via Supabase broadcast. Includes anti-duplication on reconnects and
 * a synchronized count of total likes received on the channel.
 */
export const useBroadcastHearts = (channelName: string | null) => {
  const { hearts, addHeart } = useFloatingHearts();
  const [likeCount, setLikeCount] = useState(0);
  const seenIdsRef = useRef<Map<string, number>>(new Map());

  // Periodic cleanup of seen IDs (TTL 60s) to bound memory.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const map = seenIdsRef.current;
      for (const [id, ts] of map) {
        if (now - ts > 60_000) map.delete(id);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleEvent = useCallback(
    (heartId: string) => {
      if (!heartId) return;
      const map = seenIdsRef.current;
      if (map.has(heartId)) return; // dedupe replays/reconnects
      map.set(heartId, Date.now());
      addHeart();
      setLikeCount((c) => c + 1);
    },
    [addHeart],
  );

  // Reset dedup/count when the channel changes.
  useEffect(() => {
    seenIdsRef.current = new Map();
    setLikeCount(0);
  }, [channelName]);

  const { broadcast } = useRoomBroadcast(channelName, (event, payload) => {
    if (event === "heart_like") {
      const heartId = (payload as { id?: string })?.id;
      if (heartId) handleEvent(heartId);
    }
  });

  const broadcastHeart = useCallback(() => {
    const heartId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    // Local immediate feedback via the same dedup path so the count stays in sync.
    handleEvent(heartId);
    broadcast("heart_like", { id: heartId });
  }, [handleEvent, broadcast]);

  return { hearts, broadcastHeart, likeCount, likeCountLabel: formatLikeCount(likeCount) };
};

interface FloatingHeartsProps {
  hearts: FloatingHeart[];
}

export const FloatingHearts = ({ hearts }: FloatingHeartsProps) => {
  return (
    <div className="absolute bottom-16 right-4 w-16 h-64 pointer-events-none z-30 overflow-hidden">
      <AnimatePresence>
        {hearts.map((heart) => (
          <motion.div
            key={heart.id}
            initial={{ opacity: 1, y: 0, x: 0, scale: 0 }}
            animate={{
              opacity: [1, 1, 0.8, 0],
              y: -250,
              x: [0, heart.x, heart.x * 0.5],
              scale: [0, heart.scale, heart.scale * 0.8, 0],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.5, ease: "easeOut" }}
            className="absolute bottom-0 left-1/2"
          >
            <Heart
              className={`w-6 h-6 ${heart.color} fill-current drop-shadow-lg`}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
