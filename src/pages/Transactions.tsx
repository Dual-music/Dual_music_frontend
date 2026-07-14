import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as payments from "@/api/endpoints/payments";
import * as withdrawalsApi from "@/api/endpoints/withdrawals";
import * as wallet from "@/api/endpoints/wallet";
import { useAuth } from "@/contexts/AuthContext";
import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfileFooter from "@/components/profile/ProfileFooter";
import ProfileSidebar, { ProfileRole } from "@/components/profile/ProfileSidebar";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardList, ShoppingCart, TrendingUp, Banknote, Coins,
  Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCurrencyFormatter } from "@/hooks/useCurrency";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";

interface CreditPurchase {
  id: string;
  credits_amount: number;
  paid_amount: number;
  currency: string;
  payment_method: string;
  status: string;
  created_at: string;
}
interface RevenueDistribution {
  id: string;
  source_type: string;
  total_credits: number;
  platform_credits: number;
  artist1_credits: number;
  artist2_credits: number;
  manager_credits: number;
  artist1_id: string | null;
  artist2_id: string | null;
  manager_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}
interface WithdrawalRequest {
  id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  created_at: string;
  processed_at: string | null;
}
interface MyRevenueRow {
  source_id: string;
  event_label: string;
  source_type: string;
  total_received: number;
  tx_count: number;
  last_at: string;
}

type SortDir = "asc" | "desc";
interface SortState { key: string; dir: SortDir; }

// ───────── Reusable controls ─────────
function useTableState<T extends Record<string, any>>(
  rows: T[],
  searchKeys: (keyof T)[],
  defaultSort: SortState,
) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(defaultSort);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q))
    );
  }, [rows, query, searchKeys]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sort.key]; const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sort.dir === "asc" ? av - bv : bv - av;
      }
      const as = String(av); const bs = String(bv);
      // dates parseable
      const ad = Date.parse(as); const bd = Date.parse(bs);
      if (!isNaN(ad) && !isNaN(bd)) return sort.dir === "asc" ? ad - bd : bd - ad;
      return sort.dir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return arr;
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => { if (page > pageCount) setPage(1); }, [pageCount, page]);
  const paginated = useMemo(() => {
    const s = (page - 1) * pageSize;
    return sorted.slice(s, s + pageSize);
  }, [sorted, page, pageSize]);

  const toggleSort = (key: string) => {
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  };

  return { query, setQuery, sort, toggleSort, pageSize, setPageSize, page, setPage, pageCount, filtered, sorted, paginated };
}

function SortBtn({ active, dir, label, onClick }: { active: boolean; dir: SortDir; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 hover:text-foreground transition-colors">
      <span>{label}</span>
      {active ? (dir === "asc" ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />) : <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />}
    </button>
  );
}

