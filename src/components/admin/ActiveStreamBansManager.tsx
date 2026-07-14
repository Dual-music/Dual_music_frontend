/**
 * ActiveStreamBansManager
 * -----------------------
 * Vue admin des bannissements event-scoped actifs (`stream_bans`).
 *
 * Ces bans sont posés par les ARTISTES (concerts/lives) ou le MANAGER (duels)
 * et ne concernent QUE l'évènement courant. L'admin peut les consulter,
 * en lever un à la demande, ou les convertir en ban plateforme si l'abus
 * est récurrent.
 *
 * Colonnes : utilisateur banni, stream concerné, posé par, motif, date.
 */
import { useEffect, useState } from "react";
import { listStreamBans, removeStreamBan } from "@/api/endpoints/moderation";
import { getDisplayProfiles } from "@/api/endpoints/users";
import { ApiError } from "@/api/http";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatTz } from "@/lib/datetime";
import { useToast } from "@/hooks/use-toast";
import { Ban, Undo2 } from "lucide-react";

interface BanRow {
  id: string;
  stream_type: string;
  stream_id: string;
  banned_user_id: string;
  banned_by: string;
  reason: string | null;
  created_at: string;
  banned_name?: string;
  banned_by_name?: string;
}

/**
 * Active per-event bans (live / concert / duel).
 * Admin can revoke any of them; revoking removes the row and restores access.
 */
export const ActiveStreamBansManager = () => {
  const { language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const { toast } = useToast();
  const [rows, setRows] = useState<BanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "live" | "concert" | "duel">("all");

  useEffect(() => { void load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    let data: any[];
    try {
      data = (await listStreamBans()) as any[];
    } catch {
      setRows([]); setLoading(false); return;
    }
    if (filter !== "all") data = data.filter((r: any) => r.stream_type === filter);
    if (!data || data.length === 0) { setRows([]); setLoading(false); return; }
    const ids = [...new Set(data.flatMap((r: any) => [r.banned_user_id, r.banned_by]))];
    const profiles = await getDisplayProfiles(ids);
    const map = new Map(profiles.map((p) => [p.id, p.full_name]));
    setRows(data.map((r: any) => ({
      ...r,
      banned_name: (map.get(r.banned_user_id) as string) || "—",
      banned_by_name: (map.get(r.banned_by) as string) || "—",
    })));
    setLoading(false);
  };

  const revoke = async (id: string) => {
    try {
      await removeStreamBan(id);
      toast({ title: language === "fr" ? "Bannissement levé" : "Ban revoked" });
      void load();
    } catch (e) {
      toast({
        title: e instanceof ApiError ? e.message : language === "fr" ? "Erreur" : "Error",
        variant: "destructive",
      });
    }
  };

  const fmt = (dt: string) => formatTz(dt, "dd MMM yyyy HH:mm", { timezone: tz, language });

  const tr = language === "en"
    ? { title: "Active event bans", subtitle: "Per-event bans (live/concert/duel) issued by hosts, managers or admins.",
        empty: "No active event ban.", all: "All", revoke: "Revoke ban", scope: "Affects this event only" }
    : { title: "Bannissements d'événement actifs", subtitle: "Bannissements ciblés sur un live, concert ou duel, posés par l'organisateur, le manager ou l'admin.",
        empty: "Aucun bannissement d'événement actif.", all: "Tous", revoke: "Lever le bannissement", scope: "Concerne uniquement cet événement" };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Ban className="w-5 h-5" />{tr.title}</CardTitle>
        <CardDescription>{tr.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-3">
          {(["all","live","concert","duel"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? tr.all : f}
            </Button>
          ))}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Ban className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>{tr.empty}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="border border-border rounded-lg p-3 bg-card/50 flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] capitalize">{r.stream_type}</Badge>
                      <span className="font-semibold text-sm">{r.banned_name}</span>
                      <span className="text-[11px] text-muted-foreground">par {r.banned_by_name}</span>
                    </div>
                    {r.reason && <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {fmt(r.created_at)} · <span className="italic">{tr.scope}</span>
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => revoke(r.id)}>
                    <Undo2 className="w-3 h-3 mr-1" />{tr.revoke}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default ActiveStreamBansManager;
