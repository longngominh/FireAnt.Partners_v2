import Link from "next/link";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { PlusIcon, ExternalLinkIcon } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listPartners } from "@/lib/data/partners";
import { formatVND, formatNumber } from "@/lib/utils/currency";

export const metadata = { title: "Quản lý đối tác" };

export default async function AdminPartnersPage() {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return null;
  }

  const partners = (await listPartners()).filter((p) => p.isActive);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Quản lý đối tác</h1>
          <p className="text-sm text-muted-foreground">
            {partners.length} đối tác. Bấm vào hàng để xem hiệu suất chi tiết.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/admin/partners/new">
            <PlusIcon className="size-4" />
            Tạo tài khoản đối tác
          </Link>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Đối tác</TableHead>
              <TableHead className="text-right">Doanh thu</TableHead>
              <TableHead className="bg-success/5 text-right text-success">
                Hoa hồng
              </TableHead>
              <TableHead className="text-right">Khách</TableHead>
              <TableHead className="text-right">Coupon</TableHead>
              <TableHead className="hidden md:table-cell">Hợp tác từ</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.map((p) => (
              <TableRow key={p.id} className="group">
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
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                  {p.createdAt ? format(p.createdAt, "MM/yyyy", { locale: vi }) : "—"}
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
  );
}
