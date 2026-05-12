import Link from "next/link";
import {
  TrendingUpIcon,
  WalletIcon,
  UsersIcon,
  TicketIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { HeroTile, KpiTile } from "@/components/features/dashboard/kpi-tile";
import { TrendChart } from "@/components/features/dashboard/trend-chart";
import { listPartners } from "@/lib/data/partners";
import { getTrendSeriesForPartners } from "@/lib/data/trend";
import { formatVND, formatNumber } from "@/lib/utils/currency";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/dashboard");

  const partners = await listPartners();
  const activePartners = partners.filter((p) => p.isActive);
  const activeIds = activePartners.map((p) => p.id);

  const trendData = await getTrendSeriesForPartners(activeIds, "6M");

  const totalRevenue = activePartners.reduce((s, p) => s + p.totalRevenue, 0);
  const totalCommission = activePartners.reduce((s, p) => s + p.totalCommission, 0);
  const totalCoupons = activePartners.reduce((s, p) => s + p.couponCount, 0);
  const totalCustomers = activePartners.reduce((s, p) => s + p.customerCount, 0);

  const ranked = [...activePartners].sort((a, b) => b.totalRevenue - a.totalRevenue);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toàn bộ {activePartners.length} đối tác đang hoạt động — số liệu cộng dồn.
        </p>
      </div>

      <div className="grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-4">
        <HeroTile
          label="Tổng hoa hồng đối tác"
          value={formatVND(totalCommission)}
          hint={`Từ ${formatVND(totalRevenue)} doanh thu`}
          icon={<TrendingUpIcon className="size-5" />}
          className="col-span-2 row-span-2 lg:col-span-2"
        />
        <KpiTile
          label="Tổng doanh thu"
          value={formatVND(totalRevenue)}
          accent="info"
          icon={<WalletIcon className="size-4" />}
        />
        <KpiTile
          label="Tổng khách hàng"
          value={formatNumber(totalCustomers)}
          icon={<UsersIcon className="size-4" />}
        />
        <KpiTile
          label="Tổng coupon"
          value={formatNumber(totalCoupons)}
          icon={<TicketIcon className="size-4" />}
        />
        <KpiTile
          label="Đối tác hoạt động"
          value={String(activePartners.length)}
        />
      </div>

      <TrendChart
        initialData={trendData}
        partnerId={null}
        partnerIds={activeIds}
      />

      <div>
        <h2 className="mb-3 text-base font-semibold">Xếp hạng đối tác</h2>
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-8 text-center">#</TableHead>
                <TableHead>Đối tác</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="bg-success/5 text-right text-success">Hoa hồng</TableHead>
                <TableHead className="text-right">Khách</TableHead>
                <TableHead className="text-right">Coupon</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.map((p, i) => (
                <TableRow key={p.id} className="group">
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="num text-right text-sm">
                    {formatVND(p.totalRevenue)}
                  </TableCell>
                  <TableCell className="num bg-success/5 text-right text-sm font-semibold text-success">
                    {formatVND(p.totalCommission)}
                  </TableCell>
                  <TableCell className="num text-right text-sm">
                    {formatNumber(p.customerCount)}
                  </TableCell>
                  <TableCell className="num text-right text-sm">
                    {formatNumber(p.couponCount)}
                  </TableCell>
                  <TableCell>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-0 group-hover:opacity-100"
                    >
                      <Link href={`/admin/partners/${p.id}`} aria-label="Xem chi tiết">
                        <ExternalLinkIcon className="size-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
