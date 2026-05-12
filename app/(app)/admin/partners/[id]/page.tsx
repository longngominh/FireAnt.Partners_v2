import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowLeftIcon,
  TrendingUpIcon,
  WalletIcon,
  ClockIcon,
  TicketIcon,
  UsersIcon,
  TargetIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HeroTile, KpiTile } from "@/components/features/dashboard/kpi-tile";
import { TrendChart } from "@/components/features/dashboard/trend-chart";
import { getPartnerPerformance } from "@/lib/data/partners";
import { formatVND, formatNumber } from "@/lib/utils/currency";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPartnerPerformance(id);
  return { title: data ? data.partner.name : "Đối tác" };
}

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const data = await getPartnerPerformance(id);
  if (!data) notFound();

  const { partner, totalRevenue, totalCommission, couponCount, paidCount, pendingCount, customerCount, conversionRate, monthlyTrend } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit gap-2">
          <Link href="/admin/partners">
            <ArrowLeftIcon className="size-4" /> Quay lại
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{partner.name}</h1>
            <p className="text-sm text-muted-foreground">
              {partner.email}
              {partner.createdAt
                ? ` · Hợp tác từ ${format(partner.createdAt, "MM/yyyy", { locale: vi })}`
                : ""}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              partner.isActive
                ? "border-success/30 bg-success/15 text-success"
                : "border-muted-foreground/30 bg-muted text-muted-foreground"
            }
          >
            {partner.isActive ? "Đang hoạt động" : "Tạm dừng"}
          </Badge>
        </div>
      </div>

      <div className="grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-4">
        <HeroTile
          label="Hoa hồng đối tác đã nhận"
          value={formatVND(totalCommission)}
          hint={`${paidCount}/${couponCount} coupon thanh toán`}
          icon={<TrendingUpIcon className="size-5" />}
          className="col-span-2 row-span-2 lg:col-span-2"
        />
        <KpiTile
          label="Doanh thu"
          value={formatVND(totalRevenue)}
          accent="info"
          icon={<WalletIcon className="size-4" />}
        />
        <KpiTile
          label="Đang chờ thanh toán"
          value={formatNumber(pendingCount)}
          accent="warning"
          icon={<ClockIcon className="size-4" />}
        />
        <KpiTile
          label="Tổng link đã tạo"
          value={formatNumber(couponCount)}
          icon={<TicketIcon className="size-4" />}
        />
        <KpiTile
          label="Khách hàng"
          value={formatNumber(customerCount)}
          icon={<UsersIcon className="size-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <TrendChart
          initialData={monthlyTrend.map((p) => ({ period: p.month, revenue: p.revenue, commission: p.commission }))}
          partnerId={partner.id}
        />
        <KpiTile
          label="Tỷ lệ thanh toán"
          value={`${conversionRate.toFixed(1)}%`}
          hint="Coupon đã thanh toán / coupon đã tạo"
          accent="brand"
          icon={<TargetIcon className="size-4" />}
        />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="num font-mono text-base font-semibold">{value}</span>
    </div>
  );
}
