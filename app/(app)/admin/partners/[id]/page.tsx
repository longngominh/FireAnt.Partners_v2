import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { ArrowLeftIcon, PencilIcon } from "lucide-react";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PartnerPerformancePanel } from "@/components/features/dashboard/partner-performance-panel";
import { CouponTable } from "@/components/features/payment/coupon-table";
import { FilterBar } from "@/components/features/payment/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { getPartnerPerformance } from "@/lib/data/partners";
import { isTrendRange } from "@/lib/data/trend";
import { listCoupons, type CouponStatus } from "@/lib/data/payment";
import { formatNumber, formatVND } from "@/lib/utils/currency";

type SearchParams = Promise<{
  q?: string;
  status?: string;
  page?: string;
  range?: string;
}>;

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const query = await searchParams;
  const range = isTrendRange(query.range) ? query.range : "1M";
  const data = await getPartnerPerformance(id, range);
  if (!data) notFound();

  const { partner } = data;
  const page = Number(query.page ?? "1") || 1;
  const status = (query.status ?? "ALL") as CouponStatus | "ALL";
  const {
    rows: couponRows,
    total: couponTotal,
    pageSize,
  } = await listCoupons({
    partnerId: id,
    status,
    q: query.q ?? "",
    page,
    pageSize: 10,
  });

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
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{partner.partnerTypeLabel}</Badge>
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
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/partners/${partner.id}/edit`}>
                <PencilIcon className="size-3.5" /> Sửa
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <Card className="grid gap-4 p-5 md:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Thù lao tháng này</p>
          <p className="num mt-1 text-xl font-semibold">
            {formatVND(data.monthlyRemuneration.total)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Doanh thu tháng</p>
          <p className="num mt-1 text-lg font-semibold">
            {formatVND(data.monthlyRemuneration.revenue)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Lương cứng</p>
          <p className="num mt-1 text-lg font-semibold">
            {formatVND(data.monthlyRemuneration.baseSalary)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Hoa hồng + thưởng</p>
          <p className="num mt-1 text-lg font-semibold">
            {formatVND(
              data.monthlyRemuneration.commission + data.monthlyRemuneration.performanceBonus,
            )}
          </p>
        </div>
      </Card>

      <PartnerPerformancePanel
        partnerId={partner.id}
        initialRange={range}
        initialData={{
          totalRevenue: data.totalRevenue,
          totalCommission: data.totalCommission,
          couponCount: data.couponCount,
          paidCount: data.paidCount,
          pendingCount: data.pendingCount,
          customerCount: data.customerCount,
          conversionRate: data.conversionRate,
          monthlyRemuneration: data.monthlyRemuneration,
          monthlyTrend: data.monthlyTrend,
        }}
        basePath={`/admin/partners/${partner.id}`}
        searchParams={{ q: query.q, status: query.status }}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Link đối tác đã tạo</h2>
          <p className="text-sm text-muted-foreground">
            Tổng {formatNumber(couponTotal)} link. Bấm vào từng hàng để xem QR và copy link nhanh.
          </p>
        </div>
        <FilterBar />
        <CouponTable rows={couponRows} />
        <Pagination
          page={page}
          pageSize={pageSize}
          total={couponTotal}
          basePath={`/admin/partners/${partner.id}`}
          searchParams={{ q: query.q, status: query.status, range: range === "1M" ? undefined : range }}
        />
      </div>
    </div>
  );
}
