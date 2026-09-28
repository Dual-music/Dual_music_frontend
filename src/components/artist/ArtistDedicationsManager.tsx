/**
 * Gestionnaire dédicaces artiste : demandes de `concert_dedications` reçues.
 *
 * Flux en 2 temps : une demande arrive `pending` (le fan n'a PAS encore été débité) —
 * l'artiste ACCEPTE (débite le fan maintenant, `POST .../accept`) ou REJETTE (aucun débit,
 * `POST .../reject`). Une fois acceptée (`paid`), elle peut être marquée `delivered`
 * (interprétée). Les 3 statuts sont affichés en 2 groupes : "en attente" (actions accepter/
 * rejeter) puis "acceptées / livrées" (historique, sous le premier groupe, même panneau).
 */
import { useEffect, useState } from "react";
import { deliverDedication, acceptDedication, rejectDedication, myReceivedDedications, dedicationEventTitles } from "@/api/endpoints/concerts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Heart, Loader2, Check, X } from "lucide-react";
import { formatTz } from "@/lib/datetime";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { useLanguage } from "@/contexts/LanguageContext";

interface Dedication {
  id: string;
  message: string;
  price_credits: number;
  status: string;
  paid_at: string | null;
  delivered_at: string | null;
  fan_id: string;
  concert_id: string;
  concert_type?: string;
  fan?: { full_name?: string } | null;
  fan_name?: string;
  concert_title?: string;
}

interface Props { artistId: string }

export const ArtistDedicationsManager = ({ artistId }: Props) => {
  const { prefs } = useUiPreferences();
  const { language, t } = useLanguage();
  const [items, setItems] = useState<Dedication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let list: Dedication[] = [];
    try {
      list = ((await myReceivedDedications()) as unknown as Dedication[]) || [];
    } catch {
      list = [];
    }
    if (list.length) {
      const titles = await dedicationEventTitles(list);
      list.forEach((d) => {
        d.fan_name = d.fan?.full_name || "Fan";
        d.concert_title = titles.get(d.concert_id) || (d.concert_type === "artist_live" ? "Live" : "—");
      });
    }
    setItems(list);
    setLoading(false);
  };
  useEffect(() => { if (artistId) load(); }, [artistId]);

  const pending = items.filter((d) => d.status === "pending");
  const history = items.filter((d) => d.status === "paid" || d.status === "delivered");

  const accept = async (id: string) => {
    setBusyId(id);
    try {
      await acceptDedication(id);
      toast.success("Dédicace acceptée — le fan a été débité.");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("artDedicError"));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    setBusyId(id);
    try {
      await rejectDedication(id);
      toast.success("Dédicace rejetée — aucun débit.");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("artDedicError"));
    } finally {
      setBusyId(null);
    }
  };

  const deliver = async (id: string) => {
    setBusyId(id);
    try {
      await deliverDedication(id);
      toast.success(t("artDedicMarkedDelivered"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("artDedicError"));
    } finally {
      setBusyId(null);
    }
  };

  const Row = ({ d, children }: { d: Dedication; children: React.ReactNode }) => (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <strong>{d.fan_name}</strong>
          <span className="text-muted-foreground">• {d.concert_title}</span>
          {d.status === "delivered" && <Badge className="bg-green-500">{t("artDedicDelivered")}</Badge>}
          {d.status === "paid" && <Badge variant="outline" className="border-yellow-500 text-yellow-500">{t("artDedicToDeliver")}</Badge>}
          {d.status === "pending" && <Badge variant="outline" className="border-blue-500 text-blue-500">En attente</Badge>}
        </div>
        <Badge variant="outline">{Number(d.price_credits)} {t("artDedicCredits")}</Badge>
      </div>
      <p className="text-sm italic">"{d.message}"</p>
      {(d.paid_at || d.delivered_at) && (
        <p className="text-xs text-muted-foreground">
          {d.paid_at && `${t("artDedicReceivedOn")} ${formatTz(d.paid_at, "dd MMM yyyy HH:mm", { timezone: prefs.timezone, language })}`}
          {d.delivered_at && ` • ${t("artDedicDeliveredOn")} ${formatTz(d.delivered_at, "dd MMM HH:mm", { timezone: prefs.timezone, language })}`}
        </p>
      )}
      {children}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Heart className="w-5 h-5 text-pink-500" /> {t("artDedicTitle")}</CardTitle>
        <CardDescription>{t("artDedicDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("artDedicLoading")}</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-8">{t("artDedicEmpty")}</p>
        ) : (
          <div className="space-y-4">
            {pending.length > 0 && (
              <div>
                <p className="text-xs font-bold text-blue-500 mb-1 px-1">En attente ({pending.length})</p>
                <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
                  {pending.map((d) => (
                    <Row key={d.id} d={d}>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={() => accept(d.id)} disabled={busyId === d.id}>
                          {busyId === d.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                          Accepter
                        </Button>
                        <Button size="sm" variant="destructive" className="flex-1" onClick={() => reject(d.id)} disabled={busyId === d.id}>
                          <X className="w-4 h-4 mr-2" /> Rejeter
                        </Button>
                      </div>
                    </Row>
                  ))}
                </div>
              </div>
            )}
            {history.length > 0 && (
              <div>
                <p className="text-xs font-bold text-green-500 mb-1 px-1">Acceptées / livrées ({history.length})</p>
                <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
                  {history.map((d) => (
                    <Row key={d.id} d={d}>
                      {d.status !== "delivered" && (
                        <Button size="sm" onClick={() => deliver(d.id)} disabled={busyId === d.id}>
                          {busyId === d.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                          {t("artDedicMarkDelivered")}
                        </Button>
                      )}
                    </Row>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ArtistDedicationsManager;
