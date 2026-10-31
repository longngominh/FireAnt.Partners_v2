import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercent, formatVND } from "@/lib/utils/currency";
import { formatMonthShort, parseMonthKey, shiftMonth, type MonthKey } from "@/lib/utils/month";

/**
 * Dòng so với tháng trước ở đáy thẻ KPI. Tháng đang mở mới có một phần số liệu, so % với cả tháng
 * trước dễ đọc nhầm là giảm, nên chỉ ghi số của tháng trước.
 */
export function KpiDelta({
  month,
  value,
  previous,
  open,
  unit = "vnd",
  upIsGood = true,
}: {
  month: MonthKey;
  value: number;
  previous: number;
  open: boolean;
  unit?: "vnd" | "count";
  /** Tăng là tốt (xanh), giảm là xấu (đỏ). false: chỉ báo hướng, không tô màu. */
  upIsGood?: boolean;
}) {
  const prevMonth = shiftMonth(month, -1);
  const label =
    parseMonthKey(prevMonth).year === parseMonthKey(month).year
      ? `T${parseMonthKey(prevMonth).month}`
      : formatMonthShort(prevMonth);
  const format = unit === "vnd" ? formatVND : formatNumber;

  if (open) {
    return (
      <span className="text-xs text-muted-foreground">
        Tạm tính · {label}: <span className="num">{format(previous)}</span>
      </span>
    );
  }
  if (previous === 0 || value === previous) {
    return (
      <span className="text-xs text-muted-foreground">
        {value === previous ? `Không đổi so với ${label}` : `${label} chưa phát sinh`}
      </span>
    );
  }
  const change = (value - previous) / previous;
  const up = change > 0;
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1 text-xs font-semibold",
        !upIsGood ? "text-foreground" : up ? "text-success" : "text-destructive",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {up ? "+" : "−"}
      {formatPercent(Math.abs(change))}
      <span className="font-normal text-muted-foreground">
        so với {label} ({format(previous)})
      </span>
    </span>
  );
}

export function KpiDeltaSkeleton() {
  return <span aria-hidden className="block h-4 w-36 animate-pulse rounded bg-muted" />;
}
