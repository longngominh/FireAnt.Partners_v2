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
import type { PendingAccountOrder } from "@/lib/data/pending-accounts";
import { CopyEmailButton } from "./copy-email-button";
import { CreateAccountButton } from "./create-account-button";

export function PendingAccountTable({
  rows,
  showPartner,
}: {
  rows: PendingAccountOrder[];
  showPartner: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 border-dashed py-16 text-center">
        <p className="text-sm font-medium">Không có đơn nào đang chờ tài khoản</p>
        <p className="text-xs text-muted-foreground">
          Mọi đơn đã thu tiền đều đã có tài khoản FireAnt tương ứng.
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
              <TableHead>Email khách</TableHead>
              <TableHead className="w-[120px]">Đơn hàng</TableHead>
              <TableHead>Gói</TableHead>
              <TableHead className="text-right">Số tiền</TableHead>
              <TableHead className="hidden md:table-cell">Ngày thu</TableHead>
              {showPartner ? <TableHead className="hidden lg:table-cell">Đối tác</TableHead> : null}
              <TableHead className="hidden lg:table-cell">Ghi chú</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.orderId}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{row.userName}</span>
                    <CopyEmailButton email={row.userName} />
                  </div>
                  <span className="text-xs text-muted-foreground">Mã {row.couponCode}</span>
                </TableCell>
                <TableCell>
                  <code className="font-mono text-xs font-medium">FA{row.orderId}</code>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{row.packageName ?? "—"}</span>
                </TableCell>
                <TableCell className="num text-right text-sm">{formatVND(row.amount)}</TableCell>
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                  {format(row.orderDate, "dd/MM/yyyy HH:mm", { locale: vi })}
                </TableCell>
                {showPartner ? (
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    {row.partnerName ?? row.partnerEmail ?? `#${row.partnerId}`}
                  </TableCell>
                ) : null}
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                  {row.note ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <CreateAccountButton email={row.userName} phone={row.customerPhone} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
