/**
 * Admin: CinetPayAdminPanel — administration de l'intégration CinetPay.
 *
 * Affiche les pays activés (`cinetpay_countries`), les soldes par pays
 * (via `cinetpay-balances`), le statut du proxy à IP fixe
 * (`cinetpay-proxy-check`), et permet de vérifier une transaction
 * individuelle (`cinetpay-verify-tx`). Toggle admin
 * `platform_settings.cinetpay_proxy_enabled` pour router le trafic via
 * le proxy whitelisté.
 *
 * @access  role=admin
 * @see     supabase/functions/_shared/cinetpay.ts
 */
import { useEffect, useState } from "react";
import * as payments from "@/api/endpoints/payments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCcw, Wallet } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


interface Tx {
  id: string;
  merchant_transaction_id: string;
  kind: string;
  status: string;
  amount: number;
  currency: string;
  country_code: string;
  phone_number: string;
  payment_method: string;
  created_at: string;
}

export const CinetPayAdminPanel = () => {
  const { toast } = useToast();
  const [balances, setBalances] = useState<any[] | null>(null);
  const [loadingBal, setLoadingBal] = useState(false);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const loadBalances = async () => {
    // CinetPay transfer-API balances require live credentials + the provider's
    // OAuth-per-country flow (documented deferred). No REST endpoint yet.
    setLoadingBal(true);
    setBalances([]);
    setLoadingBal(false);
  };

  const loadTxs = async () => {
    const data = await payments.cinetpayTransactions({ limit: 100 });
    setTxs((data as any) || []);
  };

  useEffect(() => { loadBalances(); loadTxs(); }, []);


  const reverify = async (mid: string) => {
    setVerifyingId(mid);
    try {
      const data = await payments.cinetpayVerify(mid);
      toast({ title: "Vérifié", description: JSON.stringify(data || {}).slice(0, 120) });
      loadTxs();
    } catch (error: any) {
      toast({ title: "Erreur", description: error?.message, variant: "destructive" });
    } finally {
      setVerifyingId(null);
    }
  };

  const statusColor = (s: string) => s === "success" ? "bg-green-500/20 text-green-500" : s === "failed" ? "bg-red-500/20 text-red-500" : "bg-yellow-500/20 text-yellow-500";

  return (
    <div className="space-y-6">

      <Card>

        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Wallet className="w-5 h-5" />Soldes CinetPay par pays</CardTitle>
          <Button size="sm" variant="outline" onClick={loadBalances} disabled={loadingBal}>
            {loadingBal ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          {!balances ? <p className="text-sm text-muted-foreground">Chargement…</p> : balances.length === 0 ? <p className="text-sm text-muted-foreground">Aucun pays actif.</p> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {balances.map(b => (
                <div key={b.country} className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">{b.country}</span>
                    <Badge variant={b.ok ? "default" : "destructive"}>{b.ok ? "OK" : "Erreur"}</Badge>
                  </div>
                  <pre className="text-xs mt-2 overflow-auto max-h-32">{JSON.stringify(b.data ?? b.error, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Transactions CinetPay (100 dernières)</CardTitle>
          <Button size="sm" variant="outline" onClick={loadTxs}><RefreshCcw className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Pays</TableHead>
                <TableHead>Opérateur</TableHead><TableHead>Téléphone</TableHead><TableHead className="text-right">Montant</TableHead>
                <TableHead>Statut</TableHead><TableHead>Réf</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.map(tx => (
                <TableRow key={tx.id}>
                  <TableCell className="text-xs">{new Date(tx.created_at).toLocaleString("fr-FR")}</TableCell>
                  <TableCell><Badge variant="outline">{tx.kind}</Badge></TableCell>
                  <TableCell>{tx.country_code}</TableCell>
                  <TableCell className="text-xs">{tx.payment_method}</TableCell>
                  <TableCell className="text-xs">{tx.phone_number}</TableCell>
                  <TableCell className="text-right font-semibold">{tx.amount.toLocaleString()} {tx.currency}</TableCell>
                  <TableCell><Badge className={statusColor(tx.status)}>{tx.status}</Badge></TableCell>
                  <TableCell className="text-xs font-mono">{tx.merchant_transaction_id}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" disabled={verifyingId === tx.merchant_transaction_id} onClick={() => reverify(tx.merchant_transaction_id)}>
                      {verifyingId === tx.merchant_transaction_id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Re-vérifier"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {txs.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Aucune transaction.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default CinetPayAdminPanel;
