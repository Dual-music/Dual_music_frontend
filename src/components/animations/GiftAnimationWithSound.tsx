/**
 * Animation cadeau avec son : variante avec audio synchrone, failsafe timer pour cleanup.
 */
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface GiftAnimationWithSoundProps {
  giftName: string;
  giftImage: string;
  senderName: string;
  recipientName: string;
  enableSound?: boolean;
  onComplete?: () => void;
}

// Map gift names to their sounds and intensity tiers
const giftAssets: Record<string, { sound: string; emoji: string; tier: "common" | "rare" | "epic" | "legendary" }> = {
  "Cœur": { 
    sound: "https://assets.mixkit.co/active_storage/sfx/2004/2004-preview.mp3",
    emoji: "❤️", tier: "common"
  },
  "Rose": { 
    sound: "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3",
    emoji: "🌹", tier: "common"
  },
  "Étoile": { 
    sound: "https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3",
    emoji: "⭐", tier: "common"
  },
  "Micro": { 
    sound: "https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3",
    emoji: "🎤", tier: "rare"
  },
  "Feu": { 
    sound: "https://assets.mixkit.co/active_storage/sfx/1046/1046-preview.mp3",
    emoji: "🔥", tier: "rare"
  },
  "Fusée": { 
    sound: "https://assets.mixkit.co/active_storage/sfx/1103/1103-preview.mp3",
    emoji: "🚀", tier: "rare"
  },
  "Couronne": { 
    sound: "https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3",
    emoji: "👑", tier: "epic"
  },
  "Diamant": { 
    sound: "https://assets.mixkit.co/active_storage/sfx/2001/2001-preview.mp3",
    emoji: "💎", tier: "epic"
  },
  "Trophée": { 
    sound: "https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3",
    emoji: "🏆", tier: "epic"
  },
  "Lion": { 
    sound: "https://assets.mixkit.co/active_storage/sfx/2877/2877-preview.mp3",
    emoji: "🦁", tier: "legendary"
  },
};

const tierConfig = {
  common: { particles: 15, confetti: 20, rings: 2, duration: 2500, emojiSize: "text-[120px]", sparkleColors: ["#fbbf24", "#ef4444"] },
  rare: { particles: 25, confetti: 35, rings: 3, duration: 3500, emojiSize: "text-[150px]", sparkleColors: ["#fbbf24", "#ef4444", "#8b5cf6"] },
  epic: { particles: 35, confetti: 50, rings: 4, duration: 4500, emojiSize: "text-[180px]", sparkleColors: ["#fbbf24", "#ef4444", "#8b5cf6", "#22c55e"] },
  legendary: { particles: 50, confetti: 70, rings: 5, duration: 5500, emojiSize: "text-[200px]", sparkleColors: ["#fbbf24", "#ef4444", "#8b5cf6", "#22c55e", "#06b6d4"] },
};

