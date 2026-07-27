"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  currentMonthKey,
  formatMonthRangeLabel,
  isMonthKey,
  shiftMonth,
  type MonthKey,
} from "@/lib/utils/month";

type Props = {
  month: MonthKey;
  basePath: string;
  /** Các filter khác cần giữ nguyên khi đổi tháng. */
  searchParams?: Record<string, string | undefined>;
};

export function MonthPicker({ month, basePath, searchParams }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const maxMonth = currentMonthKey();

  function go(next: MonthKey) {
    if (next > maxMonth) return;
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (value && key !== "month" && key !== "page") sp.set(key, value);
    }
    sp.set("month", next);
    startTransition(() => router.push(`${basePath}?${sp.toString()}`));
  }

  const isAtCurrentMonth = month >= maxMonth;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={isPending}
          onClick={() => go(shiftMonth(month, -1))}
          aria-label="Tháng trước"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <label className="relative flex items-center">
          <CalendarIcon className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
          <input
            type="month"
            value={month}
            max={maxMonth}
            disabled={isPending}
            onChange={(e) => {
              if (isMonthKey(e.target.value)) go(e.target.value);
            }}
            aria-label="Chọn tháng"
            className="h-8 w-[9.5rem] rounded-md border-0 bg-transparent pl-7 pr-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={isPending || isAtCurrentMonth}
          onClick={() => go(shiftMonth(month, 1))}
          aria-label="Tháng sau"
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>

      <span className="text-xs text-muted-foreground">{formatMonthRangeLabel(month)}</span>

      {!isAtCurrentMonth ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => go(maxMonth)}
        >
          Tháng này
        </Button>
      ) : null}
    </div>
  );
}
