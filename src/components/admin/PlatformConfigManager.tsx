/**
 * PlatformConfigManager
 * ---------------------
 * Éditeur des réglages globaux stockés dans `platform_settings` (clé/valeur JSON).
 *
 * Clés gérées ici :
 *  - `vote_config`     : { price_per_vote, min_votes, max_votes }
 *  - `report_config`   : { enabled_on: { live, concert, duel }, viewer_threshold }
 *  - `welcome_config`  : crédits offerts à l'inscription
 *  - `pricing_config`  : toggle d'affichage de la page Pricing
 *  - ... (extensible)
 *
 * Toutes les modifications sont auditées dans `admin_logs`.
 * Les composants front lisent ces valeurs via `usePlatformConfig` / `usePlatformSettings`.
 */
import { useState, useEffect } from "react";
import * as admin from "@/api/endpoints/admin";
import { updatePlatformSetting } from "@/hooks/usePlatformSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Settings, Coins, CreditCard, Save, Network, RefreshCcw, Loader2, Wallet, Banknote, Smartphone, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { Checkbox } from "@/components/ui/checkbox";
import { DEFAULT_PAYOUT_CONFIG, type PayoutConfig, type PayoutMethodCode, type PayoutOperator } from "@/hooks/usePayoutConfig";

interface WelcomeConfig {
  welcome_credits: number;
}

interface PricingConfig {
  enabled: boolean;
}

interface PaymentProvidersConfig {
  cinetpay_enabled: boolean;
  moneroo_enabled: boolean;
  stripe_enabled: boolean;
}

type WithdrawalMode = "manual" | "auto_approve" | "auto_payout";
interface WithdrawalProviderCfg { enabled: boolean; min_amount_credits: number; mode: WithdrawalMode; }
type WithdrawalProvidersConfig = Record<"cinetpay" | "moneroo" | "stripe", WithdrawalProviderCfg>;
const DEFAULT_WD: WithdrawalProvidersConfig = {
  cinetpay: { enabled: true, min_amount_credits: 100, mode: "manual" },
  moneroo: { enabled: true, min_amount_credits: 100, mode: "manual" },
  stripe: { enabled: true, min_amount_credits: 200, mode: "manual" },
};

interface LiveReportConfig {
  enabled_live: boolean;
  enabled_concert: boolean;
  enabled_duel: boolean;
  enabled_competition: boolean;
  viewer_threshold: number;
  stop_percentage: number;
}
const DEFAULT_LIVE_REPORT_CONFIG: LiveReportConfig = {
  enabled_live: true,
  enabled_concert: true,
  enabled_duel: true,
  enabled_competition: true,
  viewer_threshold: 5,
  stop_percentage: 75,
};

