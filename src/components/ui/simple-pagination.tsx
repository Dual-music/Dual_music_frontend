import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SimplePaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function SimplePagination({ page, pageCount, onPageChange, className }: SimplePaginationProps) {
  if (pageCount <= 1) return null;
  const pages: number[] = [];
  const max = 5;
  let start = Math.max(1, page - Math.floor(max / 2));
  const end = Math.min(pageCount, start + max - 1);
  if (end - start + 1 < max) start = Math.max(1, end - max + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className={`flex items-center justify-center gap-1 mt-8 flex-wrap ${className || ""}`}>
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      {start > 1 && (
        <>
          <Button variant="ghost" size="sm" onClick={() => onPageChange(1)}>1</Button>
          {start > 2 && <span className="px-1 text-muted-foreground">…</span>}
        </>
      )}
      {pages.map((p) => (
        <Button
          key={p}
          variant={p === page ? "default" : "ghost"}
          size="sm"
          onClick={() => onPageChange(p)}
          className={p === page ? "bg-gradient-primary" : ""}
        >
          {p}
        </Button>
      ))}
      {end < pageCount && (
        <>
          {end < pageCount - 1 && <span className="px-1 text-muted-foreground">…</span>}
          <Button variant="ghost" size="sm" onClick={() => onPageChange(pageCount)}>{pageCount}</Button>
        </>
      )}
      <Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
