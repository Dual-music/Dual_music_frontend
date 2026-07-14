/**
 * Page: WalletRecharge (/wallet/recharge)
 *
 * Tunnel de recharge du portefeuille en crédits. Propose les trois fournisseurs
 * actifs sur la plateforme selon le pays détecté et la configuration admin :
 *   - Stripe (CB/Apple Pay/Google Pay) via `create-checkout` → `stripe-webhook`.
 *   - CinetPay (Mobile Money Afrique) via `cinetpay-payin-init` →
 *     `cinetpay-webhook-payin` → RPC `cinetpay_credit_wallet`.
 *   - Moneroo (Mobile Money multi-pays) via `moneroo-payin-init` →
 *     `moneroo-webhook-payin` → RPC `moneroo_confirm_payin`.
 *
 * Calcul des crédits en temps réel via `useRechargePreview` (`RechargeBreakdown`)
 * qui applique `platform_settings.economic_config` (credit_value_usd, fees,
 * provider overrides) et `exchange_rates`. Reçu post-paiement via
 * `RechargeReceipt` (lecture du retour fournisseur sur l'URL).
 *
 * Aucune clé privée n'est exposée côté client : tout passe par les Edge
 * Functions et les secrets Supabase Cloud.
 *
 * @route   /wallet/recharge
 * @access  authenticated
 * @see     src/components/wallet/CinetPayRechargeForm.tsx, MonerooRechargeForm.tsx
 * @see     supabase/functions/_shared/recharge-credits.ts
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getPublicSetting } from "@/api/endpoints/settings";
import * as payments from "@/api/endpoints/payments";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Wallet, CreditCard, DollarSign, Smartphone } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useWallet } from "@/hooks/useWallet";
import { ExchangeRateRefresh } from "@/components/profile/ExchangeRateRefresh";
import { CurrencySelector } from "@/components/profile/CurrencySelector";
import { useCurrencyFormatter } from "@/hooks/useCurrency";

import CinetPayRechargeForm from "@/components/wallet/CinetPayRechargeForm";
import MonerooRechargeForm from "@/components/wallet/MonerooRechargeForm";
import { RechargeBreakdown } from "@/components/wallet/RechargeBreakdown";
import { useRechargePreview } from "@/hooks/useRechargePreview";
import { RechargeReceipt, loadReceiptFromParams, type ReceiptData } from "@/components/wallet/RechargeReceipt";

const WalletRecharge = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user, profile, ready: authReady } = useAuth();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { balance: walletBalance } = useWallet();
  const { formatPrice, symbol } = useCurrencyFormatter();
  const [amount, setAmount] = useState("");
  const [processing, setProcessing] = useState(false);
  const [mobileNumber, setMobileNumber] = useState("");
  const [mobileOperator, setMobileOperator] = useState("");
  const [providers, setProviders] = useState<{ cinetpay_enabled: boolean; moneroo_enabled: boolean; stripe_enabled: boolean }>({
    cinetpay_enabled: true, moneroo_enabled: false, stripe_enabled: true,
  });
  const cardPreview = useRechargePreview(parseFloat(amount) || 0, "EUR", "stripe");

  useEffect(() => {
    (async () => {
      const v = await getPublicSetting<Record<string, unknown> | null>("payment_providers_config", null);
      if (v) {
        setProviders({
          cinetpay_enabled: (v.cinetpay_enabled as boolean) ?? true,
          moneroo_enabled: (v.moneroo_enabled as boolean) ?? false,
          stripe_enabled: (v.stripe_enabled as boolean) ?? true,
        });
      }
    })();
  }, []);

  // Handle redirect from payment providers and show receipt
  useEffect(() => {
    const status = searchParams.get("recharge");
    if (status !== "success") return;
    (async () => {
      const data = loadReceiptFromParams(searchParams, {
        name: (profile?.full_name as string | undefined) ?? null,
        email: user?.email ?? null,
      });
      if (data) {
        setReceipt(data);
        setReceiptOpen(true);
      }
      // Clean URL params after consuming them
      const next = new URLSearchParams(searchParams);
      ["recharge", "provider", "mid", "sid", "amount", "credits", "currency"].forEach((k) => next.delete(k));
      setSearchParams(next, { replace: true });
    })();
  }, []);

  // Gate the page on auth: redirect once hydration settles if unauthenticated.
  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    // wallet balance is live via useWallet()
    setLoading(false);
  }, [authReady, user, navigate]);

  const handleRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const rechargeAmount = parseFloat(amount);
    
    if (isNaN(rechargeAmount) || rechargeAmount <= 0) {
      toast({
        title: t("invalidAmount"),
        description: t("enterValidAmount"),
        variant: "destructive",
      });
      return;
    }

    if (rechargeAmount < 5) {
      toast({
        title: t("amountTooLow"),
        description: t("minimumCard"),
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);

    try {
      const data = await payments.stripeCredits(
        { amount: rechargeAmount, currency: "EUR" },
        crypto.randomUUID(),
      );

      if (data?.url) {
        window.open(data.url, "_blank");
      }

      toast({
        title: t("redirectToPayment"),
        description: t("redirectToStripe"),
      });
    } catch (error) {
      console.error("Error processing recharge:", error);
      toast({
        title: t("error"),
        description: t("rechargeError"),
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const presetAmounts = [5, 10, 20, 50, 100];

  const handleMobileMoneyRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const rechargeAmount = parseFloat(amount);
    
    if (isNaN(rechargeAmount) || rechargeAmount <= 0) {
      toast({
        title: t("invalidAmount"),
        description: t("enterValidAmount"),
        variant: "destructive",
      });
      return;
    }

    if (rechargeAmount < 500) {
      toast({
        title: t("amountTooLow"),
        description: t("minimumMobile"),
        variant: "destructive",
      });
      return;
    }

    if (!mobileNumber || mobileNumber.length < 8) {
      toast({
        title: t("invalidNumber"),
        description: t("enterValidPhone"),
        variant: "destructive",
      });
      return;
    }

    if (!mobileOperator) {
      toast({
        title: t("operatorRequired"),
        description: t("selectOperatorMsg"),
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);

    try {
      // For now, simulate mobile money integration
      // In production, this would call a mobile money API (Orange Money, MTN MoMo, Wave, etc.)
      toast({
        title: t("mobileMoneyPayment"),
        description: t("mobileMoneyRequested"),
      });

      setTimeout(() => {
        toast({
          title: t("waitingConfirmation"),
          description: t("confirmOnPhone"),
        });
      }, 2000);

    } catch (error) {
      console.error("Error processing mobile money:", error);
      toast({
        title: t("error"),
        description: t("mobileMoneyError"),
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const mobilePresetAmounts = [500, 1000, 2000, 5000, 10000];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 pt-24 pb-12 px-4">
        <div className="container max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">{t("walletTitle")}</h1>
            <p className="text-muted-foreground">{t("walletSubtitle")}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Current Balance Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="w-5 h-5" />
                  {t("currentBalance")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-4xl font-bold text-primary">
                  {walletBalance.toLocaleString()} <span className="text-2xl">{walletBalance > 1 ? t("creditsSuffix") : t("creditSuffix")}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  ≈ {formatPrice(walletBalance)} • {t("availableForTransactions")}
                </p>
                <ExchangeRateRefresh compact />

              </CardContent>
            </Card>

            {/* Recharge Form Card with Tabs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  {t("addCredits")}
                </CardTitle>
                <CardDescription>
                  {t("choosePaymentMethod")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const enabledTabs: Array<"card" | "mobile" | "moneroo"> = [];
                  if (providers.stripe_enabled) enabledTabs.push("card");
                  if (providers.cinetpay_enabled) enabledTabs.push("mobile");
                  if (providers.moneroo_enabled) enabledTabs.push("moneroo");
                  if (enabledTabs.length === 0) {
                    return <p className="text-sm text-muted-foreground text-center py-4">{t("adminProviderAtLeastOne")}</p>;
                  }
                  const defaultTab = enabledTabs[0];
                  return (
                    <Tabs defaultValue={defaultTab} className="w-full">
                      <TabsList className={`grid w-full mb-4 ${enabledTabs.length === 1 ? "grid-cols-1" : enabledTabs.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                        {providers.stripe_enabled && (
                          <TabsTrigger value="card" className="flex items-center gap-2">
                            <CreditCard className="w-4 h-4" />
                            {t("cardTab")}
                          </TabsTrigger>
                        )}
                        {providers.cinetpay_enabled && (
                          <TabsTrigger value="mobile" className="flex items-center gap-2">
                            <Smartphone className="w-4 h-4" />
                            {t("walletProviderCinetpay")}
                          </TabsTrigger>
                        )}
                        {providers.moneroo_enabled && (
                          <TabsTrigger value="moneroo" className="flex items-center gap-2">
                            <Wallet className="w-4 h-4" />
                            {t("walletProviderMoneroo")}
                          </TabsTrigger>
                        )}
                      </TabsList>

                      {providers.stripe_enabled && (
                        <TabsContent value="card">
                          <form onSubmit={handleRecharge} className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="amount-card">{t("amountEur")}</Label>
                              <Input
                                id="amount-card"
                                type="number"
                                min="5"
                                step="0.01"
                                placeholder={t("enterAmount")}
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                required
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {presetAmounts.map((preset) => (
                                <Button key={preset} type="button" variant="outline" onClick={() => setAmount(preset.toString())} className="w-full">
                                  ${preset}
                                </Button>
                              ))}
                            </div>
                            <RechargeBreakdown preview={cardPreview} providerLabel={t("breakdownProviderStripe")} />
                            <Button type="submit" className="w-full" disabled={processing}>
                              {processing ? t("processing") : t("rechargeWithStripe")}
                            </Button>
                          </form>
                        </TabsContent>
                      )}

                      {providers.cinetpay_enabled && (
                        <TabsContent value="mobile">
                          <CinetPayRechargeForm />
                        </TabsContent>
                      )}

                      {providers.moneroo_enabled && (
                        <TabsContent value="moneroo">
                          <MonerooRechargeForm />
                        </TabsContent>
                      )}
                    </Tabs>
                  );
                })()}
              </CardContent>
            </Card>
          </div>

          {/* Payment Methods Info */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                {t("paymentMethods")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <CreditCard className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">{t("bankCard")}</p>
                    <p className="text-sm text-muted-foreground">{t("bankCardProviders")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 rounded-lg border border-orange-500/20">
                  <Smartphone className="w-5 h-5 text-orange-500" />
                  <div>
                    <p className="font-medium">{t("mobileMoney")}</p>
                    <p className="text-sm text-muted-foreground">{t("mobileMoneyProviders")}</p>
                  </div>
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground space-y-2">
                <p>• {t("securePaymentsInfo")}</p>
                <p>• {t("instantCredits")}</p>
                <p>• {t("minimumAmounts")}</p>
                <p>• {t("noTransactionFees")}</p>
              </div>
            </CardContent>
          </Card>

          {/* Usage Info */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t("creditUsage")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• <strong>{t("votes")}:</strong> {t("creditUsageVotes")}</p>
              <p>• <strong>{t("virtualGifts")}:</strong> {t("creditUsageGifts")}</p>
              <p>• <strong>{t("ticketSystem")}:</strong> {t("creditUsageTickets")}</p>
              <p>• <strong>Replays:</strong> {t("creditUsageReplays")}</p>
            </CardContent>
          </Card>

          {/* Currency selector for personalized display */}
          <div className="mt-6">
            <CurrencySelector />
          </div>
        </div>
      </main>
      <Footer />
      <RechargeReceipt open={receiptOpen} onClose={() => setReceiptOpen(false)} data={receipt} />
    </div>
  );
};

export default WalletRecharge;