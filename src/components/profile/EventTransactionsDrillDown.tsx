/**
 * Drill-down détaillé d'un événement (concert/duel/live) : agrège tickets, votes, cadeaux, dédicaces, pourboires liés au même `event_id`.
 */
import { useEffect, useState } from "react";
import * as wallet from "@/api/endpoints/wallet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrencyFormatter } from "@/hooks/useCurrency";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";

interface Tx {
  id: string;
  source_type: string;
  created_at: string;
  total_credits: number;
  platform_credits: number;
  manager_credits: number;
  artists_credits: number;
  my_credits: number;
  payer_id: string | null;
}

interface Props {
  sourceId: string;
  eventLabel: string;
}

const SOURCE_LABELS: Record<string, string> = {
  duel_ticket: "Ticket de duel",
  duel_replay: "Replay de duel",
  concert_ticket: "Ticket de concert",
  concert_replay: "Replay de concert",
  gift_concert: "Cadeau (concert)",
  gift_duel: "Cadeau (duel)",
  gift_live: "Cadeau (live)",
  vote: "Vote",
};

const PAGE_SIZE = 10;

export const EventTransactionsDrillDown = ({ sourceId, eventLabel }: Props) => {
  const { toast } = useToast();
  const { language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const fmtDt = (d: string) => formatTz(d, "dd MMM yyyy HH:mm", { timezone: tz, language });
  const { formatPrice } = useCurrencyFormatter();
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = async () => {
    setLoading(true);
    try {
      const { data: rowData, total: totalCount } = await wallet.getEventTransactions({
        sourceId,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setRows((rowData as any) ?? []);
      setTotal(Number(totalCount ?? 0));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, page]);

  const handleCopy = () => {
    const lines = [
      `Événement: ${eventLabel}`,
      `Total transactions: ${total}`,
      `--- Transactions ---`,
      ...rows.map((r) => {
        const date = fmtDt(r.created_at);
        const totalUnit = Number(r.total_credits) > 1 ? "Crédits" : "Crédit";
        const myUnit = Number(r.my_credits) > 1 ? "Crédits" : "Crédit";
        return `${date} | ${SOURCE_LABELS[r.source_type] ?? r.source_type} | total ${Number(r.total_credits).toLocaleString()} ${totalUnit} | plateforme ${Number(r.platform_credits).toLocaleString()} | manager ${Number(r.manager_credits).toLocaleString()} | artistes ${Number(r.artists_credits).toLocaleString()} | reçu ${Number(r.my_credits).toLocaleString()} ${myUnit}`;
      }),
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(
      () => toast({ title: "Copié", description: "Détails copiés dans le presse-papiers." }),
      () => toast({ title: "Erreur", description: "Impossible de copier", variant: "destructive" })
    );
  };

  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{total} transaction{total > 1 ? "s" : ""}</span>
        <Button size="sm" variant="outline" onClick={handleCopy} className="h-7 text-xs">
          <Copy className="w-3 h-3 mr-1" /> Copier les détails
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Chargement...
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">Aucune transaction.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const total = Number(r.total_credits) || 0;
            const my = Number(r.my_credits) || 0;
            const platform = Number(r.platform_credits) || 0;
            const manager = Number(r.manager_credits) || 0;
            const artists = Number(r.artists_credits) || 0;
            const others = Math.max(0, manager + artists - my);
            const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
            return (
              <div key={r.id} className="rounded border bg-card/50 p-2 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="text-[10px]">
                      {SOURCE_LABELS[r.source_type] ?? r.source_type}
                    </Badge>
                    <span className="text-muted-foreground text-[10px]">
                      {fmtDt(r.created_at)}
                    </span>
                  </div>
                  <span className="font-bold text-emerald-600">
                    +{my.toLocaleString()} {my > 1 ? "Crédits" : "Crédit"}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[10px] text-muted-foreground">
                  <div>Total payé : <span className="text-foreground font-semibold">{total.toLocaleString()}</span></div>
                  <div>Reçu (toi) : <span className="text-emerald-600 font-semibold">{my.toLocaleString()} ({pct(my)}%)</span></div>
                  <div>Plateforme : <span className="text-blue-600 font-semibold">{platform.toLocaleString()} ({pct(platform)}%)</span></div>
                  {others > 0 ? (
                    <div>Autres parts : <span className="text-amber-600 font-semibold">{others.toLocaleString()} ({pct(others)}%)</span></div>
                  ) : (
                    <div className="text-muted-foreground/60">—</div>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">≈ {formatPrice(my)} reçu sur {formatPrice(total)} total</div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="h-7 px-2">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-[10px] text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button size="sm" variant="ghost" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-7 px-2">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
