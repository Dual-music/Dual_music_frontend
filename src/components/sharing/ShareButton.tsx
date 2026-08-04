/**
 * Bouton partage social : Web Share API mobile (bottom-sheet), fallback popover desktop
 * (WhatsApp, X, Facebook, copier lien). Track via `content_shares` table.
 */
import { useState, useEffect } from "react";
import * as content from "@/api/endpoints/content";
import { Share2, Copy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";

interface ShareButtonProps {
  contentType: "duel" | "live" | "concert" | "artist_profile" | "lifestyle" | "competition";
  contentId: string;
  title: string;
  className?: string;
  variant?: "default" | "overlay";
}

const PLATFORMS = [
  { key: "whatsapp", label: "WhatsApp", icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/whatsapp.svg", color: "#25D366", getUrl: (url: string, text: string) => `https://wa.me/?text=${encodeURIComponent(text + " " + url)}` },
  { key: "facebook", label: "Facebook", icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/facebook.svg", color: "#1877F2", getUrl: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  { key: "twitter", label: "X / Twitter", icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/x.svg", color: "#000000", getUrl: (url: string, text: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
  { key: "telegram", label: "Telegram", icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/telegram.svg", color: "#26A5E4", getUrl: (url: string, text: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
  { key: "linkedin", label: "LinkedIn", icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/linkedin.svg", color: "#0A66C2", getUrl: (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
];

export const ShareButton = ({ contentType, contentId, title, className = "", variant = "default" }: ShareButtonProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [shareCount, setShareCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const isMobile = useIsMobile();

  const shareUrl = `${window.location.origin}/${contentType === "duel" ? "duel" : contentType === "live" ? "live" : contentType === "concert" ? "concert" : contentType === "lifestyle" ? "video" : contentType === "competition" ? "competition" : "artist"}/${contentId}`;
  const shareText = `Découvrez "${title}" sur Rhythm Remix Arena !`;

  useEffect(() => {
    loadShareCount();
  }, [contentId, contentType]);

  const loadShareCount = async () => {
    try {
      const { count } = await content.shareCount(contentType, contentId);
      setShareCount(count || 0);
    } catch {
      setShareCount(0);
    }
  };

  const trackShare = async (platform: string) => {
    try {
      await content.share(contentType, contentId, platform);
    } catch {
      /* best-effort share tracking */
    }
    setShareCount(prev => prev + 1);
  };

  const handleShare = async (platform: typeof PLATFORMS[number]) => {
    await trackShare(platform.key);
    window.open(platform.getUrl(shareUrl, shareText), "_blank", "noopener,noreferrer,width=600,height=400");
    setOpen(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      await trackShare("copy_link");
      setCopied(true);
      toast({ title: "Lien copié !", description: "Le lien a été copié dans le presse-papiers." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Erreur", description: "Impossible de copier le lien.", variant: "destructive" });
    }
  };

  const isOverlay = variant === "overlay";

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className={`relative flex items-center justify-center transition-all ${
          isOverlay
            ? "w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70"
            : "gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg bg-card border border-border hover:bg-accent text-foreground"
        }`}
        title="Partager"
      >
        <Share2 className="w-4 h-4" />
        {shareCount > 0 && (
          <span className={`absolute flex items-center justify-center text-[10px] font-bold rounded-full ${
            isOverlay
              ? "-top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground"
              : "-top-2 -right-2 min-w-[18px] h-[18px] px-1 bg-primary text-primary-foreground"
          }`}>
            {shareCount > 999 ? `${(shareCount / 1000).toFixed(1)}k` : shareCount}
          </span>
        )}
        {!isOverlay && <span className="text-sm hidden sm:inline">Partager</span>}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={isMobile ? { opacity: 0, y: 100 } : { opacity: 0, scale: 0.9, y: 8 }}
              animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, scale: 1, y: 0 }}
              exit={isMobile ? { opacity: 0, y: 100 } : { opacity: 0, scale: 0.9, y: 8 }}
              className={isMobile
                ? "fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl shadow-xl p-4"
                : `absolute z-50 bg-card border border-border rounded-xl shadow-xl p-4 min-w-[260px] ${
                    isOverlay ? "top-full mt-2 right-0" : "top-full mt-2 right-0"
                  }`
              }
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Partager sur</h3>
                <button onClick={() => setOpen(false)} className="w-6 h-6 rounded-full hover:bg-muted flex items-center justify-center">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              <div className="grid grid-cols-5 gap-3 mb-4">
                {PLATFORMS.map(platform => (
                  <button
                    key={platform.key}
                    onClick={() => handleShare(platform)}
                    className="flex flex-col items-center gap-1.5 group"
                    title={platform.label}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
                      style={{ backgroundColor: platform.color + "20" }}
                    >
                      <img
                        src={platform.icon}
                        alt={platform.label}
                        className="w-5 h-5"
                        style={{ filter: `brightness(0) saturate(100%)` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground leading-tight text-center">{platform.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 text-xs bg-transparent text-foreground outline-none truncate"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 px-3 text-xs shrink-0"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copied ? "Copié" : "Copier"}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
