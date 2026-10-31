"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";
import { Panel } from "@/components/shared/panel";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercent, formatShortVND, formatVND } from "@/lib/utils/currency";
import { formatMonthLabel, formatMonthShort, parseMonthKey, shiftMonth, type MonthKey } from "@/lib/utils/month";

export type HistorySeries = {
  key: string;
  label: string;
  unit: "vnd" | "count";
  /** Cùng thứ tự và độ dài với `months`. */
  values: number[];
  /** Tăng là tốt (so sánh tô xanh/đỏ). false: chỉ báo hướng. Mặc định true. */
  upIsGood?: boolean;
};

type Range = "12" | "24" | "all";

const RANGES: ReadonlyArray<readonly [Range, string]> = [
  ["12", "12 tháng"],
  ["24", "24 tháng"],
  ["all", "Toàn bộ"],
];

const SELECTED_FILL = "var(--primary)";
const OTHER_FILL = "color-mix(in oklab, var(--muted-foreground) 45%, var(--card))";

type Point = { month: MonthKey; value: number; selected: boolean; open: boolean; href: string | null };
type Unit = HistorySeries["unit"];

function formatValue(value: number, unit: Unit): string {
  return unit === "vnd" ? formatVND(Math.round(value)) : formatNumber(value);
}

function formatAverage(value: number, unit: Unit): string {
  return unit === "vnd" ? formatVND(Math.round(value)) : value.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}

/** Nhãn trục gọn: "300 tr", "1,5 tỷ". */
function formatTick(value: number, unit: Unit): string {
  if (unit === "count") return formatNumber(value);
  return value === 0 ? "0" : formatShortVND(value).replace(",0 ", " ").replace(",00 ", " ");
}

function Change({ change, upIsGood }: { change: number; upIsGood: boolean }) {
  const up = change > 0;
  return (
    <span
      className={cn(
        "font-semibold",
        change === 0 || !upIsGood ? "text-foreground" : up ? "text-success" : "text-destructive",
      )}
    >
      {up ? "+" : change < 0 ? "−" : ""}
      {formatPercent(Math.abs(change))}
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tracking-tight">{value}</dd>
      {sub ? <dd className="text-xs text-muted-foreground">{sub}</dd> : null}
    </div>
  );
}

type TooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
  unit: Unit;
  average: number;
  values: number[];
};

function HistoryTooltip({ active, payload, unit, average, values }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const rank = 1 + values.filter((v) => v > point.value).length;
  return (
    <div className="flex min-w-44 flex-col gap-0.5 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <span className="text-muted-foreground">
        {formatMonthLabel(point.month)}
        {point.open ? " · tạm tính" : ""}
      </span>
      <span className="num text-sm font-semibold">{formatValue(point.value, unit)}</span>
      <span className="text-muted-foreground">
        {average > 0 && !point.open
          ? `${point.value >= average ? "+" : "−"}${formatPercent(Math.abs(point.value / average - 1))} so với TB · `
          : ""}
        hạng {rank}/{values.length}
      </span>
      {point.href ? <span className="text-muted-foreground">Bấm cột để mở tháng này</span> : null}
    </div>
  );
}

/**
 * Lịch sử theo tháng của một nhóm chỉ số: chọn chỉ số và khoảng (12, 24 tháng, toàn bộ), xem tháng
 * đang xem so với trung bình, tháng cao nhất, hạng và cùng kỳ năm trước. Tháng đang mở chưa đủ
 * số liệu nên không tính vào trung bình. Có bảng số liệu thay cho biểu đồ.
 */
