/**
 * Admin: TransactionsLedger — grand livre unifié des transactions.
 *
 * Liste paginée et filtrable de toutes les écritures financières
 * (recharges, achats crédits, votes, cadeaux, retraits, remboursements)
 * avec recherche par utilisateur, fournisseur, statut, période. Source de
 * vérité pour les rapprochements comptables.
 *
 * @access  role=admin
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, ShoppingCart, TrendingUp } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { AdminTable } from "@/components/admin/AdminTable";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import * as admin from "@/api/endpoints/admin";

interface CreditPurchase {
  id: string; user_id: string; credits_amount: number; paid_amount: number;
  currency: string; payment_method: string; status: string; created_at: string;
  user_name?: string;
  // Helpers for searching/sorting in AdminTable
  date_label?: string;
  paid_label?: string;
}

interface RevenueDist {
  id: string; source_type: string; total_credits: number; platform_credits: number;
  artist1_credits: number; artist2_credits: number; manager_credits: number;
  payer_id: string; created_at: string;
  payer_name?: string;
  source_label?: string;
  date_label?: string;
}

const TransactionsLedger = () => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const fmtDt = (d: string) => formatTz(d, "dd MMM yyyy HH:mm", { timezone: tz, language });
  const [purchases, setPurchases] = useState<CreditPurchase[]>([]);
  const [distributions, setDistributions] = useState<RevenueDist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const ledger = await admin.ledger().catch(() => ({ purchases: [], distributions: [] }));
      if (!active) return;
      const nextPurchases = (ledger.purchases as unknown as CreditPurchase[]).map((p) => ({
        ...p,
        date_label: p.created_at ? fmtDt(p.created_at) : "",
        paid_label: `${Number(p.paid_amount).toFixed(2)} ${p.currency}`,
      }));
      const nextDistributions = (ledger.distributions as unknown as RevenueDist[]).map((d) => ({
        ...d,
        source_label: d.source_type,
        date_label: d.created_at ? fmtDt(d.created_at) : "",
      }));
      setPurchases(nextPurchases);
      setDistributions(nextDistributions);
      setLoading(false);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const purchaseColumns = [
    {
      key: "user_name",
      label: t("ecoUser"),
      sortable: true,
      render: (p: CreditPurchase) => <span className="font-medium">{p.user_name || "—"}</span>,
    },
    {
      key: "credits_amount",
      label: t("ecoCreditsCol"),
      sortable: true,
      render: (p: CreditPurchase) => (
        <span className="font-bold text-primary">
          {Number(p.credits_amount).toLocaleString()} {t("creditsUnit")}
        </span>
      ),
    },
    {
      key: "paid_label",
      label: t("ecoAmount"),
      sortable: true,
      render: (p: CreditPurchase) => `${Number(p.paid_amount).toFixed(2)} ${p.currency}`,
    },
    {
      key: "payment_method",
      label: t("ecoMethod"),
      sortable: true,
      render: (p: CreditPurchase) => <Badge variant="outline">{p.payment_method}</Badge>,
    },
    {
      key: "status",
      label: t("ecoStatus"),
      sortable: true,
      render: (p: CreditPurchase) => (
        <Badge variant={p.status === "completed" ? "default" : "secondary"}>{p.status}</Badge>
      ),
    },
    {
      key: "date_label",
      label: t("ecoDate"),
      sortable: true,
      render: (p: CreditPurchase) => (
        <span className="text-xs text-muted-foreground">{p.date_label}</span>
      ),
    },
  ];

  const distributionColumns = [
    {
      key: "source_label",
      label: t("ecoSource"),
      sortable: true,
      render: (d: RevenueDist) => (
        <Badge variant="outline" className="text-xs">{d.source_label}</Badge>
      ),
    },
    {
      key: "payer_name",
      label: t("ecoPayer"),
      sortable: true,
      render: (d: RevenueDist) => <span className="text-sm">{d.payer_name}</span>,
    },
    {
      key: "total_credits",
      label: t("ecoTotalCr"),
      sortable: true,
      render: (d: RevenueDist) => (
        <span className="font-bold">{Number(d.total_credits).toLocaleString()} {t("creditsUnit")}</span>
      ),
    },
    {
      key: "platform_credits",
      label: t("ecoPlatform"),
      sortable: true,
      render: (d: RevenueDist) => (
        <span className="text-primary">{Number(d.platform_credits).toLocaleString()}</span>
      ),
    },
    {
      key: "artist1_credits",
      label: t("txArtist1"),
      sortable: true,
      render: (d: RevenueDist) => Number(d.artist1_credits).toLocaleString(),
    },
    {
      key: "artist2_credits",
      label: t("txArtist2"),
      sortable: true,
      render: (d: RevenueDist) => Number(d.artist2_credits).toLocaleString(),
    },
    {
      key: "manager_credits",
      label: t("ecoManager"),
      sortable: true,
      render: (d: RevenueDist) => Number(d.manager_credits).toLocaleString(),
    },
    {
      key: "date_label",
      label: t("ecoDate"),
      sortable: true,
      render: (d: RevenueDist) => (
        <span className="text-xs text-muted-foreground">{d.date_label}</span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          {t("ecoTabLedger")}
        </CardTitle>
        <CardDescription>{t("ecoLedgerDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="purchases" className="space-y-4">
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="purchases" className="gap-2">
              <ShoppingCart className="w-4 h-4" />
              {t("ecoTabPurchases")}
            </TabsTrigger>
            <TabsTrigger value="distributions" className="gap-2">
              <TrendingUp className="w-4 h-4" />
              {t("ecoTabDistributions")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="purchases">
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">{t("commonLoading")}</p>
            ) : (
              <AdminTable
                data={purchases}
                columns={purchaseColumns}
                searchKeys={["user_name", "payment_method", "status", "currency"]}
                pageSize={10}
                emptyMessage={t("ecoNoData")}
              />
            )}
          </TabsContent>

          <TabsContent value="distributions">
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">{t("commonLoading")}</p>
            ) : (
              <AdminTable
                data={distributions}
                columns={distributionColumns}
                searchKeys={["source_label", "payer_name", "source_type"]}
                pageSize={10}
                emptyMessage={t("ecoNoData")}
              />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default TransactionsLedger;
