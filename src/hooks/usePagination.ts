/**
 * Hook pagination générique : page courante, itemsPerPage, total, slice array. Utilisé par
 * `AdminTable`.
 */
import { useMemo, useState, useEffect } from "react";

export function usePagination<T>(items: T[], pageSize = 9) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    if (page > pageCount) setPage(1);
  }, [pageCount, page]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { page, setPage, pageCount, paginated };
}
