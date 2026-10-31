"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CONTRACT_TIER_LABELS, CONTRACT_TIERS, type ContractTier } from "@/lib/commission";
import { formatShortVND } from "@/lib/utils/currency";
import { TIER_COLOR_VAR } from "./tier-ui";

export type TierStackPoint = { label: string; title: string } & Record<ContractTier, number>;

type TooltipProps = { active?: boolean; payload?: Array<{ payload: TierStackPoint }> };

function StackTooltip({ active, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const total = CONTRACT_TIERS.reduce((s, t) => s + point[t], 0);
  return (
    <div className="flex min-w-48 flex-col gap-1 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <span className="font-semibold">{point.title}</span>
      {[...CONTRACT_TIERS].reverse().map((tier) => (
        <span key={tier} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-[2px]" style={{ background: TIER_COLOR_VAR[tier] }} />
            {CONTRACT_TIER_LABELS[tier]}
          </span>
          <span className="num">{formatShortVND(point[tier])}</span>
        </span>
      ))}
      <span className="flex justify-between gap-4 border-t pt-1 font-semibold">
        <span>Tổng</span>
        <span className="num">{formatShortVND(total)}</span>
      </span>
    </div>
  );
}

/** Doanh thu tính thù lao theo tháng, tách theo phụ lục mỗi đối tác áp dụng trong tháng đó. */
export function TierStackChart({ data, height = 260 }: { data: TierStackPoint[]; height?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {CONTRACT_TIERS.map((tier) => (
          <span key={tier} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: TIER_COLOR_VAR[tier] }} />
            {CONTRACT_TIER_LABELS[tier]}
          </span>
        ))}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height }}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} fontSize={12} stroke="var(--muted-foreground)" />
            <YAxis
              tickFormatter={(v: number) => formatShortVND(v)}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={70}
              stroke="var(--muted-foreground)"
            />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.7 }} content={<StackTooltip />} />
            {CONTRACT_TIERS.map((tier, index) => (
              <Bar
                key={tier}
                dataKey={tier}
                stackId="tiers"
                fill={TIER_COLOR_VAR[tier]}
                stroke="var(--card)"
                strokeWidth={2}
                barSize={26}
                radius={index === CONTRACT_TIERS.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
