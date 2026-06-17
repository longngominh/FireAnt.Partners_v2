import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
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
import { AdminDashboardPerformancePanel } from "@/components/features/dashboard/admin-dashboard-performance-panel";
import { getAdminDashboardPerformance, listPartners } from "@/lib/data/partners";
import { isTrendRange } from "@/lib/data/trend";
import { formatVND, formatNumber } from "@/lib/utils/currency";

export const metadata = { title: "Dashboard" };

type SearchParams = Promise<{
  range?: string;
}>;

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/dashboard");

  const query = await searchParams;
  const range = isTrendRange(query.range) ? query.range : "1M";
  const partners = await listPartners();
  const activePartners = partners.filter((p) => p.isActive);
  const performance = await getAdminDashboardPerformance(range);

  const ranked = [...activePartners].sort((a, b) => b.totalRevenue - a.totalRevenue);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toàn bộ {activePartners.length} đối tác đang hoạt động — số liệu cộng dồn.
        </p>
      </div>

      <AdminDashboardPerformancePanel
        initialRange={range}
        initialData={performance}
        basePath="/admin"
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
