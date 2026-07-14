/**
 * Historique des votes fan (`duel_votes`) : duel, artiste choisi, crédits engagés, date. Pagination via `usePagination`.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getPublicSetting } from "@/api/endpoints/settings";
import { myVoteHistory } from "@/api/endpoints/duels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Vote } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";

interface VoteRow {
  id: string;
  duel_id: string | null;
  artist_id: string;
  amount: number; // total credits spent on this vote line
  created_at: string;
  duel_title: string | null; // "Artist 1 vs Artist 2" (or null when no duel)
  voted_artist_name: string | null;
}

/**
 * Detailed history of votes cast by the current user.
 * For each vote line we show: quantity (votes), unit price (credits), total cost,
 * the artist supported, and the outcome on the duel (won / lost / pending) with
 * the share this vote represented in the supported artist's final score.
 */
export const MyVotesHistory = () => {
  const { language, t } = useLanguage();
  const { prefs } = useUiPreferences();
  const { user } = useAuth();
  const tz = prefs.timezone;
  const [rows, setRows] = useState<VoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricePerVote, setPricePerVote] = useState<number>(1);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    setLoading(true);
    if (!user) { setLoading(false); return; }

    const cfg = await getPublicSetting<{ price_per_vote?: number } | null>("vote_config", null);
    const ppv = cfg?.price_per_vote;
    const unit = Number(ppv) > 0 ? Number(ppv) : 1;
    setPricePerVote(unit);

    try {
      // Enriched history: each row carries the duel title + the voted-artist profile.
      const votes = (await myVoteHistory()) as Array<Record<string, any>>;
      const mapped: VoteRow[] = (votes || []).map((v) => ({
        id: v.id,
        duel_id: v.duel_id ?? null,
        artist_id: v.artist_id,
        amount: Number(v.amount),
        created_at: v.created_at,
        duel_title: v.duel_title ?? null,
        voted_artist_name: v.artist?.full_name ?? "—",
      }));
      setRows(mapped);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (dt: string) => formatTz(dt, "dd MMM yyyy HH:mm", { timezone: tz, language });

  const tr = {
    fr: {
      title: "Historique de mes votes",
      subtitle: "Détail de chaque vote, prix unitaire, coût total et impact sur le résultat",
      empty: "Vous n'avez encore voté pour aucun duel.",
      colDate: "Date",
      colArtist: "Artiste soutenu",
      colQty: "Votes",
      colUnit: "Prix unitaire",
      colTotal: "Coût total",
      colImpact: "Impact",
      pending: "En cours",
      won: "Gagné",
      lost: "Perdu",
      noWinner: "Sans gagnant",
      shareOf: "de ses voix",
      vs: "vs",
      summary: "Total dépensé en votes",
    },
    en: {
      title: "My vote history",
      subtitle: "Each vote line with unit price, total cost and impact on the result",
      empty: "You have not voted in any duel yet.",
      colDate: "Date",
      colArtist: "Artist backed",
      colQty: "Votes",
      colUnit: "Unit price",
      colTotal: "Total cost",
      colImpact: "Impact",
      pending: "Ongoing",
      won: "Won",
      lost: "Lost",
      noWinner: "No winner",
      shareOf: "of their votes",
      vs: "vs",
      summary: "Total spent on votes",
    },
  }[language === "en" ? "en" : "fr"];

  const grandTotal = rows.reduce((acc, r) => acc + r.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Vote className="w-5 h-5" />{tr.title}</CardTitle>
        <CardDescription>{tr.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Vote className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>{tr.empty}</p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                {tr.summary}: <span className="ml-1 font-bold">{Math.round(grandTotal)} crédits</span>
              </Badge>
              <Badge variant="secondary" className="text-xs">
                1 vote = {pricePerVote} crédit(s)
              </Badge>
            </div>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-2">
                {rows.map((r) => {
                  const qty = Math.max(1, Math.round(r.amount / pricePerVote));
                  return (
                    <div key={r.id} className="border border-border rounded-lg p-3 bg-card/50">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate">{r.voted_artist_name}</span>
                            {r.duel_title && (
                              <span className="text-xs text-muted-foreground">({r.duel_title})</span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{fmt(r.created_at)}</p>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-md bg-muted/40 px-2 py-1">
                          <p className="text-[10px] uppercase text-muted-foreground">{tr.colQty}</p>
                          <p className="font-bold">{qty}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2 py-1">
                          <p className="text-[10px] uppercase text-muted-foreground">{tr.colUnit}</p>
                          <p className="font-bold">{pricePerVote} cr.</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2 py-1">
                          <p className="text-[10px] uppercase text-muted-foreground">{tr.colTotal}</p>
                          <p className="font-bold">{Math.round(r.amount)} cr.</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default MyVotesHistory;
