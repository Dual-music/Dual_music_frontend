/**
 * Bulle top donateur : badge animé donateur courant, basé sur `gift_transactions` agrégées.
 */
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as giftsApi from "@/api/endpoints/gifts";
import { useRoomEvent } from "@/realtime/useRoom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Crown, Sparkles, MessageCircle } from "lucide-react";
import { useUiPreferences } from "@/hooks/useUiPreferences";

interface TopDonor {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  total_amount: number;
  last_message: string | null;
}

interface Props {
  contextType: "duel" | "live" | "concert" | "competition";
  contextId: string;
  /** Minimum delay between two displays (ms). Default 20s. */
  cooldownMs?: number;
}

/**
 * Discreet top-donor card displayed in the same zone as floating emojis.
 * - Shows first top donor on mount, and any new leader after.
 * - Includes the donor's last chat message (or fallback).
 * - Server-side: data via SECURITY DEFINER RPC. Client-side cooldown.
 * - Respects user UI preferences (full / reduced / off).
 * - Positioned ABOVE the floating-emojis column to avoid overlap.
 */
export const TopDonorBubble = ({ contextType, contextId, cooldownMs = 20000 }: Props) => {
  const { prefs } = useUiPreferences();
  const [current, setCurrent] = useState<TopDonor | null>(null);
  const [showCount, setShowCount] = useState(0);
  const [cycleKey, setCycleKey] = useState(0);
  const lastUidRef = useRef<string | null>(null);
  const lastShownAtRef = useRef<number>(0);
  const initializedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTop = async () => {
    let top: TopDonor | null = null;
    try {
      const res = await giftsApi.topDonor({ [`${contextType}Id`]: contextId });
      top = (Array.isArray(res) ? res[0] : res) as TopDonor | null;
    } catch (e) {
      console.warn("[TopDonor] fetch error", e);
      return;
    }
    if (!top || !top.user_id) return;

    const isNewLeader = top.user_id !== lastUidRef.current;
    const isFirst = !initializedRef.current;
    setCurrent(top);

    // Cooldown check
    const now = Date.now();
    const cooledDown = now - lastShownAtRef.current >= cooldownMs;

    if (isNewLeader && (isFirst || cooledDown)) {
      lastUidRef.current = top.user_id;
      initializedRef.current = true;
      lastShownAtRef.current = now;
      setShowCount(2);
      setCycleKey((k) => k + 1);
    } else {
      // Update silently (amount/message can refresh) but don't re-trigger animation
      lastUidRef.current = top.user_id;
      initializedRef.current = true;
    }
  };

  useEffect(() => {
    if (!contextId) return;
    if (prefs.top_donor_mode === "off") return;
    fetchTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId, contextType, prefs.top_donor_mode]);

  // Refresh the top donor when the backend emits a new vote/gift to this room.
  const roomId = prefs.top_donor_mode === "off" ? null : contextId;
  useRoomEvent("/live", contextType, roomId, "vote", fetchTop);
  useRoomEvent("/live", contextType, roomId, "gift", fetchTop);

  // Auto-hide after each display, and chain a 2nd cycle
  useEffect(() => {
    if (showCount <= 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const duration = prefs.top_donor_mode === "reduced" ? 2500 : 4000;
    timerRef.current = setTimeout(() => {
      setShowCount((c) => {
        const next = c - 1;
        if (next > 0) setCycleKey((k) => k + 1);
        return next;
      });
    }, duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [showCount, cycleKey, prefs.top_donor_mode]);

  if (prefs.top_donor_mode === "off") return null;
  const reduced = prefs.top_donor_mode === "reduced";
  const traversing = prefs.top_donor_animation === "traversing" && !prefs.reduce_animations;

  // ── Variant: TRAVERSING marquee across the top of the screen ──
  if (traversing) {
    return (
      <div
        className="fixed left-0 right-0 z-[10050] pointer-events-none overflow-hidden"
        // Place the marquee just under the top action area on every screen size.
        // On mobile we keep it close to the top so it isn't pushed off-screen by overlays.
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 4.25rem)" }}
      >
        <AnimatePresence mode="wait">
          {current && showCount > 0 && (
            <motion.div
              key={`trav-${current.user_id}-${cycleKey}`}
              initial={{ x: "100vw", opacity: 0 }}
              animate={{ x: "-110%", opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ x: { duration: 14, ease: "linear" }, opacity: { duration: 0.3 } }}
              className="inline-flex w-max max-w-none"
              style={{ willChange: "transform" }}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 shadow-xl shadow-amber-500/40 border border-amber-200 whitespace-nowrap">
                <Avatar className="w-5 h-5 sm:w-8 sm:h-8 ring-2 ring-white shrink-0">
                  <AvatarImage src={current.avatar_url || ""} />
                  <AvatarFallback className="text-[10px]">{(current.full_name || "?")[0]}</AvatarFallback>
                </Avatar>
                <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-900 shrink-0" fill="currentColor" />
                <span className="text-[9px] sm:text-xs font-bold uppercase tracking-wider text-amber-900">Top donateur</span>
                <span className="text-[11px] sm:text-sm font-extrabold text-amber-950">{current.full_name || "Anonyme"}</span>
                <span className="text-[11px] sm:text-sm font-black text-amber-950">{Math.round(current.total_amount)} crédits</span>
                {current.last_message?.trim() && (
                  <span className="inline-flex items-center gap-1 text-[9px] sm:text-xs italic text-amber-900/90">
                    <MessageCircle className="w-3 h-3 shrink-0" /> «&nbsp;{current.last_message.trim()}&nbsp;»
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Default variant: discreet card above floating emojis ──
  // Uses fixed positioning so it remains visible on mobile fullscreen layouts.
  return (
    <div
      className="fixed right-2 sm:right-4 z-[55] pointer-events-none"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 11rem)" }}
    >
      <AnimatePresence mode="wait">
        {current && showCount > 0 && (
          <motion.div
            key={`${current.user_id}-${cycleKey}`}
            initial={{ x: 80, opacity: 0, scale: 0.9 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 80, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className={`max-w-[78vw] ${reduced ? "sm:max-w-[14rem]" : "sm:max-w-xs"}`}
          >
            <div className={`relative flex items-center gap-2 ${reduced ? "pl-1.5 pr-2 py-1" : "pl-2 pr-3 py-1.5"} rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 shadow-lg shadow-amber-500/40 border border-amber-200 overflow-hidden`}>
              {!reduced && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none"
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                />
              )}
              <div className="relative shrink-0">
                <Avatar className={`${reduced ? "w-7 h-7" : "w-8 h-8 sm:w-9 sm:h-9"} ring-2 ring-white`}>
                  <AvatarImage src={current.avatar_url || ""} />
                  <AvatarFallback className="text-xs">{(current.full_name || "?")[0]}</AvatarFallback>
                </Avatar>
                <Crown className="absolute -top-1.5 -right-1 w-3 h-3 text-amber-900 drop-shadow" fill="currentColor" />
              </div>
              <div className="relative min-w-0 flex-1">
                <div className="flex items-center gap-0.5 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-amber-900 leading-tight">
                  <Sparkles className="w-2.5 h-2.5" /> Top donateur
                </div>
                <p className={`${reduced ? "text-[11px]" : "text-xs sm:text-sm"} font-extrabold text-amber-950 leading-tight truncate`}>
                  👑 {current.full_name || "Anonyme"}
                </p>
                {!reduced && (
                  <p className="flex items-center gap-1 text-[10px] sm:text-[11px] font-medium text-amber-900/90 leading-tight truncate mt-0.5">
                    <MessageCircle className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate italic">
                      {current.last_message?.trim() || "Pas encore de message"}
                    </span>
                  </p>
                )}
              </div>
              <div className="relative text-right shrink-0 leading-tight">
                <div className={`${reduced ? "text-xs" : "text-sm sm:text-base"} font-black text-amber-950`}>{Math.round(current.total_amount)}</div>
                <div className="text-[8px] sm:text-[9px] font-bold text-amber-800 -mt-0.5">crédits</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TopDonorBubble;