const PlatformConfigManager = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [welcomeConfig, setWelcomeConfig] = useState<WelcomeConfig>({ welcome_credits: 100 });
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>({ enabled: true });
  const [concertApproval, setConcertApproval] = useState<{ require_admin_approval: boolean }>({ require_admin_approval: true });
  const [providers, setProviders] = useState<PaymentProvidersConfig>({ cinetpay_enabled: true, moneroo_enabled: false, stripe_enabled: true });
  const [withdrawalCfg, setWithdrawalCfg] = useState<WithdrawalProvidersConfig>(DEFAULT_WD);
  const [payoutCfg, setPayoutCfg] = useState<PayoutConfig>(DEFAULT_PAYOUT_CONFIG);
  const [liveReportCfg, setLiveReportCfg] = useState<LiveReportConfig>(DEFAULT_LIVE_REPORT_CONFIG);

  const [managerReqEnabled, setManagerReqEnabled] = useState<boolean>(true);
  const [artistReqEnabled, setArtistReqEnabled] = useState<boolean>(true);
  const [roleReqLoading, setRoleReqLoading] = useState(false);
  const [proxyEnabled, setProxyEnabled] = useState<boolean>(false);
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyCheckLoading, setProxyCheckLoading] = useState(false);
  const [proxyCheck, setProxyCheck] = useState<{ direct_egress_ip?: string; proxy_egress_ip?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      // Admin editor reads the full settings map (covers keys not on the public
      // allow-list, and gracefully yields `undefined` for unset keys).
      const settings = await admin.getSettings();

      const welcomeVal = settings["welcome_config"] as Record<string, unknown> | undefined;
      if (welcomeVal) {
        setWelcomeConfig({ welcome_credits: (welcomeVal.welcome_credits as number) ?? 100 });
      }
      const pricingVal = settings["pricing_config"] as Record<string, unknown> | undefined;
      if (pricingVal) {
        setPricingConfig({ enabled: (pricingVal.enabled as boolean) ?? true });
      }
      const concertVal = settings["concert_approval_config"] as Record<string, unknown> | undefined;
      if (concertVal) {
        setConcertApproval({ require_admin_approval: (concertVal.require_admin_approval as boolean) ?? true });
      }
      const proxyVal = settings["cinetpay_proxy_enabled"] as Record<string, unknown> | undefined;
      if (proxyVal) {
        setProxyEnabled((proxyVal.enabled as boolean) === true);
      }
      // Ouverture des candidatures de rôle (valeur = booléen brut OU { enabled }).
      const readEnabled = (raw: unknown): boolean =>
        typeof raw === "boolean" ? raw : ((raw as { enabled?: boolean } | undefined)?.enabled ?? true);
      if (settings["manager_requests_enabled"] !== undefined) {
        setManagerReqEnabled(readEnabled(settings["manager_requests_enabled"]));
      }
      if (settings["artist_requests_enabled"] !== undefined) {
        setArtistReqEnabled(readEnabled(settings["artist_requests_enabled"]));
      }
      const providersVal = settings["payment_providers_config"] as Record<string, unknown> | undefined;
      if (providersVal) {
        setProviders({
          cinetpay_enabled: (providersVal.cinetpay_enabled as boolean) ?? true,
          moneroo_enabled: (providersVal.moneroo_enabled as boolean) ?? false,
          stripe_enabled: (providersVal.stripe_enabled as boolean) ?? true,
        });
      }
      const v = settings["withdrawal_providers_config"] as any;
      if (v) {
        setWithdrawalCfg({
          cinetpay: { enabled: v.cinetpay?.enabled ?? true, min_amount_credits: Number(v.cinetpay?.min_amount_credits ?? 100), mode: (v.cinetpay?.mode ?? "manual") as WithdrawalMode },
          moneroo: { enabled: v.moneroo?.enabled ?? true, min_amount_credits: Number(v.moneroo?.min_amount_credits ?? 100), mode: (v.moneroo?.mode ?? "manual") as WithdrawalMode },
          stripe: { enabled: v.stripe?.enabled ?? true, min_amount_credits: Number(v.stripe?.min_amount_credits ?? 200), mode: (v.stripe?.mode ?? "manual") as WithdrawalMode },
        });
      }
      const payoutVal = settings["payout_config"] as Partial<PayoutConfig> | undefined;
      if (payoutVal) {
        setPayoutCfg({
          methods: Array.isArray(payoutVal.methods) && payoutVal.methods.length > 0 ? (payoutVal.methods as PayoutMethodCode[]) : DEFAULT_PAYOUT_CONFIG.methods,
          mobile_operators: Array.isArray(payoutVal.mobile_operators) && payoutVal.mobile_operators.length > 0 ? (payoutVal.mobile_operators as PayoutOperator[]) : DEFAULT_PAYOUT_CONFIG.mobile_operators,
        });
      }
      const reportVal = settings["live_report_config"] as Partial<LiveReportConfig> | undefined;
      if (reportVal) {
        setLiveReportCfg({
          enabled_live: reportVal.enabled_live ?? true,
          enabled_concert: reportVal.enabled_concert ?? true,
          enabled_duel: reportVal.enabled_duel ?? true,
          enabled_competition: reportVal.enabled_competition ?? true,
          viewer_threshold: Number(reportVal.viewer_threshold ?? DEFAULT_LIVE_REPORT_CONFIG.viewer_threshold) || 5,
          stop_percentage: Number(reportVal.stop_percentage ?? DEFAULT_LIVE_REPORT_CONFIG.stop_percentage) || 75,
        });
      }
    } catch {
      /* keep defaults on read failure */
    }
    setLoading(false);
  };


  const toggleProvider = (key: keyof PaymentProvidersConfig, next: boolean) => {
    const updated = { ...providers, [key]: next };
    const enabledCount = Number(updated.cinetpay_enabled) + Number(updated.moneroo_enabled) + Number(updated.stripe_enabled);
    if (enabledCount < 1) {
      toast({ title: t("adminProviderAtLeastOne"), variant: "destructive" });
      return;
    }
    setProviders(updated);
  };

  const toggleProxy = async (next: boolean) => {
    setProxyLoading(true);
    try {
      await updatePlatformSetting("cinetpay_proxy_enabled", { enabled: next });
      setProxyEnabled(next);
      toast({
        title: next ? t("adminCinetpayProxyEnabled") : t("adminCinetpayProxyDisabled"),
        description: t("adminCinetpayProxyApplyDelay"),
      });
    } catch (e) {
      toast({ title: t("error"), description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setProxyLoading(false);
    }
  };

  /** Active/désactive l'ouverture des candidatures d'un rôle (artiste/manager). */
  const toggleRoleRequests = async (key: "manager_requests_enabled" | "artist_requests_enabled", next: boolean) => {
    setRoleReqLoading(true);
    try {
      await updatePlatformSetting(key, { enabled: next });
      if (key === "manager_requests_enabled") setManagerReqEnabled(next);
      else setArtistReqEnabled(next);
      toast({ title: t("success") });
    } catch (e) {
      toast({ title: t("error"), description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setRoleReqLoading(false);
    }
  };

  const runProxyCheck = async () => {
    // CinetPay egress-proxy check requires the provider transfer API (documented
    // deferred). No REST endpoint yet — surfaced as unavailable.
    toast({ title: t("adminCinetpayProxyTestError"), description: "N/A", variant: "destructive" });
  };

  const saveAll = async () => {
    setSaving(true);
    const welcomeJson = { welcome_credits: welcomeConfig.welcome_credits };
    const pricingJson = { enabled: pricingConfig.enabled };
    const concertJson = { require_admin_approval: concertApproval.require_admin_approval };
    const providersJson = {
      cinetpay_enabled: providers.cinetpay_enabled,
      moneroo_enabled: providers.moneroo_enabled,
      stripe_enabled: providers.stripe_enabled,
    };
    const withdrawalJson = withdrawalCfg;
    const payoutJson = {
      methods: payoutCfg.methods,
      mobile_operators: payoutCfg.mobile_operators.filter((o) => o.code.trim() && o.label.trim()),
    };
    const liveReportJson = {
      enabled_live: liveReportCfg.enabled_live,
      enabled_concert: liveReportCfg.enabled_concert,
      enabled_duel: liveReportCfg.enabled_duel,
      enabled_competition: liveReportCfg.enabled_competition,
      viewer_threshold: Math.max(1, Math.floor(liveReportCfg.viewer_threshold)),
      stop_percentage: Math.min(100, Math.max(1, Math.floor(liveReportCfg.stop_percentage))),
    };

    try {
      await Promise.all([
        updatePlatformSetting("welcome_config", welcomeJson),
        updatePlatformSetting("pricing_config", pricingJson),
        updatePlatformSetting("concert_approval_config", concertJson),
        updatePlatformSetting("payment_providers_config", providersJson),
        updatePlatformSetting("withdrawal_providers_config", withdrawalJson),
        updatePlatformSetting("payout_config", payoutJson),
        updatePlatformSetting("live_report_config", liveReportJson),
      ]);
      toast({ title: t("adminPlatformConfigSaved") });
    } catch (e) {
      toast({ title: t("error"), description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">{t("loading")}...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" /> {t("adminPlatformConfigTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("adminPlatformConfigDesc")}</p>
      </div>

      {/* Welcome Credits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Coins className="w-5 h-5" /> {t("adminWelcomeCreditsTitle")}</CardTitle>
          <CardDescription>{t("adminWelcomeCreditsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted/30 rounded-lg space-y-2">
            <Label className="text-base font-medium">{t("adminWelcomeCreditsAmount")}</Label>
            <p className="text-sm text-muted-foreground">{t("adminWelcomeCreditsAmountDesc")}</p>
            <Input
              type="number"
              value={welcomeConfig.welcome_credits}
              onChange={(e) => setWelcomeConfig({ welcome_credits: parseInt(e.target.value) || 0 })}
              className="w-32"
              min={0}
            />
          </div>
        </CardContent>
      </Card>

      {/* Pricing Page Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5" /> {t("adminPricingToggleTitle")}</CardTitle>
          <CardDescription>{t("adminPricingToggleDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <Label className="text-base font-medium">{t("adminPricingEnable")}</Label>
              <p className="text-sm text-muted-foreground">{t("adminPricingEnableDesc")}</p>
            </div>
            <Switch
              checked={pricingConfig.enabled}
              onCheckedChange={(v) => setPricingConfig({ enabled: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Concert Approval Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> {t("adminConcertApprovalTitle")}</CardTitle>
          <CardDescription>{t("adminConcertApprovalDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <Label className="text-base font-medium">{t("adminConcertApprovalToggle")}</Label>
              <p className="text-sm text-muted-foreground">{t("adminConcertApprovalToggleDesc")}</p>
            </div>
            <Switch
              checked={concertApproval.require_admin_approval}
              onCheckedChange={(v) => setConcertApproval({ require_admin_approval: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Ouverture des candidatures artiste / manager */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> {t("adminRoleRequestsTitle")}</CardTitle>
          <CardDescription>{t("adminRoleRequestsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <Label className="text-base font-medium">{t("adminArtistRequestsToggle")}</Label>
              <p className="text-sm text-muted-foreground">{t("adminArtistRequestsToggleDesc")}</p>
            </div>
            <Switch checked={artistReqEnabled} disabled={roleReqLoading} onCheckedChange={(v) => toggleRoleRequests("artist_requests_enabled", v)} />
          </div>
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <Label className="text-base font-medium">{t("adminManagerRequestsToggle")}</Label>
              <p className="text-sm text-muted-foreground">{t("adminManagerRequestsToggleDesc")}</p>
            </div>
            <Switch checked={managerReqEnabled} disabled={roleReqLoading} onCheckedChange={(v) => toggleRoleRequests("manager_requests_enabled", v)} />
          </div>
        </CardContent>
      </Card>

      {/* Payment Providers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="w-5 h-5" /> {t("adminPaymentProvidersTitle")}</CardTitle>
          <CardDescription>{t("adminPaymentProvidersDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            { key: "cinetpay_enabled" as const, label: t("adminProviderCinetpay") },
            { key: "moneroo_enabled" as const, label: t("adminProviderMoneroo") },
            { key: "stripe_enabled" as const, label: t("adminProviderStripe") },
          ]).map(p => (
            <div key={p.key} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div>
                <Label className="text-base font-medium">{p.label}</Label>
                <p className="text-sm text-muted-foreground">{t("adminProviderEnableDesc")}</p>
              </div>
              <Switch
                checked={providers[p.key]}
                onCheckedChange={(v) => toggleProvider(p.key, v)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* CinetPay Proxy Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Network className="w-5 h-5" /> {t("adminCinetpayProxyTitle")}</CardTitle>
          <CardDescription>{t("adminCinetpayProxyDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <Label className="text-base font-medium">{t("adminCinetpayProxyToggle")}</Label>
              <p className="text-sm text-muted-foreground">{t("adminCinetpayProxyToggleDesc")}</p>
            </div>
            <Switch checked={proxyEnabled} onCheckedChange={toggleProxy} disabled={proxyLoading} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" onClick={runProxyCheck} disabled={proxyCheckLoading}>
              {proxyCheckLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
              {t("adminCinetpayProxyTestBtn")}
            </Button>
            {proxyCheck && (
              <div className="text-xs space-x-3">
                <span>{t("adminCinetpayProxyDirect")} : <code className="font-mono">{proxyCheck.direct_egress_ip || "—"}</code></span>
                <span>{t("adminCinetpayProxyVia")} : <code className="font-mono">{proxyCheck.proxy_egress_ip || "—"}</code></span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Withdrawal Providers Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Banknote className="w-5 h-5" /> {t("adminWdCfgTitle")}</CardTitle>
          <CardDescription>
            {t("adminWdCfgDesc")}
            <br />
            <span className="text-xs">
              {t("adminWdCfgLegend")
                .split(/(\{manual\}|\{autoApprove\}|\{autoPayout\})/g)
                .map((chunk, i) => {
                  if (chunk === "{manual}") return <strong key={i}>{t("adminWdCfgModeManual")}</strong>;
                  if (chunk === "{autoApprove}") return <strong key={i}>{t("adminWdCfgModeAutoApprove")}</strong>;
                  if (chunk === "{autoPayout}") return <strong key={i}>{t("adminWdCfgModeAutoPayout")}</strong>;
                  return <span key={i}>{chunk}</span>;
                })}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["cinetpay", "moneroo", "stripe"] as const).map((prov) => {
            const cfg = withdrawalCfg[prov];
            const label = prov === "cinetpay" ? t("adminWdCfgProvCinetpay") : prov === "moneroo" ? t("adminWdCfgProvMoneroo") : t("adminWdCfgProvStripe");
            return (
              <div key={prov} className="p-4 bg-muted/30 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">{label}</Label>
                  <Switch
                    checked={cfg.enabled}
                    onCheckedChange={(v) => setWithdrawalCfg({ ...withdrawalCfg, [prov]: { ...cfg, enabled: v } })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">{t("adminWdCfgMinAmount")}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={cfg.min_amount_credits}
                      onChange={(e) => setWithdrawalCfg({ ...withdrawalCfg, [prov]: { ...cfg, min_amount_credits: parseInt(e.target.value) || 0 } })}
                      disabled={!cfg.enabled}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("adminWdCfgMode")}</Label>
                    <Select
                      value={cfg.mode}
                      onValueChange={(v) => setWithdrawalCfg({ ...withdrawalCfg, [prov]: { ...cfg, mode: v as WithdrawalMode } })}
                      disabled={!cfg.enabled}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">{t("adminWdCfgModeManual")}</SelectItem>
                        <SelectItem value="auto_approve">{t("adminWdCfgModeAutoApprove")}</SelectItem>
                        <SelectItem value="auto_payout">{t("adminWdCfgModeAutoPayout")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Payout methods & operators */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5" /> {t("adminPayoutCfgTitle")}</CardTitle>
          <CardDescription>{t("adminPayoutCfgDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label className="text-base font-semibold">{t("adminPayoutCfgMethods")}</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
              {(["mobile_money", "bank", "paypal"] as const).map((m) => {
                const enabled = payoutCfg.methods.includes(m);
                const labelMap: Record<typeof m, string> = {
                  mobile_money: t("payoutMobileMoney"),
                  bank: t("payoutBankTransfer"),
                  paypal: t("payoutPaypal"),
                };
                return (
                  <label key={m} className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg cursor-pointer">
                    <Checkbox
                      checked={enabled}
                      onCheckedChange={(v) => {
                        const next = v
                          ? Array.from(new Set([...payoutCfg.methods, m]))
                          : payoutCfg.methods.filter((x) => x !== m);
                        setPayoutCfg({ ...payoutCfg, methods: next.length ? next : payoutCfg.methods });
                      }}
                    />
                    <span className="text-sm">{labelMap[m]}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">{t("adminPayoutCfgOperators")}</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPayoutCfg({
                    ...payoutCfg,
                    mobile_operators: [...payoutCfg.mobile_operators, { code: "", label: "" }],
                  })
                }
              >
                <Plus className="w-4 h-4 mr-1" />{t("adminPayoutCfgAddOp")}
              </Button>
            </div>
            <div className="space-y-2 mt-2">
              {payoutCfg.mobile_operators.map((op, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    placeholder={t("adminPayoutCfgOpCode")}
                    value={op.code}
                    className="max-w-[160px]"
                    onChange={(e) => {
                      const next = [...payoutCfg.mobile_operators];
                      next[idx] = { ...op, code: e.target.value.trim().toLowerCase() };
                      setPayoutCfg({ ...payoutCfg, mobile_operators: next });
                    }}
                  />
                  <Input
                    placeholder={t("adminPayoutCfgOpLabel")}
                    value={op.label}
                    onChange={(e) => {
                      const next = [...payoutCfg.mobile_operators];
                      next[idx] = { ...op, label: e.target.value };
                      setPayoutCfg({ ...payoutCfg, mobile_operators: next });
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      setPayoutCfg({
                        ...payoutCfg,
                        mobile_operators: payoutCfg.mobile_operators.filter((_, i) => i !== idx),
                      })
                    }
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live report configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Signalement d'événements</CardTitle>
          <CardDescription>
            Activez ou désactivez le signalement par les spectateurs pour chaque type d'événement, et ajustez les seuils d'auto-arrêt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {([
            { key: "enabled_live" as const, label: "Lives spontanés" },
            { key: "enabled_concert" as const, label: "Concerts" },
            { key: "enabled_duel" as const, label: "Duels" },
            { key: "enabled_competition" as const, label: "Compétitions" },
          ]).map((row) => (
            <div key={row.key} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <Label className="text-base">{row.label}</Label>
              <Switch
                checked={liveReportCfg[row.key]}
                onCheckedChange={(v) => setLiveReportCfg({ ...liveReportCfg, [row.key]: v })}
              />
            </div>
          ))}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Seuil de spectateurs (bouton visible)</Label>
              <Input
                type="number"
                min={1}
                value={liveReportCfg.viewer_threshold}
                onChange={(e) => setLiveReportCfg({ ...liveReportCfg, viewer_threshold: parseInt(e.target.value) || 1 })}
              />
              <p className="text-xs text-muted-foreground mt-1">Défaut : 5 spectateurs.</p>
            </div>
            <div>
              <Label className="text-sm">% de signalements pour auto-stop</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={liveReportCfg.stop_percentage}
                onChange={(e) => setLiveReportCfg({ ...liveReportCfg, stop_percentage: parseInt(e.target.value) || 75 })}
              />
              <p className="text-xs text-muted-foreground mt-1">Défaut : 75 %. Arrêt 5 min après franchissement.</p>
            </div>
          </div>
        </CardContent>
      </Card>




      <Button onClick={saveAll} disabled={saving} className="w-full">
        <Save className="w-4 h-4 mr-2" />
        {saving ? t("adminReferralSaving") : t("adminPlatformConfigSaveBtn")}
      </Button>
    </div>
  );
};

export default PlatformConfigManager;
