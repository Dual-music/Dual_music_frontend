/**
 * Dialog de partage du lien de parrainage : copy + partage natif Web Share / réseaux sociaux (`content_shares`).
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface ReferralShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referralLink: string;
  referralCode: string;
}

const PLATFORMS = [
  { key: "whatsapp", label: "WhatsApp", icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/whatsapp.svg", color: "#25D366", getUrl: (url: string, text: string) => `https://wa.me/?text=${encodeURIComponent(text + " " + url)}` },
  { key: "facebook", label: "Facebook", icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/facebook.svg", color: "#1877F2", getUrl: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  { key: "twitter", label: "X / Twitter", icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/x.svg", color: "#000000", getUrl: (url: string, text: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
  { key: "telegram", label: "Telegram", icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/telegram.svg", color: "#26A5E4", getUrl: (url: string, text: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
  { key: "linkedin", label: "LinkedIn", icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/linkedin.svg", color: "#0A66C2", getUrl: (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
  { key: "email", label: "Email", icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/maildotru.svg", color: "#7C3AED", getUrl: (url: string, text: string) => `mailto:?subject=${encodeURIComponent("Rejoins-moi sur Dual Music")}&body=${encodeURIComponent(text + "\n\n" + url)}` },
];

export const ReferralShareDialog = ({ open, onOpenChange, referralLink, referralCode }: ReferralShareDialogProps) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const shareText = t("shareInviteText");

  const handleNative = async () => {
    if (typeof navigator !== "undefined" && typeof (navigator as any).share === "function") {
      try {
        await (navigator as any).share({ title: "Dual Music", text: shareText, url: referralLink });
        onOpenChange(false);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          toast({ title: t("error"), description: err?.message || "Partage annulé", variant: "destructive" });
        }
      }
    }
  };

  const handlePlatform = (platform: typeof PLATFORMS[number]) => {
    window.open(platform.getUrl(referralLink, shareText), "_blank", "noopener,noreferrer,width=600,height=480");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast({ title: t("linkCopied") });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: t("error"), description: "Copie impossible", variant: "destructive" });
    }
  };

  const canNative = typeof navigator !== "undefined" && typeof (navigator as any).share === "function";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            {t("shareLink")}
          </DialogTitle>
          <DialogDescription>{t("shareInviteText")}</DialogDescription>
        </DialogHeader>

        {canNative && (
          <Button onClick={handleNative} className="w-full bg-gradient-primary">
            <Share2 className="w-4 h-4 mr-2" /> {t("shareLink")}
          </Button>
        )}

        <div>
          <p className="text-xs text-muted-foreground mb-2">{t("yourReferralCode")}</p>
          <div className="flex items-center gap-2 p-2 bg-muted/40 rounded-lg">
            <Input value={referralCode} readOnly className="bg-transparent font-mono font-bold tracking-wider border-0" />
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">{t("yourReferralLink")}</p>
          <div className="flex items-center gap-2 p-2 bg-muted/40 rounded-lg">
            <input
              readOnly
              value={referralLink}
              className="flex-1 text-xs bg-transparent outline-none truncate text-foreground"
            />
            <Button size="sm" variant="secondary" className="h-7 px-3 text-xs shrink-0" onClick={handleCopy}>
              {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              {copied ? "Copié" : "Copier"}
            </Button>
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-3">Partager sur</p>
          <div className="grid grid-cols-3 gap-3">
            {PLATFORMS.map((platform) => (
              <button
                key={platform.key}
                onClick={() => handlePlatform(platform)}
                className="flex flex-col items-center gap-1.5 group p-2 rounded-lg hover:bg-muted/50 transition-colors"
                title={platform.label}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
                  style={{ backgroundColor: platform.color + "20" }}
                >
                  <img
                    src={platform.icon}
                    alt={platform.label}
                    className="w-6 h-6"
                    style={{ filter: "brightness(0) saturate(100%)" }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground text-center">{platform.label}</span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReferralShareDialog;
