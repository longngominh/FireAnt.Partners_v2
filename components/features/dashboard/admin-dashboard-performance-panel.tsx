"use client";

import { useState, useTransition } from "react";
import {
  TicketIcon,
  TrendingUpIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { HeroTile, KpiTile } from "@/components/features/dashboard/kpi-tile";
import { TimeRangeTabs } from "@/components/features/dashboard/time-range-tabs";
import { TrendChart } from "@/components/features/dashboard/trend-chart";
import type { AdminDashboardPerformance } from "@/lib/data/partners";
import type { TrendRange } from "@/lib/data/trend";
import { formatNumber, formatVND } from "@/lib/utils/currency";

type Props = {
  initialRange: TrendRange;
  initialData: AdminDashboardPerformance;
  basePath: string;
};

function toTrendData(data: AdminDashboardPerformance) {
  return data.monthlyTrend.map((p) => ({
    period: p.month,
    revenue: p.revenue,
    commission: p.commission,
  }));
}

export function AdminDashboardPerformancePanel({
  initialRange,
  initialData,
  basePath,
}: Props) {
  const pathname = usePathname();
  const [range, setRange] = useState<TrendRange>(initialRange);
  const [data, setData] = useState<AdminDashboardPerformance>(initialData);
  const [isPending, startTransition] = useTransition();

  function syncUrl(nextRange: TrendRange) {
    const sp = new URLSearchParams(window.location.search);
    if (nextRange === "1M") sp.delete("range");
    else sp.set("range", nextRange);

    const query = sp.toString();
    window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}`);
  }

  function handleRangeChange(nextRange: TrendRange) {
    if (nextRange === range) return;

    const previousRange = range;
    setRange(nextRange);
    syncUrl(nextRange);

    startTransition(async () => {
      const params = new URLSearchParams({ range: nextRange });
      const res = await fetch(`/api/admin/dashboard?${params}`, {
        headers: { Accept: "application/json" },
      });

      if (res.ok) {
        const result: AdminDashboardPerformance = await res.json();
        setData(result);
      } else {
        setRange(previousRange);
        syncUrl(previousRange);
      }
    });
  }

  const contentClassName = isPending
    ? "flex flex-col gap-6 opacity-60 transition-opacity"
    : "flex flex-col gap-6 transition-opacity";

  return (
    <>
      <TimeRangeTabs
        activeRange={range}
        basePath={basePath}
        isPending={isPending}
        onRangeChange={handleRangeChange}
      />

      <div className={contentClassName}>
        <div className="grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-4">
          <HeroTile
            label="Tổng hoa hồng đối tác"
            value={formatVND(data.totalCommission)}
            hint={`Từ ${formatVND(data.totalRevenue)} doanh thu`}
            icon={<TrendingUpIcon className="size-5" />}
            className="col-span-2 row-span-2 lg:col-span-2"
          />
          <KpiTile
            label="Tổng doanh thu"
            value={formatVND(data.totalRevenue)}
            accent="info"
            icon={<WalletIcon className="size-4" />}
          />
          <KpiTile
            label="Tổng khách hàng"
            value={formatNumber(data.customerCount)}
            icon={<UsersIcon className="size-4" />}
          />
          <KpiTile
            label="Tổng coupon"
            value={formatNumber(data.couponCount)}
            icon={<TicketIcon className="size-4" />}
          />
          <KpiTile
            label="Đối tác hoạt động"
            value={String(data.activePartnerCount)}
          />
        </div>

        <TrendChart
          initialData={toTrendData(data)}
          partnerId={null}
          initialRange={range}
          showRangeControls={false}
        />
      </div>
    </>
  );
}
