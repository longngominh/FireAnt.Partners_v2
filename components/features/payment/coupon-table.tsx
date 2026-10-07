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
import type { Coupon } from "@/lib/data/payment";
import { PAYMENT_METHOD_META, isCardPayment, paymentMethodOfLink } from "@/lib/payment/payment-method";
import { isUpgradePaymentLink } from "@/lib/payment/upgrade-link";
import { StatusBadge } from "./status-badge";
import { CouponRowActions } from "./coupon-row-actions";

export function CouponTable({ rows }: { rows: Coupon[] }) {
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
            <TableHead className="hidden md:table-cell">Nguồn</TableHead>
            <TableHead className="hidden md:table-cell">Ngày tạo</TableHead>
            <TableHead className="hidden lg:table-cell">Ghi chú</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((coupon) => (
            <TableRow key={coupon.id} className="group">
              <TableCell>
                <div className="flex flex-col leading-tight">
                  <span className="flex items-center gap-1.5">
                    <code className="font-mono text-xs font-medium">
                      {coupon.code}
                    </code>
                    {isUpgradePaymentLink(coupon.paymentLink) ? (
                      <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">
                        Nâng cấp
                      </span>
                    ) : (
                      <CardMethodBadge paymentLink={coupon.paymentLink} />
                    )}
                  </span>
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
                <div className="flex flex-col items-end leading-tight">
                  {coupon.orderAmount > 0
                    ? formatVND(coupon.orderAmount)
                    : <span className="text-muted-foreground">—</span>}
                  {coupon.voucherCode ? (
                    <span
                      className="text-[11px] text-success"
                      title={`Mã khuyến mại ${coupon.voucherCode}`}
                    >
                      <span className="font-mono font-medium">{coupon.voucherCode}</span>
                      {coupon.discountAmount ? ` · −${formatVND(coupon.discountAmount)}` : null}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={coupon.status} />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {coupon.source ? (
                  <span className="inline-block max-w-[140px] truncate rounded-full border px-2 py-0.5 align-middle text-[11px] font-medium text-foreground">
                    {coupon.source}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
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
                  paymentLink={coupon.paymentLink}
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

/** Nhãn link thanh toán thẻ; link chuyển khoản (mặc định) không gắn nhãn. */
function CardMethodBadge({ paymentLink }: { paymentLink: string }) {
  const method = paymentMethodOfLink(paymentLink);
  if (!isCardPayment(method)) return null;
  return (
    <span className="whitespace-nowrap rounded-full bg-info/10 px-1.5 py-px text-[10px] font-semibold text-info">
      {PAYMENT_METHOD_META[method].label}
    </span>
  );
}