export function HistoryChart({
  months,
  series,
  selected,
  openMonth,
  hrefs,
  height = 260,
}: {
  /** Tăng dần. */
  months: MonthKey[];
  series: HistorySeries[];
  /** Tháng tô màu chính — tháng của số trên các thẻ. */
  selected: MonthKey;
  /** Tháng hiện tại, số còn tạm tính. */
  openMonth: MonthKey;
  /** Link mở từng tháng, cùng thứ tự với `months`. */
  hrefs?: string[];
  height?: number;
}) {
  const router = useRouter();
  const [seriesKey, setSeriesKey] = useState(series[0]?.key);
  const [range, setRange] = useState<Range>("all");
  const [asTable, setAsTable] = useState(false);
  const active = series.find((s) => s.key === seriesKey) ?? series[0];
  if (!active || months.length === 0) return null;

  const { unit } = active;
  const upIsGood = active.upIsGood ?? true;
  const start = range === "all" ? 0 : Math.max(0, months.length - Number(range));
  const points: Point[] = months.slice(start).map((month, i) => ({
    month,
    value: active.values[start + i] ?? 0,
    selected: month === selected,
    open: month === openMonth,
    href: hrefs?.[start + i] ?? null,
  }));
  const values = points.map((p) => p.value);
  const closed = points.filter((p) => !p.open);
  const average = closed.length > 0 ? closed.reduce((s, p) => s + p.value, 0) / closed.length : 0;
  const best = points.reduce<Point | null>((top, p) => (!top || p.value > top.value ? p : top), null);

  const selectedIndex = months.indexOf(selected);
  const selectedValue = selectedIndex >= 0 ? (active.values[selectedIndex] ?? 0) : null;
  const selectedOpen = selected === openMonth;
  const inRange = points.some((p) => p.selected);
  const rank = selectedValue !== null && inRange ? 1 + values.filter((v) => v > selectedValue).length : null;
  const lastYear = shiftMonth(selected, -12);
  const lastYearIndex = months.indexOf(lastYear);
  const lastYearValue = lastYearIndex >= 0 ? (active.values[lastYearIndex] ?? 0) : null;

  const ticks =
    range === "all"
      ? points.filter((p) => p.month.endsWith("-01")).map((p) => p.month)
      : range === "24"
        ? points.filter((p) => (parseMonthKey(p.month).month - 1) % 3 === 0).map((p) => p.month)
        : points.map((p) => p.month);
  const tickLabel = (month: MonthKey) => {
    const { month: m, year } = parseMonthKey(month);
    if (range === "all") return String(year);
    return m === 1 || month === points[0]?.month ? `T${m}/${String(year).slice(2)}` : `T${m}`;
  };
  const empty = values.every((v) => v === 0);

  return (
    <Panel
      title="Lịch sử theo tháng"
      description={`${formatMonthShort(months[0])} – ${formatMonthShort(months[months.length - 1])}${
        hrefs ? " · bấm cột để mở tháng đó" : ""
      }`}
      actions={
        <>
          <div role="group" aria-label="Khoảng thời gian" className="inline-flex rounded-lg border p-0.5">
            {RANGES.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={range === key}
                onClick={() => setRange(key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                  range === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
            className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {asTable ? "Biểu đồ" : "Bảng số liệu"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="group" aria-label="Chỉ số" className="flex flex-wrap gap-1.5">
          {series.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={s.key === active.key}
              onClick={() => setSeriesKey(s.key)}
              className={cn(
                "inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-semibold transition-colors",
                s.key === active.key ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
          <Stat
            label={`${formatMonthLabel(selected)}${selectedOpen ? " · tạm tính" : ""}`}
            value={selectedValue !== null ? formatValue(selectedValue, unit) : "—"}
            sub={rank !== null ? `Hạng ${rank}/${points.length} tháng` : "Ngoài khoảng đang xem"}
          />
          <Stat
            label={range === "all" ? "Trung bình mỗi tháng" : `Trung bình ${range} tháng`}
            value={formatAverage(average, unit)}
            sub={
              selectedValue !== null && average > 0 && !selectedOpen ? (
                <>
                  <Change change={selectedValue / average - 1} upIsGood={upIsGood} /> tháng đang xem so với TB
                </>
              ) : selectedOpen ? (
                "Không tính tháng đang mở"
              ) : null
            }
          />
          <Stat
            label="Cao nhất"
            value={best ? formatValue(best.value, unit) : "—"}
            sub={best && best.value > 0 ? formatMonthLabel(best.month) : null}
          />
          <Stat
            label={`Cùng kỳ năm trước · ${formatMonthShort(lastYear)}`}
            value={lastYearValue !== null ? formatValue(lastYearValue, unit) : "—"}
            sub={
              lastYearValue === null ? (
                "Chưa có dữ liệu"
              ) : selectedValue !== null && lastYearValue > 0 && !selectedOpen ? (
                <>
                  <Change change={selectedValue / lastYearValue - 1} upIsGood={upIsGood} /> tháng đang xem so với
                  cùng kỳ
                </>
              ) : null
            }
          />
        </dl>

        {asTable ? (
          <div className="overflow-auto rounded-xl border" style={{ maxHeight: height + 40 }}>
            <table className="w-full min-w-[520px] text-sm">
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                <tr className="whitespace-nowrap">
                  <th className="px-4 py-2 text-left font-semibold">Tháng</th>
                  <th className="px-3 py-2 text-right font-semibold">{active.label}</th>
                  <th className="px-3 py-2 text-right font-semibold">So với tháng trước</th>
                  <th className="px-4 py-2 text-right font-semibold">So với cùng kỳ</th>
                </tr>
              </thead>
              <tbody>
                {[...points].reverse().map((p) => {
                  const i = months.indexOf(p.month);
                  // Tháng đang mở chưa đủ số liệu: không so %.
                  const prev = i > 0 && !p.open ? active.values[i - 1] : undefined;
                  const year = i >= 12 && !p.open ? active.values[i - 12] : undefined;
                  return (
                    <tr key={p.month} className={cn("border-t", p.selected && "bg-primary/5")}>
                      <td className="px-4 py-2 font-medium">
                        {p.href ? (
                          <Link href={p.href} className="hover:text-primary hover:underline">
                            {formatMonthShort(p.month)}
                          </Link>
                        ) : (
                          formatMonthShort(p.month)
                        )}
                        {p.open ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">tạm tính</span> : null}
                      </td>
                      <td className="num px-3 py-2 text-right font-semibold">{formatValue(p.value, unit)}</td>
                      <td className="num px-3 py-2 text-right">
                        {prev ? <Change change={p.value / prev - 1} upIsGood={upIsGood} /> : "—"}
                      </td>
                      <td className="num px-4 py-2 text-right">
                        {year ? <Change change={p.value / year - 1} upIsGood={upIsGood} /> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : empty ? (
          <p className="flex items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground" style={{ height }}>
            Chưa phát sinh trong khoảng này.
          </p>
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height }}>
              <BarChart data={points} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
                <CartesianGrid vertical={range === "all"} stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  ticks={ticks}
                  interval={0}
                  tickFormatter={tickLabel}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  fontSize={12}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  tickFormatter={(v: number) => formatTick(v, unit)}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={64}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                  content={<HistoryTooltip unit={unit} average={average} values={values} />}
                />
                {average > 0 ? (
                  <ReferenceLine
                    y={average}
                    stroke="var(--foreground)"
                    strokeOpacity={0.45}
                    label={{
                      value: `TB ${formatTick(average, unit)}`,
                      position: "insideTopRight",
                      fill: "var(--muted-foreground)",
                      fontSize: 11,
                    }}
                  />
                ) : null}
                <Bar
                  dataKey="value"
                  maxBarSize={24}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                  className={hrefs ? "cursor-pointer" : undefined}
                  shape={(props: BarShapeProps) => (
                    <Rectangle {...props} fill={(props.payload as Point | undefined)?.selected ? SELECTED_FILL : OTHER_FILL} />
                  )}
                  onClick={(item) => {
                    const href = (item.payload as Point | undefined)?.href;
                    if (href) router.push(href);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Chỗ giữ cùng chiều cao trong lúc lịch sử đang tải. */
export function HistoryChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <Panel title="Lịch sử theo tháng" description="Đang tải số liệu các tháng…">
      <div aria-hidden className="flex flex-col gap-4">
        <span className="h-8 w-80 max-w-full animate-pulse rounded-full bg-muted" />
        <span className="h-14 animate-pulse rounded-lg bg-muted/70" />
        <span className="animate-pulse rounded-xl bg-muted/50" style={{ height }} />
      </div>
    </Panel>
  );
}
