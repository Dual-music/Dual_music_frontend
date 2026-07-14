/**
 * Admin: RevenueAnalytics — analytics de revenus plateforme.
 *
 * Agrège les transactions financières (recharges, votes, cadeaux,
 * abonnements, billets concert) sur des fenêtres temporelles configurables,
 * avec drill-down par fournisseur (Stripe/CinetPay/Moneroo) et par rôle.
 * Lecture seule via vues Postgres `security_invoker = true`.
 *
 * @access  role=admin
 */
import { useEffect, useState } from "react";
import * as admin from "@/api/endpoints/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Coins, Users, Calendar } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCurrencyFormatter } from "@/hooks/useCurrency";

interface RevenueRow {
  source_type: string;
  total_credits: number;
  platform_credits: number;
  artists_credits: number;
  manager_credits: number;
  transaction_count: number;
}

interface PurchaseStats {
  today_credits: number; today_count: number;
  week_credits: number; week_count: number;
  month_credits: number; month_count: number;
  all_time_credits: number; all_time_amount_usd: number;
}

interface TopEarner {
  user_id: string; full_name: string | null; total_credits: number; role: string;
}

const RevenueAnalytics = () => {
  const { t } = useLanguage();
  const { formatPrice } = useCurrencyFormatter();
  const [period, setPeriod] = useState<"day" | "week" | "month" | "all">("month");
  const [revenue, setRevenue] = useState<RevenueRow[]>([]);
  const [purchaseStats, setPurchaseStats] = useState<PurchaseStats | null>(null);
  const [topEarners, setTopEarners] = useState<TopEarner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [rev, stats, earners] = await Promise.all([
          admin.revenueStats({ period }),
          admin.creditPurchaseStats(),
          admin.topEarners({ period, limit: 10 }),
        ]);
        setRevenue((rev as unknown as RevenueRow[]) || []);
        setPurchaseStats(stats as unknown as PurchaseStats);
        setTopEarners((earners as unknown as TopEarner[]) || []);
      } catch {
        setRevenue([]);
        setTopEarners([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [period]);

  const totalPlatform = revenue.reduce((s, r) => s + Number(r.platform_credits || 0), 0);
  const totalArtists = revenue.reduce((s, r) => s + Number(r.artists_credits || 0), 0);
  const totalManager = revenue.reduce((s, r) => s + Number(r.manager_credits || 0), 0);

  const sourceLabel = (s: string) => t(`ecoSrc_${s}`) || s;

  return (
    <div className="space-y-6">
      <Tabs value={period} onValueChange={(v) => setPeriod(v as any)}>
        <TabsList>
          <TabsTrigger value="day">{t("ecoPeriodDay")}</TabsTrigger>
          <TabsTrigger value="week">{t("ecoPeriodWeek")}</TabsTrigger>
          <TabsTrigger value="month">{t("ecoPeriodMonth")}</TabsTrigger>
          <TabsTrigger value="all">{t("ecoPeriodAll")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Credit purchases */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-yellow-500" />
            {t("ecoCreditsBought")}
          </CardTitle>
          <CardDescription>{t("ecoCreditsBoughtDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: t("ecoToday"), credits: purchaseStats?.today_credits, count: purchaseStats?.today_count },
            { label: t("ecoWeek"), credits: purchaseStats?.week_credits, count: purchaseStats?.week_count },
            { label: t("ecoMonth"), credits: purchaseStats?.month_credits, count: purchaseStats?.month_count },
            { label: t("ecoAllTime"), credits: purchaseStats?.all_time_credits, count: null },
          ].map((s, i) => (
            <Card key={i} className="bg-gradient-to-br from-primary/5 to-accent/5">
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold">{Number(s.credits || 0).toLocaleString()} {t("creditsUnit")}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatPrice(Number(s.credits || 0))}</p>
                {s.count !== null && <p className="text-xs text-muted-foreground">{s.count} {t("ecoTx")}</p>}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {/* Revenue summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardDescription>{t("ecoPlatformRevenue")}</CardDescription>
            <CardTitle className="text-2xl text-primary">{totalPlatform.toLocaleString()} {t("creditsUnit")}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-muted-foreground">≈ {formatPrice(totalPlatform)}</p></CardContent>
        </Card>
        <Card className="border-accent/30">
          <CardHeader className="pb-2">
            <CardDescription>{t("ecoArtistsRevenue")}</CardDescription>
            <CardTitle className="text-2xl text-accent">{totalArtists.toLocaleString()} {t("creditsUnit")}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-muted-foreground">≈ {formatPrice(totalArtists)}</p></CardContent>
        </Card>
        <Card className="border-blue-500/30">
          <CardHeader className="pb-2">
            <CardDescription>{t("ecoManagersRevenue")}</CardDescription>
            <CardTitle className="text-2xl text-blue-500">{totalManager.toLocaleString()} {t("creditsUnit")}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-muted-foreground">≈ {formatPrice(totalManager)}</p></CardContent>
        </Card>
      </div>

      {/* By source */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {t("ecoBySource")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-center text-muted-foreground py-8">{t("commonLoading")}</p> :
          revenue.length === 0 ? <p className="text-center text-muted-foreground py-8">{t("ecoNoData")}</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ecoSource")}</TableHead>
                  <TableHead className="text-right">{t("ecoTotalCr")}</TableHead>
                  <TableHead className="text-right">{t("ecoPlatform")}</TableHead>
                  <TableHead className="text-right">{t("ecoArtists")}</TableHead>
                  <TableHead className="text-right">{t("ecoManager")}</TableHead>
                  <TableHead className="text-right">{t("ecoTxCount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenue.map((r) => (
                  <TableRow key={r.source_type}>
                    <TableCell><Badge variant="outline">{sourceLabel(r.source_type)}</Badge></TableCell>
                    <TableCell className="text-right font-bold">{Number(r.total_credits).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-primary">{Number(r.platform_credits).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-accent">{Number(r.artists_credits).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-blue-500">{Number(r.manager_credits).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{r.transaction_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Top earners */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {t("ecoTopEarners")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topEarners.length === 0 ? <p className="text-center text-muted-foreground py-8">{t("ecoNoData")}</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t("ecoUser")}</TableHead>
                  <TableHead>{t("ecoRole")}</TableHead>
                  <TableHead className="text-right">{t("ecoEarned")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topEarners.map((e, i) => (
                  <TableRow key={e.user_id}>
                    <TableCell className="font-bold">{i + 1}</TableCell>
                    <TableCell>{e.full_name || "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{e.role}</Badge></TableCell>
                    <TableCell className="text-right font-medium">{Number(e.total_credits).toLocaleString()} {t("creditsUnit")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RevenueAnalytics;
