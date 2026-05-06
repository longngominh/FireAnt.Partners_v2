import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { auth } from "@/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerSearch } from "@/components/features/customers/customer-search";
import { Pagination } from "@/components/shared/pagination";
import { listCustomers } from "@/lib/data/customers";
import { formatVND, formatNumber } from "@/lib/utils/currency";

export const metadata = { title: "Khách hàng" };

type SearchParams = Promise<{ q?: string; page?: string }>;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  const params = await searchParams;
  const isAdmin = session?.user.role === "admin";

  const page = Number(params.page ?? "1") || 1;
  const { rows, total, pageSize } = await listCustomers({
    partnerId: isAdmin ? null : session?.user.partnerId ?? null,
    q: params.q ?? "",
    page,
    pageSize: 20,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Khách hàng</h1>
        <p className="text-sm text-muted-foreground">
          {total} khách. Tổng quan đơn hàng và doanh thu theo khách.
        </p>
      </div>

      <CustomerSearch />

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 border-dashed py-16 text-center">
          <p className="text-sm font-medium">Không tìm thấy khách hàng</p>
          <p className="text-xs text-muted-foreground">
            Thử điều chỉnh từ khoá tìm kiếm.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Khách hàng</TableHead>
                {isAdmin ? <TableHead>Đối tác</TableHead> : null}
                <TableHead className="text-right">Đơn hàng</TableHead>
                <TableHead className="text-right">Tổng chi tiêu</TableHead>
                <TableHead className="hidden md:table-cell">Lần mua gần nhất</TableHead>
                <TableHead className="hidden md:table-cell">Khách từ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.username}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">
                          {c.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col leading-tight">
                        <span className="text-sm font-medium">{c.username}</span>
                        <span className="text-xs text-muted-foreground">{c.email ?? ""}</span>
                      </div>
                    </div>
                  </TableCell>
                  {isAdmin ? (
                    <TableCell className="text-xs text-muted-foreground">
                      {c.partnerName ?? "—"}
                    </TableCell>
                  ) : null}
                  <TableCell className="num text-right text-sm">
                    {formatNumber(c.orderCount)}
                  </TableCell>
                  <TableCell className="num text-right text-sm font-semibold">
                    {formatVND(c.totalSpent)}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {format(c.lastOrderAt, "dd/MM/yyyy", { locale: vi })}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {format(c.firstOrderAt, "MM/yyyy", { locale: vi })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        basePath="/customers"
        searchParams={{ q: params.q }}
      />
    </div>
  );
}
