"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_LABELS: Record<string, string> = {
  PAID: "Đã thanh toán",
  PENDING: "Chờ thanh toán",
  EXPIRED: "Hết hạn",
  CANCELLED: "Đã huỷ",
};

const STATUS_COLORS: Record<string, string> = {
  PAID: "var(--success)",
  PENDING: "var(--warning)",
  EXPIRED: "var(--muted-foreground)",
  CANCELLED: "var(--destructive)",
};

const CHART_SIZE = 176;
const INNER_R = 50;
const OUTER_R = 80;

export function StatusChart({
  data,
}: {
  data: Array<{ status: string; count: number }>;
}) {
  const chartData = data.filter((d) => d.count > 0);
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trạng thái link thanh toán</CardTitle>
        <CardDescription>Phân bổ theo trạng thái thanh toán</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4">
          <PieChart width={CHART_SIZE} height={CHART_SIZE}>
            <Pie
              data={chartData}
              dataKey="count"
              nameKey="status"
              cx={CHART_SIZE / 2}
              cy={CHART_SIZE / 2}
              innerRadius={INNER_R}
              outerRadius={OUTER_R}
              paddingAngle={2}
              strokeWidth={1}
              stroke="var(--background)"
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.status}
                  fill={STATUS_COLORS[entry.status]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, name) => [
                Number(value ?? 0),
                STATUS_LABELS[String(name)] ?? String(name),
              ]}
            />
          </PieChart>
          <div className="flex w-full flex-col gap-2 text-xs">
            {data.map((d) => (
              <div key={d.status} className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: STATUS_COLORS[d.status] }}
                />
                <span className="min-w-24 text-muted-foreground">
                  {STATUS_LABELS[d.status]}
                </span>
                <span className="num font-mono font-semibold">{d.count}</span>
                <span className="text-muted-foreground">
                  ({total > 0 ? ((d.count / total) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
