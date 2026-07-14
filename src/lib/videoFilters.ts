/**
 * videoFilters
 * ------------
 * Catalogue de TrackProcessors LiveKit appliqués à la track caméra locale.
 * Chaque filtre = pipeline Canvas2D/OffscreenCanvas qui lit chaque frame et
 * dessine la version filtrée avant publication SFU.
 *
 * Pour ajouter un filtre : exporter un `TrackProcessor<VideoProcessorOptions>`
 * et l'enregistrer dans le registre exporté plus bas.
 */
import type { Room, TrackProcessor, VideoProcessorOptions } from "livekit-client";
import { Track } from "livekit-client";

export interface VideoFilterPreset {
  id: string;
  label: string;
  /** Emoji thumbnail */
  icon: string;
  /** CSS filter string applied via canvas 2D context */
  filter: string;
  /** True when the filter requires more CPU (face-style smoothing via blur composite) */
  heavy?: boolean;
}

export const VIDEO_FILTER_PRESETS: VideoFilterPreset[] = [
  { id: "none",     label: "Aucun",      icon: "🚫", filter: "none" },
  { id: "beauty",   label: "Beauté",     icon: "✨", filter: "saturate(1.15) brightness(1.08) contrast(1.05) blur(0.4px)" },
  { id: "smooth",   label: "Lissé",      icon: "💆", filter: "saturate(1.05) brightness(1.05) contrast(0.95) blur(1px)", heavy: true },
  { id: "glow",     label: "Lumineux",   icon: "💡", filter: "brightness(1.18) contrast(1.05) saturate(1.1)" },
  { id: "warm",     label: "Chaud",      icon: "🌅", filter: "sepia(0.25) saturate(1.3) hue-rotate(-10deg) brightness(1.05)" },
  { id: "cool",     label: "Froid",      icon: "❄️", filter: "saturate(1.1) hue-rotate(15deg) brightness(1.02) contrast(1.05)" },
  { id: "vivid",    label: "Vif",        icon: "🎨", filter: "saturate(1.6) contrast(1.15)" },
  { id: "vintage",  label: "Vintage",    icon: "📷", filter: "sepia(0.55) contrast(1.1) brightness(1.05) saturate(0.9)" },
  { id: "noir",     label: "N&B",        icon: "🎞️", filter: "grayscale(1) contrast(1.15) brightness(1.05)" },
  { id: "studio",   label: "Studio",     icon: "🎬", filter: "contrast(1.2) brightness(1.05) saturate(1.1)" },
  { id: "neon",     label: "Néon",       icon: "🌈", filter: "saturate(1.8) hue-rotate(20deg) contrast(1.2) brightness(1.1)" },
  { id: "dream",    label: "Rêve",       icon: "🌙", filter: "saturate(1.1) brightness(1.1) blur(0.6px) contrast(0.95)", heavy: true },
];

export const DEFAULT_FILTER_ID = "none";
export const FILTER_STORAGE_KEY = "video_filter_preset_v1";

/** Get the raw CSS filter string for a preset id (for live local preview). */
export function getFilterCss(filterId: string): string {
  const preset = VIDEO_FILTER_PRESETS.find(p => p.id === filterId);
  return preset?.filter || "none";
}

/**
 * Lightweight TrackProcessor that draws the source video into a canvas with a
 * CSS filter string. The processed canvas captureStream replaces the published
 * camera track so every viewer sees the filter.
 */
export class CanvasFilterProcessor implements TrackProcessor<Track.Kind.Video, VideoProcessorOptions> {
  name = "canvas-filter";
  processedTrack?: MediaStreamTrack;

  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private filterStr: string;
  private mirrored = false;

  constructor(filterStr: string, opts?: { mirrored?: boolean }) {
    this.filterStr = filterStr || "none";
    this.mirrored = !!opts?.mirrored;
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
    this.canvas = document.createElement("canvas");
  }

  setFilter(filterStr: string) {
    this.filterStr = filterStr || "none";
  }

  async init(opts: VideoProcessorOptions): Promise<void> {
    const track = opts.track;
    this.video.srcObject = new MediaStream([track]);
    try { await this.video.play(); } catch { /* ignore */ }

    const settings = track.getSettings();
    const w = settings.width || this.video.videoWidth || 1280;
    const h = settings.height || this.video.videoHeight || 720;
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d", { alpha: false });

    const fps = (settings.frameRate as number) || 30;
    // captureStream is available on HTMLCanvasElement in modern browsers
    const stream = (this.canvas as any).captureStream
      ? (this.canvas as any).captureStream(fps)
      : null;
    this.processedTrack = stream?.getVideoTracks?.()[0];

    const draw = () => {
      const ctx = this.ctx;
      if (ctx && this.video.readyState >= 2) {
        ctx.save();
        // @ts-ignore - filter property exists on 2D context in supporting browsers
        ctx.filter = this.filterStr;
        if (this.mirrored) {
          ctx.translate(this.canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();
      }
      this.raf = requestAnimationFrame(draw);
    };
    draw();
  }

  async restart(opts: VideoProcessorOptions): Promise<void> {
    cancelAnimationFrame(this.raf);
    try { (this.video.srcObject as MediaStream | null)?.getTracks().forEach(() => {}); } catch {}
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    cancelAnimationFrame(this.raf);
    try { this.processedTrack?.stop(); } catch {}
    try { this.video.srcObject = null; } catch {}
    this.processedTrack = undefined;
    this.ctx = null;
  }
}

/**
 * Apply a filter preset to the local camera track of a LiveKit room.
 * Returns the active processor (or null if removed).
 */
export async function applyFilterToRoom(
  room: Room | null,
  filterId: string,
  current: CanvasFilterProcessor | null
): Promise<CanvasFilterProcessor | null> {
  if (!room) return current;
  const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
  const videoTrack = pub?.track as any; // LocalVideoTrack
  if (!videoTrack || typeof videoTrack.setProcessor !== "function") return current;

  const preset = VIDEO_FILTER_PRESETS.find(p => p.id === filterId) || VIDEO_FILTER_PRESETS[0];

  // Removing filter
  if (preset.id === "none" || preset.filter === "none") {
    if (current) {
      try { await videoTrack.stopProcessor(); } catch {}
    }
    return null;
  }

  // Update existing processor in place when possible
  if (current) {
    current.setFilter(preset.filter);
    return current;
  }

  const proc = new CanvasFilterProcessor(preset.filter);
  try {
    await videoTrack.setProcessor(proc);
    return proc;
  } catch (err) {
    console.warn("[videoFilters] setProcessor failed:", err);
    return null;
  }
}

/**
 * Auto-fallback: on low-power devices, hide heavy presets.
 */
export function getAvailablePresets(): VideoFilterPreset[] {
  const cores = (typeof navigator !== "undefined" && (navigator as any).hardwareConcurrency) || 4;
  const lowPower = cores <= 4;
  return lowPower ? VIDEO_FILTER_PRESETS.filter(p => !p.heavy) : VIDEO_FILTER_PRESETS;
}
