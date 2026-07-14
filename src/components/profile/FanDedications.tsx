/**
 * Dédicaces commandées par le fan (`concert_dedications`) : statut (pending/accepted/rejected/fulfilled), artiste, concert lié.
 */
import { useEffect, useState } from "react";
import { getDisplayProfiles } from "@/api/endpoints/users";
import * as concertsApi from "@/api/endpoints/concerts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, Loader2, Download } from "lucide-react";
import { formatTz } from "@/lib/datetime";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { useLanguage } from "@/contexts/LanguageContext";
import jsPDF from "jspdf";

interface Dedication {
  id: string;
  message: string;
  price_credits: number;
  status: string;
  paid_at: string;
  delivered_at: string | null;
  artist_id: string;
  concert_id: string;
  artist_name?: string;
  concert_title?: string;
}

interface Props { userId: string }

export const FanDedications = ({ userId }: Props) => {
  const { prefs } = useUiPreferences();
  const { language } = useLanguage();
  const [items, setItems] = useState<Dedication[]>([]);
  const [loading, setLoading] = useState(true);
  const [fanName, setFanName] = useState<string>("");

  const load = async () => {
    setLoading(true);
    let list: any[] = [];
    try {
      list = ((await concertsApi.myDedications()) as any[]) || [];
    } catch {
      list = [];
    }
    if (list.length) {
      const artistIds = Array.from(new Set(list.map((d) => d.artist_id)));
      const [profiles, titles] = await Promise.all([
        getDisplayProfiles([...artistIds, userId]),
        concertsApi.dedicationEventTitles(list),
      ]);
      const pmap = new Map((profiles as any[] || []).map((p) => [p.id, p.full_name]));
      list.forEach((d) => {
        d.artist_name = pmap.get(d.artist_id) || "Artiste";
        d.concert_title = titles.get(d.concert_id) || (d.concert_type === "artist_live" ? "Live" : "—");
      });
      setFanName(pmap.get(userId) || "Fan");
    }
    setItems(list);
    setLoading(false);
  };
  useEffect(() => { if (userId) load(); }, [userId]);

  const downloadPdf = (d: Dedication) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    // Header band
    doc.setFillColor(124, 58, 237);
    doc.rect(0, 0, W, 90, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Synergy Network", 40, 45);
    doc.setFontSize(13);
    doc.setFont("helvetica", "normal");
    doc.text("Reçu de dédicace", 40, 68);

    doc.setTextColor(20, 20, 20);
    let y = 130;
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(`Dédicace pour ${d.artist_name}`, 40, y); y += 28;

    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    const rows: [string, string][] = [
      ["N° de reçu", d.id.slice(0, 8).toUpperCase()],
      ["Fan", fanName],
      ["Artiste", d.artist_name || "—"],
      ["Concert", d.concert_title || "—"],
      ["Montant payé", `${Number(d.price_credits)} crédits`],
      ["Statut", d.status === "delivered" ? "Livrée" : "En attente de livraison"],
      ["Payée le", formatTz(d.paid_at, "dd MMM yyyy HH:mm", { timezone: prefs.timezone, language })],
    ];
    if (d.delivered_at) {
      rows.push(["Livrée le", formatTz(d.delivered_at, "dd MMM yyyy HH:mm", { timezone: prefs.timezone, language })]);
    }
    rows.forEach(([k, v]) => {
      doc.setFont("helvetica", "bold"); doc.text(`${k}:`, 40, y);
      doc.setFont("helvetica", "normal"); doc.text(String(v), 180, y);
      y += 20;
    });

    y += 10;
    doc.setDrawColor(200); doc.line(40, y, W - 40, y); y += 24;
    doc.setFont("helvetica", "bold"); doc.text("Message", 40, y); y += 18;
    doc.setFont("helvetica", "italic");
    const lines = doc.splitTextToSize(`"${d.message}"`, W - 80);
    doc.text(lines, 40, y);
    y += lines.length * 16 + 30;

    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120);
    doc.text("Merci de soutenir vos artistes sur Synergy Network.", 40, y);

    doc.save(`dedicace-${d.id.slice(0, 8)}.pdf`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Heart className="w-5 h-5 text-pink-500" /> Mes dédicaces</CardTitle>
        <CardDescription>Retrouve ici toutes les dédicaces envoyées et télécharge ton reçu PDF.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement...</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-8">Aucune dédicace envoyée pour le moment.</p>
        ) : (
          <div className="border rounded-lg divide-y max-h-[600px] overflow-y-auto">
            {items.map((d) => (
              <div key={d.id} className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <strong>{d.artist_name}</strong>
                    <span className="text-muted-foreground">• {d.concert_title}</span>
                    {d.status === "delivered" ? (
                      <Badge className="bg-green-500">Livrée</Badge>
                    ) : (
                      <Badge variant="outline" className="border-yellow-500 text-yellow-500">En attente</Badge>
                    )}
                  </div>
                  <Badge variant="outline">{Number(d.price_credits)} crédits</Badge>
                </div>
                <p className="text-sm italic">"{d.message}"</p>
                <p className="text-xs text-muted-foreground">
                  Envoyée le {formatTz(d.paid_at, "dd MMM yyyy HH:mm", { timezone: prefs.timezone, language })}
                  {d.delivered_at && ` • Livrée le ${formatTz(d.delivered_at, "dd MMM HH:mm", { timezone: prefs.timezone, language })}`}
                </p>
                <Button size="sm" variant="outline" onClick={() => downloadPdf(d)}>
                  <Download className="w-4 h-4 mr-2" /> Télécharger le reçu
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FanDedications;
