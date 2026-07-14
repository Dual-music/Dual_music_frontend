/**
 * Animation cadeau virtuel : overlay fullscreen avec image cadeau, donateur, montant. Portal
 * z-index 220. Tiers prix affectent animation.
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift } from "lucide-react";

interface GiftAnimationProps {
  giftName: string;
  senderName: string;
  recipientName: string;
}

export const GiftAnimation = ({ giftName, senderName, recipientName }: GiftAnimationProps) => {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-4 z-50 pointer-events-none">
      <AnimatePresence>
        <motion.div
          initial={{ x: -300, opacity: 0, scale: 0.5, rotate: -45 }}
          animate={{ x: 0, opacity: 1, scale: 1, rotate: 0 }}
          exit={{ x: 300, opacity: 0, scale: 1.5, rotate: 45 }}
          transition={{ type: "spring", damping: 15, stiffness: 200 }}
          className="relative bg-gradient-to-r from-primary/90 via-accent/90 to-primary/90 backdrop-blur-lg rounded-2xl p-5 shadow-glow flex items-center gap-4 max-w-sm"
          style={{
            boxShadow: "0 0 40px hsl(var(--primary)), 0 0 80px hsl(var(--accent))",
          }}
        >
          {/* Animated gift icon with multiple effects */}
          <motion.div
            animate={{
              rotate: [0, -15, 15, -15, 0],
              scale: [1, 1.2, 1.2, 1.2, 1],
              y: [0, -5, 0, -5, 0],
            }}
            transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 0.5 }}
            className="relative"
          >
            <Gift className="w-14 h-14 text-white" />
            {/* Glow effect around gift */}
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{ duration: 1, repeat: Infinity }}
              style={{
                background: "radial-gradient(circle, hsl(var(--accent)), transparent)",
                filter: "blur(10px)",
              }}
            />
          </motion.div>

          <div className="flex-1">
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="font-bold text-white text-xl"
            >
              {giftName}
            </motion.div>
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-white/90 text-sm font-medium"
            >
              {senderName} → {recipientName}
            </motion.div>
          </div>

          {/* Sparkle particles */}
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={`sparkle-${i}`}
              initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
              animate={{
                scale: [0, 1.5, 0],
                x: (Math.random() - 0.5) * 200,
                y: -Math.random() * 150 - 50,
                opacity: [1, 0.8, 0],
              }}
              transition={{
                duration: 2,
                delay: i * 0.08,
                ease: "easeOut",
              }}
              className="absolute w-3 h-3 rounded-full"
              style={{
                background: i % 3 === 0 
                  ? "hsl(var(--primary))" 
                  : i % 3 === 1 
                  ? "hsl(var(--accent))" 
                  : "#fbbf24",
                boxShadow: `0 0 15px currentColor`,
              }}
            />
          ))}

          {/* Confetti burst */}
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={`confetti-${i}`}
              initial={{ scale: 1, x: 0, y: 0, opacity: 1, rotate: 0 }}
              animate={{
                x: (Math.random() - 0.5) * 300,
                y: Math.random() * -200 - 100,
                opacity: 0,
                rotate: Math.random() * 720,
                scale: 0,
              }}
              transition={{
                duration: 2.5,
                delay: i * 0.05,
                ease: "easeOut",
              }}
              className="absolute w-2 h-4 rounded-sm"
              style={{
                background: [
                  "hsl(var(--primary))",
                  "hsl(var(--accent))",
                  "#fbbf24",
                  "#ef4444",
                  "#8b5cf6",
                ][i % 5],
              }}
            />
          ))}

          {/* Glow waves */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={`wave-${i}`}
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{
                scale: [1, 2.5, 3.5],
                opacity: [0.6, 0.2, 0],
              }}
              transition={{
                duration: 1.5,
                delay: i * 0.3,
                ease: "easeOut",
              }}
              className="absolute inset-0 rounded-2xl"
              style={{
                border: "3px solid hsl(var(--accent))",
                boxShadow: "0 0 30px hsl(var(--accent))",
              }}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
