"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TrendRange } from "@/lib/data/trend";

const RANGES: TrendRange[] = ["1W", "1M", "3M", "6M", "1Y", "2Y", "ALL"];
const DEFAULT_RANGE: TrendRange = "1M";

type Props = {
  activeRange: TrendRange;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
  isPending?: boolean;
  onRangeChange?: (range: TrendRange) => void;
};

function buildHref(
  basePath: string,
  range: TrendRange,
  searchParams?: Record<string, string | undefined>,
) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value && key !== "range" && key !== "page") sp.set(key, value);
  }
  if (range !== DEFAULT_RANGE) sp.set("range", range);
  const query = sp.toString();
  return `${basePath}${query ? `?${query}` : ""}`;
}

export function TimeRangeTabs({
  activeRange,
  basePath,
  searchParams,
  isPending = false,
  onRangeChange,
}: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-medium">Khung thời gian</div>
        <p className="text-xs text-muted-foreground">
          Áp dụng cho các chỉ số tổng quan và biểu đồ bên dưới.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 rounded-lg border bg-muted p-0.5">
        {RANGES.map((range) => (
          onRangeChange ? (
            <button
              key={range}
              type="button"
              disabled={isPending}
              onClick={() => onRangeChange(range)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                range === activeRange
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground disabled:opacity-50",
              )}
            >
              {range}
            </button>
          ) : (
            <Link
              key={range}
              href={buildHref(basePath, range, searchParams)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                range === activeRange
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {range}
            </Link>
          )
        ))}
      </div>
    </div>
  );
}
