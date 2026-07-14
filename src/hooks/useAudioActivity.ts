/**
 * useAudioActivity
 * ----------------
 * Mesure le niveau audio d'un MediaStreamTrack via Web Audio AnalyserNode
 * (RMS amplitude). Utilisé pour surligner la caméra qui parle dans un duel
 * ou un concert avec invités.
 *
 * @param stream    - MediaStream ou track audio à analyser
 * @param threshold - amplitude minimum pour considérer "en train de parler"
 * @returns { isSpeaking, level }
 */
import { useEffect, useRef, useState } from "react";

/**
 * Detects whether the given MediaStream is currently producing audio
 * above a small volume threshold. Used to show a "speaking" indicator
 * on guest / artist video tiles so viewers can tell who is actually
 * making noise when several people have their mic on.
 *
 * Lightweight: uses one shared AudioContext per call and an AnalyserNode
 * polled via requestAnimationFrame.
 */
export const useAudioActivity = (
  stream: MediaStream | null | undefined,
  options?: { threshold?: number; enabled?: boolean }
) => {
  const threshold = options?.threshold ?? 18; // 0-255 RMS-ish range
  const enabled = options?.enabled ?? true;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingSinceRef = useRef<number | null>(null);
  const silenceSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !stream) {
      setIsSpeaking(false);
      return;
    }

    const audioTracks = stream.getAudioTracks().filter((t) => t.readyState === "live");
    if (audioTracks.length === 0) {
      setIsSpeaking(false);
      return;
    }

    let cancelled = false;

    try {
      const AudioCtx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx: AudioContext = new AudioCtx();
      ctxRef.current = ctx;
      // Some browsers start the context in 'suspended' state until user gesture.
      ctx.resume?.().catch(() => {});

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (cancelled) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        const now = Date.now();

        if (avg >= threshold) {
          silenceSinceRef.current = null;
          if (speakingSinceRef.current == null) speakingSinceRef.current = now;
          // Require 80ms of sustained signal to flip ON (debounce noise spikes)
          if (now - speakingSinceRef.current >= 80) {
            setIsSpeaking((prev) => (prev ? prev : true));
          }
        } else {
          speakingSinceRef.current = null;
          if (silenceSinceRef.current == null) silenceSinceRef.current = now;
          // Require 250ms of sustained silence to flip OFF (avoid flicker)
          if (now - silenceSinceRef.current >= 250) {
            setIsSpeaking((prev) => (prev ? false : prev));
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.warn("[useAudioActivity] init failed:", err);
    }

    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        sourceRef.current?.disconnect();
      } catch {}
      try {
        analyserRef.current?.disconnect();
      } catch {}
      sourceRef.current = null;
      analyserRef.current = null;
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
      speakingSinceRef.current = null;
      silenceSinceRef.current = null;
      setIsSpeaking(false);
    };
  }, [stream, threshold, enabled]);

  return isSpeaking;
};
