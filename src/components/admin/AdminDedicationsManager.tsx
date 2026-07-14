/**
 * Admin: AdminDedicationsManager — supervision des dédicaces.
 *
 * Vue globale des dédicaces fan→artiste : statut (en attente, livrée,
 * remboursée), filtres, modération de contenu, remboursements manuels
 * via RPC atomique en cas de litige.
 *
 * @access  role=admin
 */
import { useEffect, useState } from "react";
import * as admin from "@/api/endpoints/admin";
import * as concertsApi from "@/api/endpoints/concerts";
import { getDisplayProfiles } from "@/api/endpoints/users";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Heart } from "lucide-react";
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
  artist_id: string;
  concert_id: string;
  fan_name?: string;
  artist_name?: string;
  concert_title?: string;
}

const AdminDedicationsManager = () => {
  const { prefs } = useUiPreferences();
  const { language, t } = useLanguage();
  const [items, setItems] = useState<Dedication[]>([]);
  const [loading, setLoading] = useState(true);

  const statusBadge = (s: string) => {
    if (s === "delivered") return <Badge className="bg-green-500">{t("ddStatusDelivered")}</Badge>;
    if (s === "paid") return <Badge variant="outline" className="border-yellow-500 text-yellow-500">{t("ddStatusPending")}</Badge>;
    if (s === "rejected") return <Badge variant="destructive">{t("ddStatusRejected")}</Badge>;
    return <Badge variant="secondary">{s}</Badge>;
  };

  const load = async () => {
    setLoading(true);
    let list: any[] = [];
    try {
      list = (await admin.listDedications({ limit: 200 })) as any[];
    } catch {
      list = [];
    }
    if (list.length) {
      const userIds = Array.from(new Set(list.flatMap((d) => [d.fan_id, d.artist_id])));
      const [profiles, titles] = await Promise.all([
        getDisplayProfiles(userIds),
        concertsApi.dedicationEventTitles(list),
      ]);
      const pmap = new Map((profiles as any[] || []).map((p) => [p.id, p.full_name]));
      list.forEach((d) => {
        d.fan_name = pmap.get(d.fan_id) || t("ddFanFallback");
        d.artist_name = pmap.get(d.artist_id) || t("ddArtistFallback");
        d.concert_title = titles.get(d.concert_id) || (d.concert_type === "artist_live" ? t("ddLiveFallback") : "—");
      });
    }
    setItems(list);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Heart className="w-5 h-5 text-pink-500" /> {t("ddTitle")}</CardTitle>
        <CardDescription>{t("ddDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("ddLoading")}</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-10">{t("ddEmpty")}</p>
        ) : (
          <div className="border rounded-lg divide-y max-h-[600px] overflow-y-auto">
            {items.map((d) => (
              <div key={d.id} className="p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong>{d.fan_name}</strong>
                    <span className="text-muted-foreground">→</span>
                    <strong>{d.artist_name}</strong>
                    {statusBadge(d.status)}
                  </div>
                  <Badge variant="outline">{Number(d.price_credits)} {t("creditsUnit")}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("ddConcertLabel")} : {d.concert_title} • {formatTz(d.paid_at, "dd MMM yyyy HH:mm", { timezone: prefs.timezone, language })}
                  {d.delivered_at && ` • ${t("ddDeliveredOn")} ${formatTz(d.delivered_at, "dd MMM HH:mm", { timezone: prefs.timezone, language })}`}
                </p>
                <p className="text-sm italic line-clamp-3">"{d.message}"</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminDedicationsManager;