export const GiftAnimationWithSound = ({ 
  giftName, giftImage, senderName, recipientName, enableSound = true, onComplete 
}: GiftAnimationWithSoundProps) => {
  const [show, setShow] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const asset = giftAssets[giftName] || Object.values(giftAssets)[0];
  const tier = asset?.tier || "common";
  const config = tierConfig[tier];
  const displayEmoji = asset?.emoji || giftImage || "🎁";

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (enableSound && asset?.sound) {
      audioRef.current = new Audio(asset.sound);
      audioRef.current.volume = 0.8;
      audioRef.current.play().catch(() => {});
    }
    const timer = setTimeout(() => { setShow(false); }, config.duration);
    const cleanupTimer = setTimeout(() => { onCompleteRef.current?.(); }, config.duration + 300);
    return () => { clearTimeout(timer); clearTimeout(cleanupTimer); audioRef.current?.pause(); audioRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.sound, enableSound, config.duration]);

  if (!show) return null;

  const animationContent = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[220] pointer-events-none flex items-center justify-center"
      >
        {/* Background overlay - stronger for legendary */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: tier === "legendary" ? 0.85 : 0.6 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60"
        />

        {/* Pulsating background glow for epic+ */}
        {(tier === "epic" || tier === "legendary") && (
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 70%)`,
            }}
          />
        )}

        {/* Main gift animation */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: [0, 1.5, 1], rotate: [-180, 0, 0] }}
          transition={{ duration: 0.8, type: "spring", stiffness: 200 }}
          className="relative z-10 flex flex-col items-center"
        >
          {/* Giant gift icon */}
          <motion.div
            animate={{ scale: [1, 1.15, 1], y: [0, -25, 0] }}
            transition={{ duration: 1, repeat: Infinity, repeatType: "reverse" }}
            className={`${config.emojiSize} leading-none filter drop-shadow-2xl`}
            style={{ textShadow: "0 0 80px hsl(var(--primary)), 0 0 160px hsl(var(--accent))" }}
          >
            {displayEmoji}
          </motion.div>

          {/* Gift name + sender info */}
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center mt-4 space-y-2"
          >
            <motion.h2
              className="text-4xl md:text-5xl font-black text-white"
              style={{ textShadow: "0 2px 20px hsl(var(--primary)), 0 0 40px hsl(var(--accent))" }}
              animate={tier === "legendary" ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              {giftName}
            </motion.h2>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.8, type: "spring" }}
              className="bg-card/80 backdrop-blur-md rounded-full px-6 py-2 inline-flex items-center gap-2 border border-primary/30"
            >
              <span className="text-lg font-bold text-primary">{senderName}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-lg font-bold text-accent">{recipientName}</span>
            </motion.div>
          </motion.div>

          {/* Sparkle explosion */}
          {[...Array(config.particles)].map((_, i) => (
            <motion.div
              key={`spark-${i}`}
              initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
              animate={{
                scale: [0, 1.5, 0],
                x: (Math.random() - 0.5) * 600,
                y: (Math.random() - 0.5) * 600,
                opacity: [1, 1, 0],
              }}
              transition={{ duration: 2.5, delay: i * 0.02, ease: "easeOut" }}
              className="absolute top-1/2 left-1/2 w-3 h-3 rounded-full"
              style={{
                background: config.sparkleColors[i % config.sparkleColors.length],
                boxShadow: `0 0 20px ${config.sparkleColors[i % config.sparkleColors.length]}`,
              }}
            />
          ))}

          {/* Ring waves */}
          {[...Array(config.rings)].map((_, i) => (
            <motion.div
              key={`ring-${i}`}
              initial={{ scale: 0.5, opacity: 0.8 }}
              animate={{ scale: [0.5, 3.5, 5], opacity: [0.8, 0.3, 0] }}
              transition={{ duration: 2.5, delay: i * 0.3, ease: "easeOut" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full border-4 border-primary"
              style={{ boxShadow: "0 0 40px hsl(var(--primary))" }}
            />
          ))}
        </motion.div>

        {/* Floating confetti */}
        {[...Array(config.confetti)].map((_, i) => (
          <motion.div
            key={`confetti-${i}`}
            initial={{ x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 800), y: -20, rotate: 0, opacity: 1 }}
            animate={{ y: (typeof window !== "undefined" ? window.innerHeight : 600) + 20, rotate: Math.random() * 720, opacity: [1, 1, 0] }}
            transition={{ duration: 3 + Math.random() * 2, delay: Math.random() * 0.5, ease: "linear" }}
            className="absolute w-3 h-4 rounded-sm"
            style={{
              background: config.sparkleColors[i % config.sparkleColors.length],
            }}
          />
        ))}

        {/* Legendary: extra mini emoji rain */}
        {tier === "legendary" && [...Array(20)].map((_, i) => (
          <motion.div
            key={`emoji-rain-${i}`}
            initial={{ x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 800), y: -60, opacity: 1 }}
            animate={{ y: (typeof window !== "undefined" ? window.innerHeight : 600) + 60, rotate: Math.random() * 360, opacity: [1, 1, 0.5] }}
            transition={{ duration: 4 + Math.random() * 3, delay: Math.random() * 1.5 }}
            className="absolute text-4xl"
          >
            {displayEmoji}
          </motion.div>
        ))}
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return animationContent;
  return createPortal(animationContent, document.fullscreenElement ?? document.body);
};
