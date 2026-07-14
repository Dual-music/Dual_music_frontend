/**
 * Affichage liens sociaux plateforme (lecture seule) : lit `social_links` configurés via
 * `SocialLinksManager`, render icônes dans footer.
 */
import { ExternalLink, Instagram, Twitter, Facebook, Youtube, Music } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const NETWORK_ICONS: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  instagram: { icon: Instagram, label: "Instagram", color: "text-pink-500" },
  twitter: { icon: Twitter, label: "Twitter/X", color: "text-sky-400" },
  x: { icon: Twitter, label: "Twitter/X", color: "text-sky-400" },
  facebook: { icon: Facebook, label: "Facebook", color: "text-blue-600" },
  youtube: { icon: Youtube, label: "YouTube", color: "text-red-500" },
  tiktok: { icon: Music, label: "TikTok", color: "text-foreground" },
  soundcloud: { icon: Music, label: "SoundCloud", color: "text-orange-500" },
  spotify: { icon: Music, label: "Spotify", color: "text-green-500" },
};

function normalizeUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

interface SocialLinksDisplayProps {
  socialLinks: any;
}

export const SocialLinksDisplay = ({ socialLinks }: SocialLinksDisplayProps) => {
  if (!socialLinks) return <span className="text-muted-foreground text-sm">Aucun réseau social</span>;

  let links: Record<string, string> = {};

  if (typeof socialLinks === "string") {
    try { links = JSON.parse(socialLinks); } catch { return <span className="text-muted-foreground text-sm">Format invalide</span>; }
  } else if (typeof socialLinks === "object" && !Array.isArray(socialLinks)) {
    links = socialLinks;
  }

  const entries = Object.entries(links).filter(([, v]) => v && String(v).trim());

  if (entries.length === 0) return <span className="text-muted-foreground text-sm">Aucun réseau social renseigné</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([network, url]) => {
        const networkLow = network.toLowerCase();
        const meta = NETWORK_ICONS[networkLow];
        const Icon = meta?.icon ?? ExternalLink;
        const label = meta?.label ?? network;
        const colorClass = meta?.color ?? "text-foreground";
        const href = normalizeUrl(String(url));

        return (
          <a
            key={network}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-muted/50 transition-colors text-sm font-medium group"
          >
            <Icon className={`w-4 h-4 ${colorClass}`} />
            <span>{label}</span>
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
          </a>
        );
      })}
    </div>
  );
};
