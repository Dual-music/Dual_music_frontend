/**
 * Wallet: CinetPayRechargeForm — formulaire de recharge Mobile Money via CinetPay.
 *
 * Détecte le pays par préfixe (`cinetpay_countries`), affiche les opérateurs
 * disponibles, calcule l'aperçu crédits via `useRechargePreview`, puis
 * appelle `cinetpay-payin-init` pour obtenir l'URL de paiement (Seamless).
 * La confirmation arrive via `cinetpay-webhook-payin` → RPC atomique.
 *
 * @see     supabase/functions/cinetpay-payin-init
 */
import { useEffect, useMemo, useState } from "react";
import * as payments from "@/api/endpoints/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Smartphone, Loader2 } from "lucide-react";
import { useRechargePreview } from "@/hooks/useRechargePreview";
import { RechargeBreakdown } from "@/components/wallet/RechargeBreakdown";
import { useLanguage } from "@/contexts/LanguageContext";

interface Country {
  country_code: string;
  country_name: string;
  currency: string;
  phone_prefix: string;
  operators: Array<{ code: string; label: string }>;
  is_active: boolean;
}

export const CinetPayRechargeForm = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryCode, setCountryCode] = useState<string>("CI");
  const [operator, setOperator] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [otpRequired, setOtpRequired] = useState(false);
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [lastMerchantId, setLastMerchantId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const data = await payments.cinetpayCountries();
      setCountries((data as any) || []);
    })();
  }, []);

  const country = useMemo(() => countries.find(c => c.country_code === countryCode), [countries, countryCode]);
  const preview = useRechargePreview(parseFloat(amount) || 0, country?.currency || "XOF", "cinetpay");

  useEffect(() => {
    if (country) {
      if (!country.operators.some(o => o.code === operator)) setOperator(country.operators[0]?.code || "");
      if (!phone.startsWith(country.phone_prefix)) setPhone(country.phone_prefix);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!country || !operator) return;
    const amt = parseInt(amount, 10);
    if (!amt || amt < 100) { toast({ title: t("rechargeInvalidAmount"), description: `${t("rechargeMinimum")} 100 ${country.currency}`, variant: "destructive" }); return; }
    if (!phone.startsWith(country.phone_prefix) || phone.length < country.phone_prefix.length + 8) {
      toast({ title: t("rechargeInvalidPhone"), description: `${t("rechargeMustStartWith")} ${country.phone_prefix}`, variant: "destructive" }); return;
    }

    setPending(true);
    setLastMessage(null);
    try {
      const data = await payments.cinetpayInit(
        { amount: amt, countryCode: country.country_code, phone },
        crypto.randomUUID(),
      );

      setLastMerchantId(data.merchantTransactionId);
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }
      setLastMessage(t("rechargeRequestSent"));
      toast({ title: t("rechargeInitiated"), description: t("rechargeConfirmOnPhone") });
    } catch (err: any) {
      toast({ title: t("error"), description: err.message || t("rechargeFailed"), variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  if (countries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("rechargeNoCountries")}</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("rechargeCountry")}</Label>
          <Select value={countryCode} onValueChange={setCountryCode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {countries.map(c => <SelectItem key={c.country_code} value={c.country_code}>{c.country_name} ({c.currency})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("rechargeOperator")}</Label>
          <Select value={operator} onValueChange={setOperator}>
            <SelectTrigger><SelectValue placeholder={t("rechargeChoose")} /></SelectTrigger>
            <SelectContent>
              {country?.operators.map(o => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>{t("rechargePhone")}</Label>
        <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={`${country?.phone_prefix} XX XX XX XX`} required />
      </div>

      <div>
        <Label>{t("rechargeAmountLabel")} ({country?.currency})</Label>
        <Input type="number" min={100} step={100} value={amount} onChange={e => setAmount(e.target.value)} placeholder="1000" required />
        <div className="grid grid-cols-4 gap-1 mt-2">
          {[500, 1000, 2000, 5000].map(p => (
            <Button key={p} type="button" variant="outline" size="sm" onClick={() => setAmount(String(p))}>{p}</Button>
          ))}
        </div>
      </div>

      <RechargeBreakdown preview={preview} providerLabel={t("breakdownProviderCinetpay")} />

      {otpRequired && (
        <div>
          <Label>{t("rechargeOtpLabel")}</Label>
          <Input value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} />
        </div>
      )}

      {lastMessage && (
        <div className="p-3 rounded-md bg-muted/50 text-sm">{lastMessage}{lastMerchantId && <span className="block text-xs text-muted-foreground mt-1">{t("rechargeRef")} : {lastMerchantId}</span>}</div>
      )}

      <Button type="submit" disabled={pending} className="w-full bg-gradient-to-r from-orange-500 to-yellow-500 text-white hover:opacity-90">
        {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Smartphone className="w-4 h-4 mr-2" />}
        {pending ? t("rechargeInProgress") : t("rechargeViaMobileMoney")}
      </Button>

      <p className="text-xs text-muted-foreground text-center">{t("rechargeSecuredCinetpay")}</p>
    </form>
  );
};

export default CinetPayRechargeForm;
