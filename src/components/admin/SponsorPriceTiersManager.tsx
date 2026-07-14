/**
 * Admin: SponsorPriceTiersManager — paliers tarifaires sponsors.
 *
 * CRUD des tiers de prix proposés aux sponsors (durée, emplacement,
 * portée). Utilisé par `SponsorRequestSection` côté sponsor pour générer
 * le devis et déclencher le paiement Stripe.
 *
 * @access  role=admin
 */
import { useEffect, useState } from "react";
import * as sponsors from "@/api/endpoints/sponsors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Layers, Plus, Trash2, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Tier {
  id: string;
  label: string;
  min_seconds: number;
  max_seconds: number;
  price_credits: number;
  is_active: boolean;
}

export const SponsorPriceTiersManager = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [draft, setDraft] = useState({ label: "", min_seconds: "", max_seconds: "", price_credits: "" });

  const load = async () => {
    setLoading(true);
    const data = (await sponsors.listTiers()) as unknown as Tier[];
    setTiers([...(data || [])].sort((a, b) => a.min_seconds - b.min_seconds));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    const min = parseInt(draft.min_seconds);
    const max = parseInt(draft.max_seconds);
    const price = parseFloat(draft.price_credits);
    if (!draft.label.trim() || isNaN(min) || isNaN(max) || isNaN(price) || max < min || price < 0) {
      toast({ title: t("commonInvalidFields"), description: t("sptInvalidDesc"), variant: "destructive" });
      return;
    }
    setWorking(true);
    try {
      await sponsors.createTier({ label: draft.label.trim(), min_seconds: min, max_seconds: max, price_credits: price });
      setDraft({ label: "", min_seconds: "", max_seconds: "", price_credits: "" });
      load();
    } catch (e: any) {
      toast({ title: t("commonError"), description: e?.message, variant: "destructive" });
    } finally {
      setWorking(false);
    }
  };

  const update = async (id: string, patch: Partial<Tier>) => {
    try {
      await sponsors.updateTier(id, patch);
    } catch (e: any) {
      toast({ title: t("commonError"), description: e?.message, variant: "destructive" });
    }
    load();
  };

  const remove = async (id: string) => {
    if (!confirm(t("sptConfirmDelete"))) return;
    try {
      await sponsors.removeTier(id);
    } catch (e: any) {
      toast({ title: t("commonError"), description: e?.message, variant: "destructive" });
    }
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Layers className="w-5 h-5" /> {t("sptTitle")}</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          {t("sptDesc")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <Loader2 className="w-5 h-5 animate-spin mx-auto" />}
        {!loading && tiers.length === 0 && <p className="text-sm text-muted-foreground text-center py-2">{t("sptEmpty")}</p>}
        {tiers.map((tr) => (
          <div key={tr.id} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-2">
            <div className="col-span-12 sm:col-span-3">
              <Label className="text-xs">{t("sptLabel")}</Label>
              <Input defaultValue={tr.label} onBlur={(e) => e.target.value !== tr.label && update(tr.id, { label: e.target.value })} />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Label className="text-xs">{t("sptMin")}</Label>
              <Input type="number" defaultValue={tr.min_seconds} onBlur={(e) => parseInt(e.target.value) !== tr.min_seconds && update(tr.id, { min_seconds: parseInt(e.target.value) })} />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Label className="text-xs">{t("sptMax")}</Label>
              <Input type="number" defaultValue={tr.max_seconds} onBlur={(e) => parseInt(e.target.value) !== tr.max_seconds && update(tr.id, { max_seconds: parseInt(e.target.value) })} />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Label className="text-xs">{t("sptPrice")}</Label>
              <Input type="number" step="0.01" defaultValue={tr.price_credits} onBlur={(e) => parseFloat(e.target.value) !== Number(tr.price_credits) && update(tr.id, { price_credits: parseFloat(e.target.value) })} />
            </div>
            <div className="col-span-8 sm:col-span-2 flex items-center gap-2">
              <Switch checked={tr.is_active} onCheckedChange={(v) => update(tr.id, { is_active: v })} />
              <Badge variant={tr.is_active ? "default" : "outline"}>{tr.is_active ? t("sptActive") : t("sptInactive")}</Badge>
            </div>
            <div className="col-span-4 sm:col-span-1 flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => remove(tr.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
            </div>
          </div>
        ))}

        <div className="grid grid-cols-12 gap-2 items-end border-t pt-3">
          <div className="col-span-12 sm:col-span-3">
            <Label className="text-xs">{t("sptNewLabel")}</Label>
            <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={t("sptNewLabelPh")} />
          </div>
          <div className="col-span-4 sm:col-span-2">
            <Label className="text-xs">{t("sptMin")}</Label>
            <Input type="number" value={draft.min_seconds} onChange={(e) => setDraft({ ...draft, min_seconds: e.target.value })} />
          </div>
          <div className="col-span-4 sm:col-span-2">
            <Label className="text-xs">{t("sptMax")}</Label>
            <Input type="number" value={draft.max_seconds} onChange={(e) => setDraft({ ...draft, max_seconds: e.target.value })} />
          </div>
          <div className="col-span-4 sm:col-span-2">
            <Label className="text-xs">{t("sptPrice")}</Label>
            <Input type="number" step="0.01" value={draft.price_credits} onChange={(e) => setDraft({ ...draft, price_credits: e.target.value })} />
          </div>
          <div className="col-span-12 sm:col-span-3">
            <Button onClick={add} disabled={working} className="w-full">
              {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />{t("commonAdd")}</>}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SponsorPriceTiersManager;