function TableToolbar({
  query, setQuery, pageSize, setPageSize, total, t,
}: any) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between mb-4">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("txSearchPlaceholder")}
          className="pl-8 h-9"
        />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="hidden sm:inline">{t("txShowing")} {total} {t("txTotal")}</span>
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[5, 10, 25, 50, 100].map((n) => (
              <SelectItem key={n} value={String(n)}>{n} {t("txPerPage")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function PaginationBar({ page, setPage, pageCount, t }: any) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
      <span className="text-xs text-muted-foreground">{t("txPage")} {page} {t("txOf")} {pageCount}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
          <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">{t("txPrev")}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPage(Math.min(pageCount, page + 1))} disabled={page === pageCount}>
          <span className="hidden sm:inline">{t("txNext")}</span> <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

const Transactions = () => {
  const navigate = useNavigate();
  const { user, roles, ready } = useAuth();
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const fmtDt = (d: string) => formatTz(d, "dd MMM yyyy HH:mm", { timezone: tz, language });
  const { formatPrice } = useCurrencyFormatter();
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<CreditPurchase[]>([]);
  const [outgoing, setOutgoing] = useState<RevenueDistribution[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [myRevenues, setMyRevenues] = useState<MyRevenueRow[]>([]);

  const canEarn = roles.some((r) => ["artist", "manager", "admin"].includes(r));

  useEffect(() => {
    if (!ready) return;
    if (!user) { navigate("/auth"); return; }
    (async () => {
      try {
        const earner = roles.some((r) => ["artist", "manager", "admin"].includes(r));

        const [purchasesData, outgoingData] = await Promise.all([
          payments.history({ limit: 500 }),
          wallet.getSpending({ limit: 500 }),
        ]);
        setPurchases((purchasesData as unknown as CreditPurchase[]) || []);
        setOutgoing((outgoingData as unknown as RevenueDistribution[]) || []);

        if (earner) {
          const [wds, revs] = await Promise.all([
            withdrawalsApi.myRequests(),
            wallet.getRevenues(),
          ]);
          setWithdrawals((wds as unknown as WithdrawalRequest[]) || []);
          setMyRevenues((revs as unknown as MyRevenueRow[]) || []);
        }
      } catch (e) {
        console.error("Error loading transactions:", e);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, navigate]);

  const sourceLabel = (src: string) => t(`ecoSrc_${src}`) || src;
  const statusBadge = (status: string) => {
    const variant =
      status === "completed" ? "default" :
      status === "pending" || status === "processing" ? "secondary" :
      status === "rejected" || status === "failed" ? "destructive" : "outline";
    return <Badge variant={variant as any}>{status}</Badge>;
  };

  const isAdmin = roles.includes("admin");
  const isArtist = roles.includes("artist");
  const isManager = roles.includes("manager");
  const sidebarRole: ProfileRole = isArtist ? "artist" : isManager ? "manager" : "fan";
  const primaryRole = isAdmin ? "admin" : isArtist ? "artist" : isManager ? "manager" : "fan";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Table states
  const purchasesState = useTableState(purchases, ["payment_method", "status", "currency"], { key: "created_at", dir: "desc" });
  const withdrawalsState = useTableState(withdrawals, ["payment_method", "status"], { key: "created_at", dir: "desc" });
  const revenuesState = useTableState(myRevenues, ["event_label", "source_type"], { key: "last_at", dir: "desc" });
  const outgoingState = useTableState(outgoing, ["source_type"], { key: "created_at", dir: "desc" });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ProfileHeader primaryRole={primaryRole as any} showMenuButton onMenuToggle={() => setSidebarOpen((v) => !v)} />
      <main className="flex-1 container mx-auto px-3 sm:px-4 pt-20 pb-8">
        <div className="flex gap-6">
          {isAdmin ? (
            <AdminSidebar
              active="transactions"
              onSelect={(v) => {
                if (v === "transactions") return;
                if (v === "profile") { navigate("/profile"); return; }
                navigate(`/admin?tab=${v}`);
              }}
              stats={{ pendingArtistRequests: 0, pendingManagerRequests: 0, pendingDuelRequests: 0, pendingWithdrawals: 0, activeLives: 0 }}
              open={sidebarOpen}
              onOpenChange={setSidebarOpen}
            />
          ) : (
            <ProfileSidebar
              role={sidebarRole}
              active="transactions"
              onSelect={(v) => { if (v === "transactions") return; navigate(`/profile?tab=${v}`); }}
              open={sidebarOpen}
              onOpenChange={setSidebarOpen}
            />
          )}
          <div className="flex-1 min-w-0 max-w-5xl">
            <div className="mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 flex items-center gap-2 sm:gap-3">
                <ClipboardList className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
                <span className="truncate">{t("txPageTitle")}</span>
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">{t("txPageSubtitle")}</p>
            </div>

            {loading ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">{t("commonLoading")}</CardContent></Card>
            ) : (
              <Tabs defaultValue="incoming" className="space-y-4 sm:space-y-6">
                <div className="overflow-x-auto -mx-1 px-1 scrollbar-hidden">
                  <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 sm:w-full sm:max-w-3xl sm:grid sm:grid-cols-2 md:grid-cols-4 gap-1">
                    <TabsTrigger value="incoming" className="gap-2 whitespace-nowrap">
                      <ShoppingCart className="w-4 h-4" />
                      <span>{t("txTabIncoming")}</span>
                    </TabsTrigger>
                    <TabsTrigger value="outgoing" className="gap-2 whitespace-nowrap">
                      <TrendingUp className="w-4 h-4" />
                      <span>{t("txTabOutgoing")}</span>
                    </TabsTrigger>
                    {canEarn && (
                      <TabsTrigger value="my-revenues" className="gap-2 whitespace-nowrap">
                        <Coins className="w-4 h-4" />
                        <span>{t("txTabMyRevenues")}</span>
                      </TabsTrigger>
                    )}
                    {canEarn && (
                      <TabsTrigger value="withdrawals" className="gap-2 whitespace-nowrap">
                        <Banknote className="w-4 h-4" />
                        <span>{t("txTabWithdrawals")}</span>
                      </TabsTrigger>
                    )}
                  </TabsList>
                </div>

                {/* INCOMING */}
                <TabsContent value="incoming">
                  <Card>
                    <CardHeader>
                      <CardTitle>{t("txIncomingTitle")}</CardTitle>
                      <CardDescription>{t("txIncomingDesc")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <TableToolbar t={t} {...purchasesState} total={purchasesState.filtered.length} />
                      {purchasesState.paginated.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">{purchases.length === 0 ? t("txNoPurchases") : t("txNoResults")}</p>
                      ) : (
                        <>
                          {/* Desktop table */}
                          <div className="hidden md:block overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead><SortBtn active={purchasesState.sort.key === "credits_amount"} dir={purchasesState.sort.dir} label={t("ecoCreditsCol")} onClick={() => purchasesState.toggleSort("credits_amount")} /></TableHead>
                                  <TableHead><SortBtn active={purchasesState.sort.key === "paid_amount"} dir={purchasesState.sort.dir} label={t("ecoAmount")} onClick={() => purchasesState.toggleSort("paid_amount")} /></TableHead>
                                  <TableHead><SortBtn active={purchasesState.sort.key === "payment_method"} dir={purchasesState.sort.dir} label={t("ecoMethod")} onClick={() => purchasesState.toggleSort("payment_method")} /></TableHead>
                                  <TableHead><SortBtn active={purchasesState.sort.key === "status"} dir={purchasesState.sort.dir} label={t("ecoStatus")} onClick={() => purchasesState.toggleSort("status")} /></TableHead>
                                  <TableHead><SortBtn active={purchasesState.sort.key === "created_at"} dir={purchasesState.sort.dir} label={t("ecoDate")} onClick={() => purchasesState.toggleSort("created_at")} /></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {purchasesState.paginated.map((p) => (
                                  <TableRow key={p.id}>
                                    <TableCell className="font-bold text-primary">+{Number(p.credits_amount).toLocaleString()} {t("creditsUnit")}</TableCell>
                                    <TableCell>{Number(p.paid_amount).toFixed(2)} {p.currency}</TableCell>
                                    <TableCell><Badge variant="outline">{p.payment_method}</Badge></TableCell>
                                    <TableCell>{statusBadge(p.status)}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDt(p.created_at)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                          {/* Mobile cards */}
                          <div className="md:hidden space-y-3">
                            {purchasesState.paginated.map((p) => (
                              <Card key={p.id} className="bg-card border-border/60">
                                <CardContent className="p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-primary">+{Number(p.credits_amount).toLocaleString()} {t("creditsUnit")}</span>
                                    {statusBadge(p.status)}
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <span>{Number(p.paid_amount).toFixed(2)} {p.currency}</span>
                                    <Badge variant="outline" className="text-xs">{p.payment_method}</Badge>
                                  </div>
                                  <div className="text-xs text-muted-foreground">{fmtDt(p.created_at)}</div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </>
                      )}
                      <PaginationBar t={t} {...purchasesState} />
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* OUTGOING */}
                <TabsContent value="outgoing">
                  <Card>
                    <CardHeader>
                      <CardTitle>{t("txOutgoingTitle")}</CardTitle>
                      <CardDescription>{t("txOutgoingDesc")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <TableToolbar t={t} {...outgoingState} total={outgoingState.filtered.length} />
                      {outgoingState.paginated.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">{outgoing.length === 0 ? t("txNoOutgoing") : t("txNoResults")}</p>
                      ) : (
                        <div className="space-y-3">
                          {outgoingState.paginated.map((d) => {
                            const total = Number(d.total_credits);
                            const platform = Number(d.platform_credits);
                            const a1 = Number(d.artist1_credits);
                            const a2 = Number(d.artist2_credits);
                            const mgr = Number(d.manager_credits);
                            const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
                            return (
                              <Card key={d.id} className="border-border/60">
                                <CardContent className="p-4 space-y-3">
                                  <div className="flex items-center justify-between flex-wrap gap-2">
                                    <Badge variant="outline" className="text-xs">{sourceLabel(d.source_type)}</Badge>
                                    <div className="text-right">
                                      <div className="text-sm font-bold">−{total.toLocaleString()} {t("creditsUnit")}</div>
                                      <div className="text-xs text-muted-foreground">~{formatPrice(total)}</div>
                                    </div>
                                  </div>
                                  <div className="flex h-2 rounded overflow-hidden bg-muted">
                                    {platform > 0 && <div className="bg-primary" style={{ width: `${pct(platform)}%` }} />}
                                    {a1 > 0 && <div className="bg-pink-500" style={{ width: `${pct(a1)}%` }} />}
                                    {a2 > 0 && <div className="bg-purple-500" style={{ width: `${pct(a2)}%` }} />}
                                    {mgr > 0 && <div className="bg-yellow-500" style={{ width: `${pct(mgr)}%` }} />}
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" /><span className="text-muted-foreground">{t("ecoPlatform")} :</span><span className="font-semibold">{platform.toLocaleString()}</span></div>
                                    {a1 > 0 && <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pink-500" /><span className="text-muted-foreground">{t("txArtist1")} :</span><span className="font-semibold">{a1.toLocaleString()}</span></div>}
                                    {a2 > 0 && <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500" /><span className="text-muted-foreground">{t("txArtist2")} :</span><span className="font-semibold">{a2.toLocaleString()}</span></div>}
                                    {mgr > 0 && <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" /><span className="text-muted-foreground">{t("ecoManager")} :</span><span className="font-semibold">{mgr.toLocaleString()}</span></div>}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{fmtDt(d.created_at)}</div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                      <PaginationBar t={t} {...outgoingState} />
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* MY REVENUES */}
                <TabsContent value="my-revenues">
                  <Card>
                    <CardHeader>
                      <CardTitle>{t("txMyRevenuesTitle")}</CardTitle>
                      <CardDescription>{t("txMyRevenuesDesc")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <TableToolbar t={t} {...revenuesState} total={revenuesState.filtered.length} />
                      {revenuesState.paginated.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">{myRevenues.length === 0 ? t("txMyRevenuesNone") : t("txNoResults")}</p>
                      ) : (
                        <>
                          <div className="hidden md:block overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead><SortBtn active={revenuesState.sort.key === "event_label"} dir={revenuesState.sort.dir} label={t("txMyRevenuesEvent")} onClick={() => revenuesState.toggleSort("event_label")} /></TableHead>
                                  <TableHead><SortBtn active={revenuesState.sort.key === "source_type"} dir={revenuesState.sort.dir} label={t("txMyRevenuesSource")} onClick={() => revenuesState.toggleSort("source_type")} /></TableHead>
                                  <TableHead className="text-right"><SortBtn active={revenuesState.sort.key === "total_received"} dir={revenuesState.sort.dir} label={t("txMyRevenuesTotal")} onClick={() => revenuesState.toggleSort("total_received")} /></TableHead>
                                  <TableHead className="text-right"><SortBtn active={revenuesState.sort.key === "tx_count"} dir={revenuesState.sort.dir} label={t("txMyRevenuesCount")} onClick={() => revenuesState.toggleSort("tx_count")} /></TableHead>
                                  <TableHead><SortBtn active={revenuesState.sort.key === "last_at"} dir={revenuesState.sort.dir} label={t("txMyRevenuesLast")} onClick={() => revenuesState.toggleSort("last_at")} /></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {revenuesState.paginated.map((r, i) => (
                                  <TableRow key={`${r.source_id}-${r.source_type}-${i}`}>
                                    <TableCell className="font-medium">{r.event_label}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-xs">{sourceLabel(r.source_type)}</Badge></TableCell>
                                    <TableCell className="text-right">
                                      <div className="font-bold text-primary">+{Number(r.total_received).toLocaleString()}</div>
                                      <div className="text-xs text-muted-foreground">~{formatPrice(Number(r.total_received))}</div>
                                    </TableCell>
                                    <TableCell className="text-right">{r.tx_count}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDt(r.last_at)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                          <div className="md:hidden space-y-3">
                            {revenuesState.paginated.map((r, i) => (
                              <Card key={`${r.source_id}-${r.source_type}-${i}`} className="bg-card border-border/60">
                                <CardContent className="p-3 space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="font-semibold flex-1 min-w-0 truncate">{r.event_label}</span>
                                    <Badge variant="outline" className="text-xs shrink-0">{sourceLabel(r.source_type)}</Badge>
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="font-bold text-primary">+{Number(r.total_received).toLocaleString()} {t("creditsUnit")}</span>
                                    <span className="text-xs text-muted-foreground">{r.tx_count} {t("txMyRevenuesCount")}</span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">{fmtDt(r.last_at)}</div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </>
                      )}
                      <PaginationBar t={t} {...revenuesState} />
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* WITHDRAWALS */}
                <TabsContent value="withdrawals">
                  <Card>
                    <CardHeader>
                      <CardTitle>{t("txWithdrawalsTitle")}</CardTitle>
                      <CardDescription>{t("txWithdrawalsDesc")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <TableToolbar t={t} {...withdrawalsState} total={withdrawalsState.filtered.length} />
                      {withdrawalsState.paginated.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">{withdrawals.length === 0 ? t("txNoWithdrawals") : t("txNoResults")}</p>
                      ) : (
                        <>
                          <div className="hidden md:block overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead><SortBtn active={withdrawalsState.sort.key === "amount"} dir={withdrawalsState.sort.dir} label={t("ecoAmount")} onClick={() => withdrawalsState.toggleSort("amount")} /></TableHead>
                                  <TableHead><SortBtn active={withdrawalsState.sort.key === "payment_method"} dir={withdrawalsState.sort.dir} label={t("ecoMethod")} onClick={() => withdrawalsState.toggleSort("payment_method")} /></TableHead>
                                  <TableHead><SortBtn active={withdrawalsState.sort.key === "status"} dir={withdrawalsState.sort.dir} label={t("ecoStatus")} onClick={() => withdrawalsState.toggleSort("status")} /></TableHead>
                                  <TableHead><SortBtn active={withdrawalsState.sort.key === "created_at"} dir={withdrawalsState.sort.dir} label={t("ecoDate")} onClick={() => withdrawalsState.toggleSort("created_at")} /></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {withdrawalsState.paginated.map((w) => (
                                  <TableRow key={w.id}>
                                    <TableCell className="font-bold">${Number(w.amount).toFixed(2)}</TableCell>
                                    <TableCell><Badge variant="outline">{w.payment_method || "—"}</Badge></TableCell>
                                    <TableCell>{statusBadge(w.status)}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDt(w.created_at)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                          <div className="md:hidden space-y-3">
                            {withdrawalsState.paginated.map((w) => (
                              <Card key={w.id} className="bg-card border-border/60">
                                <CardContent className="p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold">${Number(w.amount).toFixed(2)}</span>
                                    {statusBadge(w.status)}
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <Badge variant="outline" className="text-xs">{w.payment_method || "—"}</Badge>
                                    <span className="text-xs text-muted-foreground">{fmtDt(w.created_at)}</span>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </>
                      )}
                      <PaginationBar t={t} {...withdrawalsState} />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </main>
      <ProfileFooter />
    </div>
  );
};

export default Transactions;
