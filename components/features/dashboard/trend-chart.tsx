"use client";

import { useState, useTransition } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatVNDCompact } from "@/lib/utils/currency";
import type { TrendRange, TrendPoint } from "@/lib/data/trend";

const RANGES: TrendRange[] = ["1W", "1M", "3M", "6M", "1Y", "2Y", "ALL"];

type Props = {
  initialData: TrendPoint[];
  partnerId: string | number | null;
  partnerIds?: number[];
};

export function TrendChart({ initialData, partnerId, partnerIds }: Props) {
  const [range, setRange] = useState<TrendRange>("1M");
  const [data, setData] = useState<TrendPoint[]>(initialData);
  const [isPending, startTransition] = useTransition();

  function handleRangeChange(newRange: TrendRange) {
    if (newRange === range) return;
    setRange(newRange);
    startTransition(async () => {
      const params = new URLSearchParams({ range: newRange });
      if (partnerIds && partnerIds.length > 0) {
        params.set("partnerIds", partnerIds.join(","));
      } else if (partnerId !== null) {
        params.set("partnerId", String(partnerId));
      }
      const res = await fetch(`/api/trend?${params}`);
      if (res.ok) {
        const result: TrendPoint[] = await res.json();
        setData(result);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Doanh thu &amp; Hoa hồng theo tháng</CardTitle>
          <CardDescription>
            {range === "ALL" ? "Toàn bộ lịch sử" : `${range} gần nhất`}
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border bg-muted p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => handleRangeChange(r)}
              disabled={isPending}
              className={[
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                r === range
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground disabled:opacity-50",
              ].join(" ")}
            >
              {r}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="h-64 w-full">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {isPending ? "Đang tải..." : "Chưa có dữ liệu"}
          </div>
        ) : (
          <div className={isPending ? "opacity-50 transition-opacity" : "transition-opacity"}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-revenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-commission" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="period"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  tickFormatter={(v) => formatVNDCompact(v)}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                  formatter={(value, name) => [
                    formatVNDCompact(Number(value ?? 0)),
                    name === "revenue" ? "Doanh thu" : "Hoa hồng",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  fill="url(#grad-revenue)"
                />
                <Area
                  type="monotone"
                  dataKey="commission"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  fill="url(#grad-commission)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
