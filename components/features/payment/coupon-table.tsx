import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatVND } from "@/lib/utils/currency";
import { buildShortLink } from "@/lib/utils/shortcode";
import { qrToDataUrl } from "@/lib/utils/qr";
import type { Coupon } from "@/lib/data/payment";
import { StatusBadge } from "./status-badge";
import { CouponRowActions } from "./coupon-row-actions";

export async function CouponTable({ rows }: { rows: Coupon[] }) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const enriched = await Promise.all(
    rows.map(async (c) => {
      const shortLink = buildShortLink(baseUrl, c.code);
      const qrDataUrl = await qrToDataUrl(shortLink);
      return { coupon: c, shortLink, qrDataUrl };
    }),
  );

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 border-dashed py-16 text-center">
        <p className="text-sm font-medium">Chưa có coupon nào</p>
        <p className="text-xs text-muted-foreground">
          Tạo link thanh toán đầu tiên để bắt đầu.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-[140px]">Mã</TableHead>
            <TableHead>Tài khoản</TableHead>
            <TableHead className="text-right">Số tiền</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="hidden md:table-cell">Ngày tạo</TableHead>
            <TableHead className="hidden lg:table-cell">Ghi chú</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {enriched.map(({ coupon, shortLink, qrDataUrl }) => (
            <TableRow key={coupon.id} className="group">
              <TableCell>
                <div className="flex flex-col leading-tight">
                  <code className="font-mono text-xs font-medium">
                    {coupon.code}
                  </code>
                  {coupon.packageName ? (
                    <span className="text-xs text-muted-foreground">{coupon.packageName}</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm font-medium">
                  {coupon.userName ?? (
                    <span className="font-normal text-muted-foreground">—</span>
                  )}
                </span>
              </TableCell>
              <TableCell className="num text-right text-sm">
                {coupon.orderAmount > 0
                  ? formatVND(coupon.orderAmount)
                  : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                <StatusBadge status={coupon.status} />
              </TableCell>
              <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                {format(coupon.createdAt, "dd/MM/yyyy HH:mm", { locale: vi })}
              </TableCell>
              <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                {coupon.note ?? <span>—</span>}
              </TableCell>
              <TableCell>
                <CouponRowActions
                  coupon={coupon}
                  shortLink={shortLink}
                  qrDataUrl={qrDataUrl}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </Card>
  );
}
