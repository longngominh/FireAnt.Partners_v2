import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
};

function buildHref(
  basePath: string,
  page: number,
  searchParams?: Record<string, string | undefined>,
) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (v) sp.set(k, v);
  }
  if (page > 1) sp.set("page", String(page));
  const query = sp.toString();
  return `${basePath}${query ? `?${query}` : ""}`;
}

export function Pagination({ page, pageSize, total, basePath, searchParams }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>
        {start}–{end} / {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={page <= 1}
          className="h-8 w-8 p-0"
        >
          <Link href={buildHref(basePath, prev, searchParams)} aria-label="Trang trước">
            <ChevronLeftIcon className="size-4" />
          </Link>
        </Button>
        <span className="min-w-[3rem] text-center font-medium text-foreground">
          {page} / {totalPages}
        </span>
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          className="h-8 w-8 p-0"
        >
          <Link href={buildHref(basePath, next, searchParams)} aria-label="Trang sau">
            <ChevronRightIcon className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
