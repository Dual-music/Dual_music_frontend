/**
 * Wallet: MonerooRechargeForm — formulaire de recharge via Moneroo.
 *
 * Sélection pays/devise/méthode (catalogue `_shared/moneroo-catalog.ts`),
 * aperçu crédits via `useRechargePreview`, appel à `moneroo-payin-init`
 * pour récupérer l'URL hosted. Confirmation via webhook HMAC-SHA256
 * `moneroo-webhook-payin`.
 *
 * @see     supabase/functions/moneroo-payin-init
 */
import { useMemo, useState, useEffect } from "react";
import * as payments from "@/api/endpoints/payments";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Smartphone, Loader2 } from "lucide-react";
import { MONEROO_SANDBOX, getPayinCountries, getCountry } from "@/lib/moneroo-config";
import { useRechargePreview } from "@/hooks/useRechargePreview";
import { RechargeBreakdown } from "@/components/wallet/RechargeBreakdown";
import { useLanguage } from "@/contexts/LanguageContext";

export const MonerooRechargeForm = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user, profile: authProfile } = useAuth();
  const countries = useMemo(() => getPayinCountries(), []);
  const [countryCode, setCountryCode] = useState(countries[0]?.code ?? "US");
  const country = getCountry(countryCode);

  const [method, setMethod] = useState(country?.payin[0]?.code ?? "");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [profile, setProfile] = useState<{ first_name: string; last_name: string; email: string }>({
    first_name: "", last_name: "", email: "",
  });
  const [pending, setPending] = useState(false);

  const currency = country?.currency ?? "USD";
  const preview = useRechargePreview(parseFloat(amount) || 0, currency, "moneroo");

  useEffect(() => {
    if (!user) return;
    const fullName = String(
      (authProfile?.full_name as string | undefined) ??
        (authProfile?.display_name as string | undefined) ??
        "",
    ).trim();
    const parts = fullName.split(/\s+/);
    setProfile({
      first_name: parts[0] || "Client",
      last_name: parts.slice(1).join(" ") || "App",
      email: (authProfile?.email as string | undefined) || user.email || "",
    });
  }, [user, authProfile]);

  useEffect(() => {
    if (country && !country.payin.find(m => m.code === method)) {
      setMethod(country.payin[0]?.code ?? "");
    }
  }, [countryCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCardOrCrypto = method.startsWith("card_") || method.startsWith("crypto_") || method === "moneroo_payment_demo";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseInt(amount, 10);
    if (!amt || amt < 1) { toast({ title: t("rechargeInvalidAmount"), variant: "destructive" }); return; }
    if (!isCardOrCrypto && !phone) { toast({ title: t("rechargePhoneRequired"), variant: "destructive" }); return; }

    setPending(true);
    try {
      const data = await payments.monerooInit(
        {
          amount: amt,
          currency,
          phone: phone || undefined,
          email: profile.email || undefined,
        },
        crypto.randomUUID(),
      );
      if (data?.checkoutUrl) { window.location.href = data.checkoutUrl; return; }
      toast({ title: t("rechargeInitiated"), description: t("rechargeFollowMoneroo") });
    } catch (err: any) {
      toast({ title: t("rechargeMonerooError"), description: err.message, variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {MONEROO_SANDBOX && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 text-xs p-2">
          {t("rechargeSandboxNotice")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("rechargeCountry")}</Label>
          <Select value={countryCode} onValueChange={setCountryCode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {countries.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("rechargeCurrency")}</Label>
          <Input value={currency} disabled />
        </div>
      </div>

      <div>
        <Label>{t("rechargeMethod")}</Label>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {country?.payin.map(mm => <SelectItem key={mm.code} value={mm.code}>{mm.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!isCardOrCrypto && (
        <div>
          <Label>{t("rechargePhoneIntl")}</Label>
          <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={`${country?.dialPrefix ?? "+"} 00 00 00 00`} required />
        </div>
      )}

      {profile.email && (
        <p className="text-xs text-muted-foreground">
          {t("rechargeBilledTo")} <span className="font-medium text-foreground">{profile.first_name} {profile.last_name}</span> · {profile.email}
        </p>
      )}

      <div>
        <Label>{t("rechargeAmountLabel")} ({currency})</Label>
        <Input type="number" min={1} step={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder="1000" required />
      </div>

      <RechargeBreakdown preview={preview} providerLabel={t("breakdownProviderMoneroo")} />

      <Button type="submit" disabled={pending} className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:opacity-90">
        {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Smartphone className="w-4 h-4 mr-2" />}
        {pending ? t("rechargeInProgress") : t("rechargeViaMoneroo")}
      </Button>

      <p className="text-xs text-muted-foreground text-center">{t("rechargeSecuredMoneroo")}</p>
    </form>
  );
};

export default MonerooRechargeForm;
