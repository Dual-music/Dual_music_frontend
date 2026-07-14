/**
 * Panel transactions utilisateur : historique unifié recharges/votes/gifts/retraits depuis
 * `wallet_transactions`, filtres par type, export CSV.
 */
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Wallet, ShoppingCart } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const TransactionsPanel = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> {t("txpTitle")}</CardTitle>
          <CardDescription>{t("txpDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate("/transactions")}>
            <FileText className="w-6 h-6" />
            <span>{t("txpViewHistory")}</span>
            <span className="text-xs text-muted-foreground">{t("txpAllTransactions")}</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate("/wallet")}>
            <Wallet className="w-6 h-6" />
            <span>{t("txpRecharge")}</span>
            <span className="text-xs text-muted-foreground">{t("txpBuyCredits")}</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate("/gift-shop")}>
            <ShoppingCart className="w-6 h-6" />
            <span>{t("txpGiftShop")}</span>
            <span className="text-xs text-muted-foreground">{t("txpSendGifts")}</span>
          </Button>
          <Button onClick={() => navigate("/transactions")} className="h-auto py-4 flex-col gap-2">
            <ArrowRight className="w-6 h-6" />
            <span>{t("txpDetailedTable")}</span>
            <span className="text-xs opacity-80">{t("txpWithFilters")}</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default TransactionsPanel;
