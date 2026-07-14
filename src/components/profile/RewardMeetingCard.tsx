/**
 * Carte récompense saisonnière (`season_winners`) : meeting/visio promis au top donateur, statut de fulfillment et date planifiée.
 */
import { useEffect, useState } from "react";
import * as leaderboards from "@/api/endpoints/leaderboards";
import { ApiError } from "@/api/http";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { CalendarClock, Check, MessageSquare, Trophy } from "lucide-react";

interface WinnerRow {
  id: string;
  season_id: string;
  rank_position: number;
  reward_status: string;
  meeting_status: string;
  meeting_when: string | null;
  meeting_location: string | null;
  meeting_notes: string | null;
  counter_when: string | null;
  counter_location: string | null;
  season_name?: string;
}

interface Props { userId: string; }

const RewardMeetingCard = ({ userId }: Props) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [rows, setRows] = useState<WinnerRow[]>([]);
  const [editing, setEditing] = useState<Record<string, { when: string; location: string; notes: string }>>({});

  const load = async () => {
    // GET /leaderboards/winners returns all winner rows (incl. meeting fields);
    // filter to the caller's active meeting proposals client-side.
    const all = (await leaderboards.allWinners()) as unknown as WinnerRow[] & Array<{ user_id?: string }>;
    const list = (all as any[]).filter(
      (r) => r.user_id === userId && ["proposed", "counter_proposed", "confirmed"].includes(r.meeting_status),
    ) as WinnerRow[];
    if (list.length) {
      try {
        const seasons = (await leaderboards.listSeasons()) as any[];
        const map = new Map(seasons.map((s) => [s.id, s.name]));
        list.forEach((r) => { r.season_name = map.get(r.season_id) as string; });
      } catch {
        /* season names are cosmetic — degrade to blank on failure */
      }
    }
    setRows(list);
  };

  useEffect(() => { if (userId) load(); }, [userId]);

  const respond = async (winnerId: string, action: "confirm" | "counter") => {
    const e = editing[winnerId];
    try {
      await leaderboards.respondMeeting(
        winnerId,
        action === "counter"
          ? {
              meeting_status: "counter_proposed",
              counter_when: new Date(e?.when || "").toISOString(),
              counter_location: e?.location || null,
              counter_notes: e?.notes || null,
            }
          : { meeting_status: "accepted" },
      );
    } catch (err) {
      toast({ title: t("error"), description: err instanceof ApiError ? err.message : undefined, variant: "destructive" });
      return;
    }
    toast({ title: action === "confirm" ? t("rewardMeetingConfirmed") : t("rewardMeetingCounterSent") });
    setEditing(prev => ({ ...prev, [winnerId]: { when: "", location: "", notes: "" } }));
    load();
  };

  if (rows.length === 0) return null;

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString() : "—";

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="w-4 h-4 text-primary" /> {t("rewardMeetingTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map(r => {
          const ed = editing[r.id] || { when: "", location: "", notes: "" };
          return (
            <div key={r.id} className="p-3 rounded-lg bg-muted/30 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm">
                  <strong>#{r.rank_position}</strong> — {r.season_name || ""}
                </div>
                <Badge variant="outline">{t("rewardMeetingStatus_" + r.meeting_status)}</Badge>
              </div>

              {r.meeting_status === "proposed" && (
                <>
                  <div className="text-sm">
                    <CalendarClock className="inline w-4 h-4 mr-1" />
                    {t("rewardMeetingProposedBy")} : <strong>{fmt(r.meeting_when)}</strong>
                    {r.meeting_location && <> — {r.meeting_location}</>}
                  </div>
                  {r.meeting_notes && <p className="text-xs text-muted-foreground">{r.meeting_notes}</p>}
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={() => respond(r.id, "confirm")}>
                      <Check className="w-3 h-3 mr-1" />{t("rewardMeetingConfirmBtn")}
                    </Button>
                  </div>
                  <div className="border-t pt-3 space-y-2">
                    <Label className="text-xs">{t("rewardMeetingCounterTitle")}</Label>
                    <Input type="datetime-local" value={ed.when}
                      onChange={(e) => setEditing(p => ({ ...p, [r.id]: { ...ed, when: e.target.value } }))} />
                    <Input placeholder={t("rewardMeetingLocation")} value={ed.location}
                      onChange={(e) => setEditing(p => ({ ...p, [r.id]: { ...ed, location: e.target.value } }))} />
                    <Textarea placeholder={t("rewardMeetingNotes")} value={ed.notes} rows={2}
                      onChange={(e) => setEditing(p => ({ ...p, [r.id]: { ...ed, notes: e.target.value } }))} />
                    <Button size="sm" variant="outline" onClick={() => respond(r.id, "counter")} disabled={!ed.when}>
                      <MessageSquare className="w-3 h-3 mr-1" />{t("rewardMeetingCounterBtn")}
                    </Button>
                  </div>
                </>
              )}

              {r.meeting_status === "counter_proposed" && (
                <div className="text-sm">
                  {t("rewardMeetingCounterPending")} <strong>{fmt(r.counter_when)}</strong>
                  {r.counter_location && <> — {r.counter_location}</>}
                </div>
              )}

              {r.meeting_status === "confirmed" && (
                <div className="text-sm">
                  ✅ {t("rewardMeetingFinal")} <strong>{fmt(r.meeting_when)}</strong>
                  {r.meeting_location && <> — {r.meeting_location}</>}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default RewardMeetingCard;
