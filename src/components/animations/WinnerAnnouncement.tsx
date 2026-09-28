/**
 * Annonce gagnant duel : overlay fullscreen post-duel avec confettis. Broadcast portal.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlatformSetting } from "@/hooks/usePlatformSettings";

interface WinnerAnnouncementProps {
  winnerName: string;
  winnerAvatar: string | null;
  winnerVotes: number;
  onStop: () => void;
  /** Only managers can dismiss the animation */
  canDismiss?: boolean;
}

// Fanfare de victoire par défaut, utilisée tant que l'admin n'a pas téléversé son propre son
// (réglage `winner_sound_url`, Admin → Config plateforme → « Son de l'annonce du vainqueur »).
const DEFAULT_APPLAUSE_URL = "https://assets.mixkit.co/active_storage/sfx/2010/2010-preview.mp3";

export const WinnerAnnouncement = ({ winnerName, winnerAvatar, winnerVotes, onStop, canDismiss = true }: WinnerAnnouncementProps) => {
  const [show, setShow] = useState(true);
  const { t } = useLanguage();
  const { data: customSoundUrl } = usePlatformSetting<string | null>("winner_sound_url", null);

  // Joué en boucle tant que l'annonce reste affichée (jusqu'à ce que le manager l'arrête —
  // l'arrêt du son suit automatiquement le démontage du composant à ce moment-là).
  useEffect(() => {
    const audio = new Audio(customSoundUrl || DEFAULT_APPLAUSE_URL);
    audio.volume = 0.7;
    audio.loop = true;
    audio.play().catch(() => {});
    return () => { audio.pause(); audio.src = ""; };
  }, [customSoundUrl]);

  if (!show) return null;

  const confettiColors = ["#fbbf24", "#ef4444", "#8b5cf6", "#22c55e", "#06b6d4", "#f97316", "#ec4899"];
  const celebrationEmojis = ["🏆", "👏", "🙌", "🎉", "👑", "⭐", "🎊", "🔥", "🥇", "💪"];

  const content = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[250] flex items-center justify-center"
      >
        {/* Background */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.9 }}
          className="absolute inset-0 bg-black/80"
        />

        {/* Pulsating glow */}
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="absolute inset-0"
          style={{ background: `radial-gradient(circle, hsl(var(--primary) / 0.5) 0%, transparent 70%)` }}
        />

        {/* Main content */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: [0, 1.2, 1], rotate: [-180, 10, 0] }}
          // `type: "tween"` (pas "spring") : Framer Motion ne supporte les animations
          // spring/inertia qu'avec DEUX valeurs (départ → arrivée), jamais une séquence de
          // keyframes comme ici (0 → 1.2 → 1 pour l'effet de rebond). Avec spring, ça levait une
          // erreur JS non interceptée PENDANT le montage — invisible pour l'auteur de l'annonce
          // (son propre `setWinnerAnnouncement` local avait déjà affiché le fond noir avant le
          // crash) mais bloquant tout le contenu (couronne, avatar, nom, votes) chez les
          // spectateurs qui recevaient l'annonce par diffusion temps réel : le fond noir
          // apparaissait (bloquant bien les clics, d'où l'illusion que « ça prenait »), mais rien
          // à l'intérieur ne s'affichait jamais.
          transition={{ duration: 1, type: "tween", ease: "easeOut" }}
          className="relative z-10 flex flex-col items-center text-center px-4"
        >
          {/* Crown */}
          <motion.div
            animate={{ y: [0, -15, 0], rotate: [0, 5, -5, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-7xl md:text-8xl mb-2"
          >
            👑
          </motion.div>

          {/* Winner avatar */}
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="relative"
          >
            <div className="ring-4 ring-yellow-500 ring-offset-4 ring-offset-black rounded-full">
              <Avatar className="w-28 h-28 md:w-36 md:h-36">
                <AvatarImage src={winnerAvatar || ""} />
                <AvatarFallback className="text-4xl bg-gradient-to-r from-yellow-500 to-amber-500 text-white">
                  {winnerName.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>
            <motion.div
              animate={{ scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="absolute -top-2 -right-2 text-3xl"
            >
              🏆
            </motion.div>
          </motion.div>

          {/* Congratulations */}
          <motion.h1
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-3xl md:text-5xl font-black text-white mt-6"
            style={{ textShadow: "0 2px 20px hsl(var(--primary)), 0 0 40px rgba(250,204,21,0.5)" }}
          >
            🎉 FÉLICITATIONS ! 🎉
          </motion.h1>

          {/* Winner name */}
          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1, scale: [1, 1.05, 1] }}
            transition={{ delay: 0.7, scale: { duration: 1, repeat: Infinity } }}
            className="text-4xl md:text-6xl font-black mt-3"
            style={{
              background: "linear-gradient(135deg, #fbbf24, #f59e0b, #fbbf24)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: "none",
              filter: "drop-shadow(0 0 20px rgba(250,204,21,0.5))"
            }}
          >
            {winnerName}
          </motion.h2>

          {/* Vote count */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1, type: "spring" }}
            className="bg-card/80 backdrop-blur-md rounded-2xl px-8 py-4 mt-4 border border-yellow-500/40"
          >
            <p className="text-lg text-muted-foreground">Votes obtenus</p>
            <p className="text-5xl md:text-6xl font-black text-yellow-500">{winnerVotes}</p>
          </motion.div>

          {/* Stop button — only visible for manager */}
          {canDismiss && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2 }}
              onClick={() => { setShow(false); onStop(); }}
              className="mt-6 px-6 py-2 bg-destructive text-destructive-foreground rounded-full font-semibold hover:bg-destructive/80 transition-colors pointer-events-auto"
            >
              {t("stopAnimation") || "Arrêter l'animation"}
            </motion.button>
          )}
        </motion.div>

        {/* Sparkle explosion */}
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={`spark-${i}`}
            initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
            animate={{
              scale: [0, 1.5, 0],
              x: (Math.random() - 0.5) * 800,
              y: (Math.random() - 0.5) * 800,
              opacity: [1, 1, 0],
            }}
            transition={{ duration: 3, delay: i * 0.03, ease: "easeOut" }}
            className="absolute top-1/2 left-1/2 w-3 h-3 rounded-full"
            style={{
              background: confettiColors[i % confettiColors.length],
              boxShadow: `0 0 15px ${confettiColors[i % confettiColors.length]}`,
            }}
          />
        ))}

        {/* Ring waves */}
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={`ring-${i}`}
            initial={{ scale: 0.5, opacity: 0.8 }}
            animate={{ scale: [0.5, 4, 6], opacity: [0.8, 0.2, 0] }}
            transition={{ duration: 3, delay: i * 0.4, ease: "easeOut", repeat: Infinity, repeatDelay: 2 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full border-4 border-yellow-500"
            style={{ boxShadow: "0 0 40px rgba(250,204,21,0.4)" }}
          />
        ))}

        {/* Confetti rain */}
        {[...Array(70)].map((_, i) => (
          <motion.div
            key={`confetti-${i}`}
            initial={{ x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 800), y: -20, rotate: 0, opacity: 1 }}
            animate={{ y: (typeof window !== "undefined" ? window.innerHeight : 600) + 20, rotate: Math.random() * 720, opacity: [1, 1, 0] }}
            transition={{ duration: 3 + Math.random() * 3, delay: Math.random() * 1, ease: "linear", repeat: Infinity, repeatDelay: Math.random() * 2 }}
            className="absolute w-3 h-4 rounded-sm"
            style={{ background: confettiColors[i % confettiColors.length] }}
          />
        ))}

        {/* Emoji rain */}
        {[...Array(25)].map((_, i) => (
          <motion.div
            key={`emoji-${i}`}
            initial={{ x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 800), y: -60, opacity: 1 }}
            animate={{ y: (typeof window !== "undefined" ? window.innerHeight : 600) + 60, rotate: Math.random() * 360 }}
            transition={{ duration: 4 + Math.random() * 4, delay: Math.random() * 2, repeat: Infinity, repeatDelay: Math.random() * 3 }}
            className="absolute text-4xl pointer-events-none"
          >
            {celebrationEmojis[i % celebrationEmojis.length]}
          </motion.div>
        ))}
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.fullscreenElement ?? document.body);
};
