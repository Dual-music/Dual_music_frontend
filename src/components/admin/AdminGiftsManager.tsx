/**
 * Admin: AdminGiftsManager — catalogue des cadeaux virtuels.
 *
 * CRUD de la table `virtual_gifts` : nom, icône, prix en crédits, tier
 * d'animation (déclenche les portails z-index 220 côté stream). Les
 * achats restent atomiques via RPC pour éviter les races.
 *
 * @access  role=admin
 */
import { useEffect, useState } from "react";
import { listGifts, createGift, updateGift, deleteGift } from "@/api/endpoints/gifts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Gift, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface VirtualGift {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
}

const empty = { id: "", name: "", price: 1, image_url: "🎁" };

const AdminGiftsManager = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { confirm, dialog } = useConfirmDialog();
  const [gifts, setGifts] = useState<VirtualGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<VirtualGift>(empty as any);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listGifts();
      setGifts((data as any) || []);
    } catch (error: any) {
      toast({ title: t("commonError"), description: error?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ ...empty } as any); setOpen(true); };
  const openEdit = (g: VirtualGift) => { setForm({ ...g }); setOpen(true); };

  const save = async () => {
    if (!form.name.trim() || !form.price || form.price <= 0) {
      toast({ title: t("commonInvalidFields"), description: t("gmInvalidFieldsDesc"), variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = { name: form.name.trim(), price: Number(form.price), image_url: form.image_url || "🎁" };
    try {
      if (form.id) await updateGift(form.id, payload);
      else await createGift(payload);
      toast({ title: form.id ? t("gmUpdated") : t("gmCreated") });
      setOpen(false);
      load();
    } catch (error: any) {
      toast({ title: t("commonError"), description: error?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = (g: VirtualGift) => {
    confirm({
      title: t("gmConfirmDelTitle"),
      description: `${t("gmConfirmDelDesc")} ("${g.name}")`,
      variant: "destructive",
      confirmLabel: t("commonDelete"),
      onConfirm: async () => {
        try {
          await deleteGift(g.id);
          toast({ title: t("gmDeleted") });
          load();
        } catch (error: any) {
          toast({ title: t("commonError"), description: error?.message, variant: "destructive" });
        }
      },
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><Gift className="w-5 h-5 text-pink-500" /> {t("gmTitle")}</CardTitle>
          <CardDescription>{t("gmDesc")}</CardDescription>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> {t("gmNew")}</Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("gmLoading")}</div>
        ) : gifts.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-10">{t("gmEmpty")}</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {gifts.map((g) => (
              <div key={g.id} className="border rounded-lg p-3 flex items-center gap-3 bg-card">
                <div className="text-4xl shrink-0">{g.image_url || "🎁"}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{g.name}</p>
                  <p className="text-xs text-muted-foreground">{Number(g.price)} {t("creditsUnit")}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(g)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(g)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? t("gmEdit") : t("gmNew")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("gmName")}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("gmNamePh")} />
            </div>
            <div>
              <Label>{t("gmImage")}</Label>
              <Input value={form.image_url || ""} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder={t("gmImagePh")} />
            </div>
            <div>
              <Label>{t("gmPrice")}</Label>
              <Input type="number" min={1} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("commonCancel")}</Button>
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("commonSave")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </Card>
  );
};

export default AdminGiftsManager;
