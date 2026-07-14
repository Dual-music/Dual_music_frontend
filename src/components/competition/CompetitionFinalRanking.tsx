/**
 * Compétition: CompetitionFinalRanking — overlay portal post-compétition
 * affichant le podium et le classement complet (1er au dernier).
 *
 * EN — Final ranking overlay shown when a competition transitions to
 * `finished`. Inspired by `WinnerAnnouncement` (duels) but adapted for
 * an N-candidate podium with confetti and applause.
 *
 * @param  competitionId  ID de la compétition
 * @param  profiles       Map artist_id → { full_name, avatar_url }
 * @param  onClose        Callback de fermeture (manager/admin uniquement)
 * @param  canDismiss     Indique si l'utilisateur courant peut fermer
 * @see    finalize_competition_ranking RPC
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { listCandidates } from "@/api/endpoints/competitions";
import { useLanguage } from "@/contexts/LanguageContext";
import { Trophy, Crown, Medal, X } from "lucide-react";

interface Props {
  competitionId: string;
  profiles: Record<string, any>;
  canDismiss?: boolean;
  onClose?: () => void;
}

const APPLAUSE_URL = "https://assets.mixkit.co/active_storage/sfx/1011/1011-preview.mp3";

export const CompetitionFinalRanking = ({ competitionId, profiles, canDismiss = false, onClose }: Props) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const all = (await listCandidates(competitionId)) as any[];
        const ranked = all
          .filter((c) => c.status === "approved")
          .sort((a, b) => (a.final_rank ?? Infinity) - (b.final_rank ?? Infinity));
        setRows(ranked);
      } catch {
        setRows([]);
      }
    };
    load();
  }, [competitionId]);

  useEffect(() => {
    const a = new Audio(APPLAUSE_URL);
    a.volume = 0.6;
    a.loop = true;
    a.play().catch(() => {});
    audioRef.current = a;
    return () => { a.pause(); a.src = ""; };
  }, []);

  if (!open) return null;

  const winner = rows[0];
  const winnerProfile = winner ? profiles[winner.artist_id] : null;
  const confettiColors = ["#fbbf24", "#ef4444", "#8b5cf6", "#22c55e", "#06b6d4", "#f97316", "#ec4899"];

  const handleClose = () => {
    setOpen(false);
    audioRef.current?.pause();
    onClose?.();
  };

  const content = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[250] flex items-center justify-center px-4 py-6 bg-black/85 backdrop-blur-sm overflow-y-auto"
      >
        <motion.div
          initial={{ scale: 0.85, y: 30 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 22 }}
          className="relative w-full max-w-lg bg-card border border-yellow-500/40 rounded-2xl shadow-2xl shadow-yellow-500/20 p-5"
        >
          {canDismiss && (
            <Button
              variant="ghost" size="icon"
              onClick={handleClose}
              className="absolute top-2 right-2 h-8 w-8 text-muted-foreground"
              aria-label={t("compClose")}
            >
              <X className="w-4 h-4" />
            </Button>
          )}

          <div className="text-center mb-4">
            <motion.div
              animate={{ y: [0, -8, 0], rotate: [0, 4, -4, 0] }}
              transition={{ duration: 2.4, repeat: Infinity }}
              className="text-5xl"
            >
              👑
            </motion.div>
            <h2 className="text-2xl font-black mt-2 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 bg-clip-text text-transparent">
              {t("compFinalRanking")}
            </h2>
          </div>

          {winner && (
            <div className="flex flex-col items-center text-center mb-5">
              <div className="ring-4 ring-yellow-500 ring-offset-4 ring-offset-card rounded-full">
                <Avatar className="w-20 h-20">
                  <AvatarImage src={winnerProfile?.avatar_url || ""} />
                  <AvatarFallback className="text-2xl bg-gradient-to-r from-yellow-500 to-amber-500 text-white">
                    {(winnerProfile?.full_name || "?")[0]}
                  </AvatarFallback>
                </Avatar>
              </div>
              <p className="text-xs uppercase tracking-wider text-yellow-400 mt-3 flex items-center gap-1">
                <Crown className="w-3 h-3" /> {t("compWinner")}
              </p>
              <p className="text-xl font-bold">{winnerProfile?.full_name || winner.artist_id.slice(0, 6)}</p>
              <p className="text-sm text-muted-foreground">
                {Number(winner.total_votes) + Number(winner.total_gifts_credits)} pts
              </p>
            </div>
          )}

          <ol className="space-y-1.5 max-h-[40vh] overflow-y-auto">
            {rows.map((r, i) => {
              const p = profiles[r.artist_id];
              const rank = r.final_rank ?? i + 1;
              const score = Number(r.total_votes) + Number(r.total_gifts_credits);
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                    rank === 1 ? "border-yellow-500/50 bg-yellow-500/10" :
                    rank === 2 ? "border-zinc-400/40 bg-zinc-400/10" :
                    rank === 3 ? "border-amber-700/40 bg-amber-700/10" :
                    "border-border"
                  }`}
                >
                  <span className="w-7 text-center font-black text-sm">
                    {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`}
                  </span>
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={p?.avatar_url || ""} />
                    <AvatarFallback className="text-xs">{(p?.full_name || "?")[0]}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-sm font-medium">
                    {p?.full_name || r.artist_id.slice(0, 6)}
                  </span>
                  <span className="text-sm font-black text-primary">{score}</span>
                </li>
              );
            })}
          </ol>

          {!rows.length && (
            <p className="text-center text-sm text-muted-foreground py-4">—</p>
          )}

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Trophy className="w-3.5 h-3.5" /> {t("compWinnerAnnounced")}
          </div>
        </motion.div>

        {/* Confetti rain */}
        {[...Array(40)].map((_, i) => (
          <motion.div
            key={`c-${i}`}
            initial={{ x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 800), y: -20, rotate: 0 }}
            animate={{
              y: (typeof window !== "undefined" ? window.innerHeight : 600) + 20,
              rotate: Math.random() * 720,
            }}
            transition={{
              duration: 3 + Math.random() * 3,
              delay: Math.random() * 1.5,
              repeat: Infinity,
              repeatDelay: Math.random() * 2,
              ease: "linear",
            }}
            className="absolute w-2.5 h-3 rounded-sm pointer-events-none"
            style={{ background: confettiColors[i % confettiColors.length] }}
          />
        ))}

        {/* Ovation emoji rain — trophées et mains qui applaudissent. */}
        {[...Array(20)].map((_, i) => {
          const emojis = ["🏆", "👏", "🙌", "🎉", "👑", "🥇", "⭐"];
          return (
            <motion.div
              key={`o-${i}`}
              initial={{ x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 800), y: -60, opacity: 1 }}
              animate={{
                y: (typeof window !== "undefined" ? window.innerHeight : 600) + 60,
                rotate: Math.random() * 360,
              }}
              transition={{
                duration: 4 + Math.random() * 4,
                delay: Math.random() * 2,
                repeat: Infinity,
                repeatDelay: Math.random() * 3,
                ease: "linear",
              }}
              className="absolute text-3xl pointer-events-none"
            >
              {emojis[i % emojis.length]}
            </motion.div>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.fullscreenElement ?? document.body);
};

export default CompetitionFinalRanking;
