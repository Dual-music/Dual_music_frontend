/**
 * Formulaire de retrait artiste : onglets Revenus / Retrait / Historique. Charge `withdrawal_requests`, monte `MyRevenuesView`, `WithdrawalPinGate`, `QuickWithdrawDialog`, `PayoutMethodsManager`. Affiche solde dispo en crédits + devise locale (`useCurrencyFormatter`).
 */
import { useState, useEffect } from "react";
import { myRequests } from "@/api/endpoints/withdrawals";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Banknote, Clock, CheckCircle, XCircle, TrendingUp, Wallet } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCurrencyFormatter } from "@/hooks/useCurrency";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import { PayoutMethodsManager } from "@/components/profile/PayoutMethodsManager";
import { QuickWithdrawDialog } from "@/components/profile/QuickWithdrawDialog";
import { MyRevenuesView } from "@/components/profile/MyRevenuesView";
import { WithdrawalPinGate } from "@/components/profile/WithdrawalPinGate";

interface WithdrawalFormProps {
  userId: string;
  availableBalance: number;
}

interface WithdrawalRequest {
  id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  created_at: string;
  processed_at: string | null;
}

export const WithdrawalForm = ({ userId, availableBalance }: WithdrawalFormProps) => {
  const { t, language } = useLanguage();
  const { formatPrice } = useCurrencyFormatter();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const [loading, setLoading] = useState(true);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);

  useEffect(() => {
    loadHistory();
  }, [userId]);

  const loadHistory = async () => {
    try {
      const data = await myRequests();
      setWithdrawals((data as any) ?? []);
    } catch {
      setWithdrawals([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="border-yellow-500 text-yellow-500"><Clock className="w-3 h-3 mr-1" />{t("wdStatusPending")}</Badge>;
      case "processing":
        return <Badge variant="outline" className="border-blue-500 text-blue-500"><Clock className="w-3 h-3 mr-1" />{t("wdStatusProcessing")}</Badge>;
      case "completed":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />{t("wdStatusCompleted")}</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />{t("wdStatusRejected")}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="revenues" className="w-full">
        <TabsList className="w-full grid grid-cols-3 h-auto">
          <TabsTrigger value="revenues" className="text-xs sm:text-sm py-2">
            <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
            <span className="hidden sm:inline">{t("wdTabRevenues")}</span>
            <span className="sm:hidden">{t("wdTabRevenuesShort")}</span>
          </TabsTrigger>
          <TabsTrigger value="withdraw" className="text-xs sm:text-sm py-2">
            <Banknote className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
            {t("wdTabWithdraw")}
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm py-2">
            <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
            {t("wdTabHistory")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="revenues" className="mt-4">
          <MyRevenuesView />
        </TabsContent>

        <TabsContent value="withdraw" className="mt-4 space-y-4">
          <WithdrawalPinGate>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Wallet className="w-5 h-5 text-primary" />
                  {t("wdAvailableBalance")}
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {t("wdAvailableDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg bg-gradient-to-br from-green-500/10 to-emerald-500/10">
                  <div>
                    <p className="text-3xl font-bold">{availableBalance.toLocaleString()} {availableBalance > 1 ? t("revCreditPlural") : t("revCreditSingular")}</p>
                    <p className="text-sm text-muted-foreground">≈ {formatPrice(availableBalance)}</p>
                  </div>
                  <QuickWithdrawDialog balance={availableBalance} />
                </div>
              </CardContent>
            </Card>
            <PayoutMethodsManager />
          </WithdrawalPinGate>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">{t("wdHistory")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t("commonLoading")}</p>
              ) : withdrawals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t("wdNoWithdrawals")}</p>
              ) : (
                withdrawals.map((w) => (
                  <div key={w.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-muted/50 rounded-lg">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">
                        {Number(w.amount).toLocaleString()} {Number(w.amount) > 1 ? t("revCreditPlural") : t("revCreditSingular")} <span className="text-xs text-muted-foreground">(≈ {formatPrice(Number(w.amount))})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {w.payment_method} • {formatTz(w.created_at, "dd MMM yyyy", { timezone: tz, language })}
                      </p>
                    </div>
                    <div className="flex-shrink-0">{getStatusBadge(w.status)}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
