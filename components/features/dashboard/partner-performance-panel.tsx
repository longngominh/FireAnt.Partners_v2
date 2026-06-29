"use client";

import { useState, useTransition } from "react";
import {
  ClockIcon,
  TargetIcon,
  TicketIcon,
  TrendingUpIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { HeroTile, KpiTile } from "@/components/features/dashboard/kpi-tile";
import { TimeRangeTabs } from "@/components/features/dashboard/time-range-tabs";
import { TrendChart } from "@/components/features/dashboard/trend-chart";
import type { PartnerPerformance } from "@/lib/data/partners";
import type { TrendRange } from "@/lib/data/trend";
import { formatNumber, formatVND } from "@/lib/utils/currency";

type PanelData = Pick<
  PartnerPerformance,
  | "totalRevenue"
  | "totalCommission"
  | "couponCount"
  | "paidCount"
  | "pendingCount"
  | "customerCount"
  | "conversionRate"
  | "monthlyRemuneration"
  | "monthlyTrend"
>;

type Props = {
  partnerId: number;
  initialRange: TrendRange;
  initialData: PanelData;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
};

function toTrendData(data: PanelData) {
  return data.monthlyTrend.map((p) => ({
    period: p.month,
    revenue: p.revenue,
    commission: p.commission,
  }));
}

export function PartnerPerformancePanel({
  partnerId,
  initialRange,
  initialData,
  basePath,
  searchParams,
}: Props) {
  const pathname = usePathname();
  const [range, setRange] = useState<TrendRange>(initialRange);
  const [data, setData] = useState<PanelData>(initialData);
  const [isPending, startTransition] = useTransition();

  function syncUrl(nextRange: TrendRange) {
    const sp = new URLSearchParams(window.location.search);
    sp.delete("page");
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
      const res = await fetch(`/api/partners/${partnerId}?${params}`, {
        headers: { Accept: "application/json" },
      });

      if (res.ok) {
        const result: PartnerPerformance = await res.json();
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
        searchParams={searchParams}
        isPending={isPending}
        onRangeChange={handleRangeChange}
      />

      <div className={contentClassName}>
        <div className="grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-4">
          <HeroTile
            label="Hoa hồng theo khoảng lọc"
            value={formatVND(data.totalCommission)}
            hint={`${data.paidCount}/${data.couponCount} coupon thanh toán`}
            icon={<TrendingUpIcon className="size-5" />}
            className="col-span-2 row-span-2 lg:col-span-2"
          />
          <KpiTile
            label="Doanh thu"
            value={formatVND(data.totalRevenue)}
            accent="info"
            icon={<WalletIcon className="size-4" />}
          />
          <KpiTile
            label="Thù lao tháng này"
            value={formatVND(data.monthlyRemuneration.total)}
            accent="warning"
            icon={<ClockIcon className="size-4" />}
          />
          <KpiTile
            label="Tổng link đã tạo"
            value={formatNumber(data.couponCount)}
            icon={<TicketIcon className="size-4" />}
          />
          <KpiTile
            label="Khách hàng"
            value={formatNumber(data.customerCount)}
            icon={<UsersIcon className="size-4" />}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <TrendChart
            initialData={toTrendData(data)}
            partnerId={partnerId}
            initialRange={range}
            showRangeControls={false}
          />
          <KpiTile
            label="Tỷ lệ thanh toán"
            value={`${data.conversionRate.toFixed(1)}%`}
            hint="Coupon đã thanh toán / coupon đã tạo"
            accent="brand"
            icon={<TargetIcon className="size-4" />}
          />
        </div>
      </div>
    </>
  );
}
