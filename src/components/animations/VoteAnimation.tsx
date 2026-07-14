/**
 * Animation vote duel : flash visuel sur clic vote, side effect du `VotePanel`.
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Particle {
  id: string;
  x: number;
  y: number;
  color: string;
  size: number;
  rotation: number;
  delay: number;
}

interface Heart {
  id: string;
  x: number;
  y: number;
  scale: number;
  delay: number;
}

interface VoteAnimationProps {
  amount: number;
  artistName: string;
  color: string;
}

export const VoteAnimation = ({ amount, artistName, color }: VoteAnimationProps) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const newParticles: Particle[] = Array.from({ length: 30 }, (_, i) => ({
      id: `particle-${Date.now()}-${i}`,
      x: (Math.random() - 0.5) * 400,
      y: (Math.random() - 0.5) * 400,
      color: color,
      size: Math.random() * 25 + 15,
      rotation: Math.random() * 360,
      delay: i * 0.02,
    }));
    setParticles(newParticles);

    const newHearts: Heart[] = Array.from({ length: 10 }, (_, i) => ({
      id: `heart-${Date.now()}-${i}`,
      x: (Math.random() - 0.5) * 300,
      y: Math.random() * 200 + 100,
      scale: Math.random() * 0.5 + 0.5,
      delay: i * 0.1,
    }));
    setHearts(newHearts);

    const timer = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(timer);
  }, [color]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden">
      <AnimatePresence>
        {/* Main amount display with burst effect */}
        <motion.div
          initial={{ scale: 0, opacity: 0, rotate: -180 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 1.5, opacity: 0, rotate: 180 }}
          transition={{ type: "spring", damping: 15 }}
          className="text-center relative z-10"
        >
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              textShadow: [
                `0 0 20px ${color}`,
                `0 0 40px ${color}`,
                `0 0 20px ${color}`,
              ],
            }}
            transition={{ duration: 0.5, repeat: 2 }}
            className="text-7xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent"
            style={{ textShadow: `0 0 30px ${color}` }}
          >
            +${amount}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-3xl font-semibold text-foreground mt-2"
          >
            {artistName}
          </motion.div>
        </motion.div>

        {/* Explosion particles with trails */}
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
            animate={{
              x: particle.x,
              y: particle.y,
              opacity: 0,
              scale: 0,
              rotate: particle.rotation,
            }}
            transition={{ 
              duration: 2, 
              ease: "easeOut",
              delay: particle.delay 
            }}
            className="absolute"
            style={{
              width: particle.size,
              height: particle.size,
              background: `radial-gradient(circle, ${particle.color}, transparent)`,
              borderRadius: "50%",
              boxShadow: `0 0 30px ${particle.color}, 0 0 60px ${particle.color}`,
              filter: "blur(1px)",
            }}
          >
            {/* Trailing effect */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background: `linear-gradient(135deg, ${particle.color}, transparent)`,
                filter: "blur(2px)",
              }}
              animate={{
                scale: [1, 2, 3],
                opacity: [0.8, 0.3, 0],
              }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </motion.div>
        ))}

        {/* Floating hearts */}
        {hearts.map((heart) => (
          <motion.div
            key={heart.id}
            initial={{ x: heart.x, y: 100, opacity: 0, scale: 0 }}
            animate={{
              y: -heart.y,
              opacity: [0, 1, 1, 0],
              scale: heart.scale,
              rotate: [0, 10, -10, 0],
            }}
            transition={{
              duration: 3,
              delay: heart.delay,
              ease: "easeInOut",
            }}
            className="absolute text-4xl"
          >
            ❤️
          </motion.div>
        ))}

        {/* Color burst rings */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={`ring-${i}`}
            initial={{ scale: 0, opacity: 0.8 }}
            animate={{
              scale: [0, 3, 5],
              opacity: [0.8, 0.3, 0],
            }}
            transition={{
              duration: 1.5,
              delay: i * 0.2,
              ease: "easeOut",
            }}
            className="absolute inset-0 rounded-full"
            style={{
              border: `4px solid ${color}`,
              boxShadow: `0 0 40px ${color}`,
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};
