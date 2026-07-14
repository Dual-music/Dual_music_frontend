/**
 * Composant générique tableau admin : pagination (`usePagination`), tri, filtres, actions ligne.
 * Réutilisé par tous les managers admin.
 */
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface AdminTableProps<T extends Record<string, any>> {
  data: T[];
  columns: Column<T>[];
  searchKeys?: string[];
  pageSize?: number;
  emptyMessage?: string;
}

type SortDir = "asc" | "desc" | null;

export function AdminTable<T extends Record<string, any>>({
  data,
  columns,
  searchKeys = [],
  pageSize = 10,
  emptyMessage,
}: AdminTableProps<T>) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(pageSize);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      searchKeys.some((key) => {
        const val = row[key];
        return val != null && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, search, searchKeys]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = String(av).localeCompare(String(bv), "fr", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const paginated = sorted.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const handleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortKey(null);
      setSortDir(null);
    }
    setPage(1);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-40" />;
    if (sortDir === "asc") return <ChevronUp className="w-3 h-3 ml-1 text-primary" />;
    return <ChevronDown className="w-3 h-3 ml-1 text-primary" />;
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center justify-between">
        {searchKeys.length > 0 && (
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("adminSearch")}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 h-10"
            />
          </div>
        )}
        <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground sm:ml-auto">
          <span className="whitespace-nowrap">{t("adminRows")}</span>
          <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-16 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table — horizontal scroll on mobile, sticky header */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={`whitespace-nowrap ${col.sortable ? "cursor-pointer select-none hover:bg-muted/60 transition-colors" : ""}`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center text-xs sm:text-sm">
                      {col.label}
                      {col.sortable && <SortIcon col={col.key} />}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-10">
                    {emptyMessage ?? t("adminEmpty")}
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((row, i) => (
                  <TableRow key={row.id ?? i} className="hover:bg-muted/20 transition-colors">
                    {columns.map((col) => (
                      <TableCell key={col.key} className="text-xs sm:text-sm py-2 sm:py-4">
                        {col.render ? col.render(row) : row[col.key] ?? "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination — compact on mobile */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs sm:text-sm text-muted-foreground">
        <span className="whitespace-nowrap">
          {sorted.length === 0 ? "0" : `${(page - 1) * rowsPerPage + 1}–${Math.min(page * rowsPerPage, sorted.length)}`} / {sorted.length}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="h-9 w-9 p-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {/* Mobile: show only current/total. Desktop: show page numbers */}
          <span className="sm:hidden px-3 py-1 rounded-md bg-muted text-foreground font-medium">
            {page} / {totalPages}
          </span>
          <div className="hidden sm:flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "..." ? (
                  <span key={`ellipsis-${i}`} className="px-2">…</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(p as number)}
                    className="h-9 w-9 p-0"
                  >
                    {p}
                  </Button>
                )
              )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="h-9 w-9 p-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
