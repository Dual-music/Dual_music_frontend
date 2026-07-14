/**
 * Gestionnaire dédicaces artiste : liste des `fan_dedications` reçues, acceptation/refus, vidéo
 * réponse. Insert sur `dedication_responses`, notifie via `notify-user-event`.
 */
import { useEffect, useState } from "react";
import { deliverDedication, myReceivedDedications, dedicationEventTitles } from "@/api/endpoints/concerts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Heart, Loader2, Check } from "lucide-react";
import { formatTz } from "@/lib/datetime";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { useLanguage } from "@/contexts/LanguageContext";

interface Dedication {
  id: string;
  message: string;
  price_credits: number;
  status: string;
  paid_at: string;
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
  const [delivering, setDelivering] = useState<string | null>(null);

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

  const deliver = async (id: string) => {
    setDelivering(id);
    try {
      await deliverDedication(id);
      toast.success(t("artDedicMarkedDelivered"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("artDedicError"));
    } finally {
      setDelivering(null);
    }
  };

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
          <div className="border rounded-lg divide-y max-h-[600px] overflow-y-auto">
            {items.map((d) => (
              <div key={d.id} className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <strong>{d.fan_name}</strong>
                    <span className="text-muted-foreground">• {d.concert_title}</span>
                    {d.status === "delivered" ? (
                      <Badge className="bg-green-500">{t("artDedicDelivered")}</Badge>
                    ) : (
                      <Badge variant="outline" className="border-yellow-500 text-yellow-500">{t("artDedicToDeliver")}</Badge>
                    )}
                  </div>
                  <Badge variant="outline">{Number(d.price_credits)} {t("artDedicCredits")}</Badge>
                </div>
                <p className="text-sm italic">"{d.message}"</p>
                <p className="text-xs text-muted-foreground">
                  {t("artDedicReceivedOn")} {formatTz(d.paid_at, "dd MMM yyyy HH:mm", { timezone: prefs.timezone, language })}
                  {d.delivered_at && ` • ${t("artDedicDeliveredOn")} ${formatTz(d.delivered_at, "dd MMM HH:mm", { timezone: prefs.timezone, language })}`}
                </p>
                {d.status !== "delivered" && (
                  <Button size="sm" onClick={() => deliver(d.id)} disabled={delivering === d.id}>
                    {delivering === d.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                    {t("artDedicMarkDelivered")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ArtistDedicationsManager;
