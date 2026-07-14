/**
 * Historique diffusions sponsor : liste `sponsor_broadcasts` passés avec stats vues/clics.
 */
import { useEffect, useState } from "react";
import * as sponsors from "@/api/endpoints/sponsors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Clock, Coins, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTz } from "@/lib/datetime";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { useLanguage } from "@/contexts/LanguageContext";

interface PlayRow {
  play_id: string;
  ad_video_id: string;
  ad_title: string;
  triggered_by: string;
  triggered_by_name: string;
  played_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  sponsor_paid_credits: number;
  request_id: string | null;
}

interface Props {
  eventType: "duel" | "concert" | "artist_concert";
  eventId: string;
}

/**
 * History of sponsor ads broadcast during this event.
 * Visible to the event controller (manager / artist) and admins.
 */
export const SponsorAdHistoryPanel = ({ eventType, eventId }: Props) => {
  const { prefs } = useUiPreferences();
  const { language } = useLanguage();
  const tz = prefs.timezone;
  const [rows, setRows] = useState<PlayRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await sponsors.adHistory({ eventType, eventId });
      setRows((data as PlayRow[]) || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!eventId) return;
    // realtime removed (no backend emit); data loads on mount + on action (refresh button).
    load();
  }, [eventId, eventType]);

  const totalDuration = rows.reduce((s, r) => s + (r.duration_seconds || 0), 0);
  const totalCredits = rows.reduce((s, r) => s + Number(r.sponsor_paid_credits || 0), 0);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-amber-500" />
            Historique des publicités
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="h-7 px-2">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <Badge variant="outline" className="font-mono">{rows.length} diffusion{rows.length > 1 ? "s" : ""}</Badge>
          <Badge variant="outline" className="font-mono gap-1"><Clock className="w-3 h-3" />{totalDuration}s</Badge>
          <Badge variant="outline" className="font-mono gap-1"><Coins className="w-3 h-3" />{totalCredits} crédits</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Aucune publicité diffusée.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y">
            {rows.map((r) => (
              <div key={r.play_id} className="px-4 py-2.5 text-sm flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.ad_title || "Publicité"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    par {r.triggered_by_name} • {formatTz(r.played_at, "dd MMM HH:mm:ss", { timezone: tz, language })}
                    {r.ended_at && (
                      <> → {formatTz(r.ended_at, "HH:mm:ss", { timezone: tz, language })}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.ended_at ? (
                    <Badge variant="secondary" className="text-[10px]">{r.duration_seconds || 0}s</Badge>
                  ) : (
                    <Badge className="text-[10px] bg-red-500/15 text-red-400 border-red-500/40 animate-pulse">en cours</Badge>
                  )}
                  {Number(r.sponsor_paid_credits) > 0 && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Coins className="w-3 h-3" />{r.sponsor_paid_credits}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SponsorAdHistoryPanel;
