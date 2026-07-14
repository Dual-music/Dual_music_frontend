/**
 * CRUD des méthodes de paiement utilisateur (`user_payout_methods`) : mobile_money / bank_transfer / paypal. Lit `usePayoutConfig` (opérateurs + méthodes activées), gère défaut unique, libellés et validation par méthode.
 */
import { useEffect, useState } from "react";
import * as withdrawals from "@/api/endpoints/withdrawals";
import { ApiError } from "@/api/http";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Plus, Star, Trash2, Smartphone, Banknote } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePayoutConfig, type PayoutMethodCode } from "@/hooks/usePayoutConfig";

interface PayoutMethod {
  id: string;
  method: PayoutMethodCode;
  label: string | null;
  phone_number: string | null;
  mobile_operator: string | null;
  iban: string | null;
  bank_name: string | null;
  account_holder: string | null;
  paypal_email: string | null;
  is_default: boolean;
  created_at: string;
}

const methodIcon = (m: PayoutMethodCode) =>
  m === "mobile_money" ? <Smartphone className="w-4 h-4" /> :
  m === "paypal" ? <CreditCard className="w-4 h-4" /> :
  <Banknote className="w-4 h-4" />;

export const PayoutMethodsManager = ({ onChange }: { onChange?: () => void }) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { data: payoutCfg } = usePayoutConfig();
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<PayoutMethod>>({ method: "mobile_money", is_default: false });

  const allowedMethods = payoutCfg?.methods ?? [];
  const operators = payoutCfg?.mobile_operators ?? [];

  const methodLabel = (m: PayoutMethodCode) =>
    m === "mobile_money" ? t("payoutMobileMoney") :
    m === "paypal" ? t("payoutPaypal") :
    t("payoutBankTransfer");

  const operatorLabel = (code: string | null) =>
    operators.find((o) => o.code === code)?.label ?? code ?? "";

  const summarize = (m: PayoutMethod) => {
    if (m.method === "mobile_money") return `${operatorLabel(m.mobile_operator)} • ${m.phone_number ?? ""}`.trim();
    if (m.method === "bank") return `${m.bank_name ?? ""} • ${m.iban ?? ""}`.trim();
    return m.paypal_email ?? "";
  };

  // Ensure form.method stays within allowed methods when admin config loads
  useEffect(() => {
    if (allowedMethods.length > 0 && form.method && !allowedMethods.includes(form.method as PayoutMethodCode)) {
      setForm((f) => ({ ...f, method: allowedMethods[0] }));
    }
  }, [allowedMethods.join("|")]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await withdrawals.listMethods();
      const list = ((data as any[]) ?? []).slice().sort((a, b) => {
        if (!!a.is_default !== !!b.is_default) return a.is_default ? -1 : 1;
        return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      });
      setMethods(list as any);
    } catch {
      setMethods([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!user) { return; }
    setSaving(true);

    const payload: any = {
      method: form.method,
      label: form.label ?? methodLabel(form.method as PayoutMethodCode),
      phone_number: form.method === "mobile_money" ? form.phone_number : null,
      mobile_operator: form.method === "mobile_money" ? form.mobile_operator : null,
      iban: form.method === "bank" ? form.iban : null,
      bank_name: form.method === "bank" ? form.bank_name : null,
      account_holder: form.method === "bank" ? form.account_holder : null,
      paypal_email: form.method === "paypal" ? form.paypal_email : null,
      is_default: !!form.is_default,
    };

    try {
      // Backend `addMethod` clears the previous default when is_default=true.
      await withdrawals.addMethod(payload);
      toast({ title: t("payoutSaved") });
      setOpen(false);
      setForm({ method: allowedMethods[0] ?? "mobile_money", is_default: false });
      load();
      onChange?.();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : t("payoutError");
      toast({ title: t("payoutError"), description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await withdrawals.removeMethod(id);
      toast({ title: t("payoutDeleted") }); load(); onChange?.();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : t("payoutError");
      toast({ title: t("payoutError"), description: message, variant: "destructive" });
    }
  };

  const handleSetDefault = async (id: string) => {
    if (!user) return;
    // Backend `updateMethod({is_default:true})` clears the default on other methods.
    await withdrawals.updateMethod(id, { is_default: true });
    load();
    onChange?.();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CreditCard className="w-5 h-5 text-primary" />
              {t("payoutTitle")}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {t("payoutDesc")}
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={allowedMethods.length === 0}>
                <Plus className="w-4 h-4 mr-1" />{t("payoutAdd")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t("payoutNewTitle")}</DialogTitle>
                <DialogDescription>{t("payoutNewDesc")}</DialogDescription>
              </DialogHeader>
              {allowedMethods.length === 0 ? (
                <p className="text-sm text-destructive">{t("payoutNoMethodsAvailable")}</p>
              ) : (
              <div className="space-y-3">
                <div>
                  <Label>{t("payoutMethodLabel")}</Label>
                  <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as PayoutMethodCode })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allowedMethods.map((m) => (
                        <SelectItem key={m} value={m}>{methodLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("payoutLabelOptional")}</Label>
                  <Input value={form.label ?? ""} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={t("payoutLabelPh")} />
                </div>
                {form.method === "mobile_money" && (
                  <>
                    <div>
                      <Label>{t("payoutOperator")}</Label>
                      <Select value={form.mobile_operator ?? ""} onValueChange={(v) => setForm({ ...form, mobile_operator: v })}>
                        <SelectTrigger><SelectValue placeholder={t("payoutChoose")} /></SelectTrigger>
                        <SelectContent>
                          {operators.map((op) => (
                            <SelectItem key={op.code} value={op.code}>{op.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("payoutPhone")}</Label>
                      <Input value={form.phone_number ?? ""} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} placeholder={t("payoutPhonePh")} />
                    </div>
                  </>
                )}
                {form.method === "bank" && (
                  <>
                    <div>
                      <Label>{t("payoutBank")}</Label>
                      <Input value={form.bank_name ?? ""} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
                    </div>
                    <div>
                      <Label>{t("payoutIban")}</Label>
                      <Input value={form.iban ?? ""} onChange={(e) => setForm({ ...form, iban: e.target.value })} />
                    </div>
                    <div>
                      <Label>{t("payoutHolder")}</Label>
                      <Input value={form.account_holder ?? ""} onChange={(e) => setForm({ ...form, account_holder: e.target.value })} />
                    </div>
                  </>
                )}
                {form.method === "paypal" && (
                  <div>
                    <Label>{t("payoutPaypalEmail")}</Label>
                    <Input type="email" value={form.paypal_email ?? ""} onChange={(e) => setForm({ ...form, paypal_email: e.target.value })} />
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
                  {t("payoutSetDefault")}
                </label>
              </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>{t("payoutCancel")}</Button>
                <Button onClick={handleSave} disabled={saving || allowedMethods.length === 0}>
                  {saving ? t("payoutSaving") : t("payoutSave")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("payoutLoading")}</p>
        ) : methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("payoutEmpty")}</p>
        ) : (
          methods.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                {methodIcon(m.method)}
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{m.label || methodLabel(m.method)}</p>
                  <p className="text-xs text-muted-foreground truncate">{summarize(m)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {m.is_default ? (
                  <Badge className="bg-primary/15 text-primary border-primary/30"><Star className="w-3 h-3 mr-1" />{t("payoutDefault")}</Badge>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => handleSetDefault(m.id)}><Star className="w-4 h-4" /></Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => handleDelete(m.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default PayoutMethodsManager;
