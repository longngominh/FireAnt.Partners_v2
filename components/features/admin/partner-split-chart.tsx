"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatShortVND } from "@/lib/utils/currency";

export type SplitPoint = {
  /** Nhãn trục, vd "T10". */
  label: string;
  /** Tên phụ lục áp dụng trong tháng, hiện dưới nhãn tháng. */
  policy: string;
  title: string;
  direct: number;
  staff: number;
};

const DIRECT_FILL = "var(--primary)";
const STAFF_FILL = "color-mix(in oklab, var(--primary) 42%, var(--card))";

type TooltipProps = { active?: boolean; payload?: Array<{ payload: SplitPoint }> };

function SplitTooltip({ active, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="flex min-w-48 flex-col gap-1 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <span className="font-semibold">
        {point.title} · phụ lục {point.policy}
      </span>
      {[
        ["Từ nhân viên", point.staff, STAFF_FILL],
        ["Bán trực tiếp", point.direct, DIRECT_FILL],
      ].map(([label, value, fill]) => (
        <span key={label as string} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-[2px]" style={{ background: fill as string }} />
            {label}
          </span>
          <span className="num">{formatShortVND(value as number)}</span>
        </span>
      ))}
      <span className="flex justify-between gap-4 border-t pt-1 font-semibold">
        <span>Tính thù lao</span>
        <span className="num">{formatShortVND(point.direct + point.staff)}</span>
      </span>
    </div>
  );
}

function MonthTick({ x, y, payload, data }: { x?: number; y?: number; payload?: { value: string; index: number }; data: SplitPoint[] }) {
  const point = payload ? data[payload.index] : undefined;
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text dy={12} textAnchor="middle" fontSize={12} fill="var(--muted-foreground)">
        {payload?.value}
      </text>
      {point ? (
        <text dy={27} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)">
          {point.policy}
        </text>
      ) : null}
    </g>
  );
}

/** Doanh thu tính thù lao 6 tháng của một đối tác: bán trực tiếp và từ nhân viên, kèm phụ lục từng tháng. */
export function PartnerSplitChart({ data, height = 240 }: { data: SplitPoint[]; height?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {[
          ["Bán trực tiếp", DIRECT_FILL],
          ["Từ nhân viên", STAFF_FILL],
        ].map(([label, fill]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: fill }} />
            {label}
          </span>
        ))}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height }}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              height={40}
              interval={0}
              tick={<MonthTick data={data} />}
            />
            <YAxis
              tickFormatter={(v: number) => formatShortVND(v)}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={70}
              stroke="var(--muted-foreground)"
            />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.7 }} content={<SplitTooltip />} />
            <Bar dataKey="direct" stackId="split" fill={DIRECT_FILL} stroke="var(--card)" strokeWidth={2} barSize={26} isAnimationActive={false} />
            <Bar
              dataKey="staff"
              stackId="split"
              fill={STAFF_FILL}
              stroke="var(--card)"
              strokeWidth={2}
              barSize={26}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
