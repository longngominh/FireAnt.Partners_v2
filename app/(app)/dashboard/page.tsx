import {
  TrendingUpIcon,
  ClockIcon,
  WalletIcon,
  TicketIcon,
  UsersIcon,
  TargetIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { HeroTile, KpiTile } from "@/components/features/dashboard/kpi-tile";
import { TrendChart } from "@/components/features/dashboard/trend-chart";
import { StatusChart } from "@/components/features/dashboard/status-chart";
import { CommissionProgress } from "@/components/features/dashboard/commission-progress";
import { getDashboardStats } from "@/lib/data/dashboard";
import { formatVND, formatNumber } from "@/lib/utils/currency";

export const metadata = { title: "Tổng quan" };

export default async function DashboardPage() {
  const session = await auth();
  const isAdmin = session?.user.role === "admin";
  const partnerId = isAdmin ? null : session?.user.partnerId ?? null;

  const stats = await getDashboardStats(partnerId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isAdmin ? "Tổng quan toàn hệ thống" : "Tổng quan hoạt động"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Theo dõi hoa hồng, doanh thu và hiệu suất theo thời gian thực.
        </p>
      </div>

      {/* Bento Grid */}
      <div className="grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-4">
        <HeroTile
          label="Hoa hồng tháng này"
          value={formatVND(stats.netReceived)}
          hint={`Từ ${stats.couponsPaid} coupon đã thanh toán trong tháng. Doanh số: ${formatVND(stats.totalRevenue)}.`}
          icon={<TrendingUpIcon className="size-5" />}
          className="col-span-2 row-span-2 lg:col-span-2"
        />
        <KpiTile
          label="Hoa hồng chờ (ước tính)"
          value={formatVND(stats.pendingAmount)}
          hint={`Nếu tất cả ${stats.couponsCreated - stats.allTimePaid} coupon đang chờ được thanh toán tháng này.`}
          accent="warning"
          icon={<ClockIcon className="size-4" />}
        />
        <KpiTile
          label="Doanh số tháng này"
          value={formatVND(stats.totalRevenue)}
          hint="Tổng tiền khách trả qua các link đã thanh toán trong tháng"
          accent="info"
          icon={<WalletIcon className="size-4" />}
        />
        <KpiTile
          label="Link thanh toán đã tạo (tổng)"
          value={formatNumber(stats.couponsCreated)}
          hint={`Trong đó ${stats.allTimePaid} đã thanh toán`}
          icon={<TicketIcon className="size-4" />}
        />
        {!isAdmin ? (
          <CommissionProgress monthlyRevenue={stats.totalRevenue} />
        ) : (
          <KpiTile
            label="Khách hàng tháng này"
            value={formatNumber(stats.customersServed)}
            hint="Số email khách duy nhất đã thanh toán trong tháng"
            icon={<UsersIcon className="size-4" />}
          />
        )}
      </div>

      {/* Conversion + Trend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <TrendChart
          initialData={stats.monthlySeries.map((p) => ({ period: p.month, revenue: p.revenue, commission: p.commission }))}
          partnerId={partnerId ?? null}
        />
        <div className="flex flex-col gap-4">
          {!isAdmin && (
            <KpiTile
              label="Khách hàng tháng này"
              value={formatNumber(stats.customersServed)}
              hint="Số email khách duy nhất đã thanh toán trong tháng"
              icon={<UsersIcon className="size-4" />}
            />
          )}
          <KpiTile
            label="Tỷ lệ thanh toán (tổng)"
            value={`${stats.conversionRate.toFixed(1)}%`}
            hint="Coupon đã thanh toán / tổng coupon đã tạo (all-time)"
            accent="brand"
            icon={<TargetIcon className="size-4" />}
            className="flex-1"
          />
          <StatusChart data={stats.statusBreakdown} />
        </div>
      </div>
    </div>
  );
}
