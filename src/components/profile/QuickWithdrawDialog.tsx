/**
 * Dialog retrait rapide : montant en crédits, méthode payout (`PayoutMethodsManager`), PIN
 * validation (`WithdrawalPinGate`), insert `withdrawal_requests`. Traitement par `process-
 * withdrawal` edge function.
 */
import { useEffect, useMemo, useState } from "react";
import * as withdrawals from "@/api/endpoints/withdrawals";
import * as settings from "@/api/endpoints/settings";
import { ApiError } from "@/api/http";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { Banknote, ArrowDownToLine, Lock } from "lucide-react";
import { useCurrencyFormatter } from "@/hooks/useCurrency";
import { useLanguage } from "@/contexts/LanguageContext";

interface PayoutMethod {
  id: string;
  method: string;
  label: string | null;
  is_default: boolean;
  phone_number: string | null;
  mobile_operator: string | null;
  iban: string | null;
  bank_name: string | null;
  paypal_email: string | null;
}

interface Props {
  balance: number;
  trigger?: React.ReactNode;
}

export const QuickWithdrawDialog = ({ balance, trigger }: Props) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { formatPrice } = useCurrencyFormatter();
  const [open, setOpen] = useState(false);
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [methodId, setMethodId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [feePreview, setFeePreview] = useState<{ fee_pct: number; fee: number; net: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [wdCfg, setWdCfg] = useState<Record<string, { enabled: boolean; min_amount_credits: number; mode: string }> | null>(null);

  const creditUnit = (n: number) => n > 1 ? t("creditsSuffix") : t("creditSuffix");

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const [pm, cfg, pinState] = await Promise.all([
        withdrawals.listMethods().catch(() => [] as Array<Record<string, unknown>>),
        settings.getPublicSetting("withdrawal_providers_config", null).catch(() => null),
        withdrawals.hasPin().catch(() => ({ hasPin: false })),
      ]);
      const list = (((pm as any[]) ?? []).slice().sort((a, b) =>
        (!!a.is_default === !!b.is_default ? 0 : a.is_default ? -1 : 1))) as PayoutMethod[];
      setMethods(list);
      const def = list.find((m) => m.is_default) ?? list[0];
      if (def) setMethodId(def.id);
      if (cfg) setWdCfg(cfg as any);
      setHasPin(!!(pinState as { hasPin?: boolean })?.hasPin);
    })();
  }, [open, user]);

  useEffect(() => {
    const n = parseFloat(amount);
    if (!isNaN(n) && n > 0) {
      withdrawals.calcNet({ amount: n })
        .then((d) => setFeePreview(d as any))
        .catch(() => setFeePreview(null));
    } else setFeePreview(null);
  }, [amount]);

  const selectedMethod = useMemo(() => methods.find((m) => m.id === methodId), [methods, methodId]);

  const handleSubmit = async () => {
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) {
      toast({ title: t("qwInvalidAmount"), variant: "destructive" });
      return;
    }
    if (n > balance) {
      toast({ title: t("qwInsufficient"), variant: "destructive" });
      return;
    }
    if (!methodId) {
      toast({ title: t("qwSelectMethod"), variant: "destructive" });
      return;
    }
    if (hasPin === false) {
      toast({ title: t("qwPinRequired"), description: t("qwPinConfigureFirst"), variant: "destructive" });
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      toast({ title: t("qwPinInvalid"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // POST /withdrawals requires the caller's 6-digit withdrawal PIN in the body —
      // the backend re-verifies it against the stored hash (with lockout on repeated
      // failure) before reserving funds.
      await withdrawals.createRequest({ amount: n, payoutMethodId: methodId, pin });
      toast({
        title: t("qwSentTitle"),
        description: t("qwSentDesc").replace("{amount}", n.toLocaleString()).replace("{unit}", creditUnit(n)),
      });
      setOpen(false);
      setAmount("");
      setPin("");
    } catch (e) {
      // Surface PIN-specific failures clearly (wrong / locked) and keep the dialog open.
      const code = e instanceof ApiError ? e.code : undefined;
      let message = e instanceof ApiError ? e.message : t("payoutError");
      if (code === "PIN_WRONG" || code === "PIN_NOT_SET") message = t("qwPinWrong");
      else if (code === "PIN_LOCKED") message = t("qwPinLocked");
      if (code === "PIN_WRONG" || code === "PIN_LOCKED" || code === "PIN_NOT_SET") setPin("");
      toast({ title: t("qwFailed"), description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="w-full sm:w-auto">
            <ArrowDownToLine className="w-4 h-4 mr-2" />
            {t("qwWithdraw")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-green-500" />
            {t("qwDirectTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("qwDirectDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-xs text-muted-foreground">{t("qwAvailable")}</p>
            <p className="text-2xl font-bold">{balance.toLocaleString()} {creditUnit(balance)}</p>
            {wdCfg && (
              <div className="text-xs p-2 rounded bg-muted/40 space-y-0.5 mt-2 text-left">
                <p className="font-semibold mb-1">{t("qwThresholds")}</p>
                {(["cinetpay", "moneroo", "stripe"] as const).map((p) => wdCfg[p]?.enabled && (
                  <div key={p} className="flex justify-between">
                    <span className="capitalize">{p}</span>
                    <span>{t("qwMinCreditsShort")} {wdCfg[p].min_amount_credits} {t("qwCreditsShort")} · {wdCfg[p].mode === "auto_payout" ? t("qwModeAuto") : wdCfg[p].mode === "auto_approve" ? t("qwModeAutoApprove") : t("qwModeManual")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {methods.length === 0 ? (
            <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">
              {t("qwNoMethod")}
            </div>
          ) : (
            <>
              {!methods.some((m) => m.is_default) && (
                <div className="p-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 text-xs text-yellow-700 dark:text-yellow-400">
                  {t("qwNoDefaultWarn")}
                </div>
              )}
              <div>
                <Label>{t("qwMethod")}</Label>
                <Select value={methodId} onValueChange={setMethodId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {methods.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label || m.method} {m.is_default ? "★" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedMethod && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedMethod.method === "mobile_money" && `${selectedMethod.mobile_operator} • ${selectedMethod.phone_number}`}
                    {selectedMethod.method === "bank" && `${selectedMethod.bank_name} • ${selectedMethod.iban}`}
                    {selectedMethod.method === "paypal" && selectedMethod.paypal_email}
                  </p>
                )}
              </div>

              <div>
                <Label>{t("qwAmountIn")} {creditUnit(parseFloat(amount || "0"))}</Label>
                <Input type="number" min={1} max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} />
                {amount && !isNaN(parseFloat(amount)) && (
                  <p className="text-xs text-muted-foreground mt-1">≈ {formatPrice(parseFloat(amount))}</p>
                )}
              </div>

              {feePreview && feePreview.fee_pct > 0 && (
                <div className="text-xs p-2 rounded bg-muted/50 space-y-0.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("qwFees")} ({feePreview.fee_pct}%)</span><span>-{feePreview.fee.toFixed(2)}</span></div>
                  <div className="flex justify-between font-semibold"><span>{t("qwNetReceivedIn")} {creditUnit(feePreview.net)}</span><span className="text-green-500">{feePreview.net.toFixed(2)}</span></div>
                </div>
              )}

              {/* Withdrawal PIN — required by the API (re-verified server-side). */}
              {hasPin === false ? (
                <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">
                  {t("qwPinConfigureFirst")}
                </div>
              ) : (
                <div>
                  <Label className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> {t("qwPinLabel")}</Label>
                  <div className="flex justify-center mt-1">
                    <InputOTP maxLength={6} value={pin} onChange={setPin}>
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("payoutCancel")}</Button>
          <Button onClick={handleSubmit} disabled={submitting || methods.length === 0 || hasPin === false || pin.length !== 6}>
            {submitting ? t("qwSubmitting") : t("qwConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuickWithdrawDialog;

