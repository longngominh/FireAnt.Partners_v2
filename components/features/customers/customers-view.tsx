import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerSearch } from "@/components/features/customers/customer-search";
import { SourceFilter } from "@/components/features/payment/source-filter";
import { Pagination } from "@/components/shared/pagination";
import { listCustomers } from "@/lib/data/customers";
import { listCouponSources } from "@/lib/data/payment";
import { formatNumber, formatVND } from "@/lib/utils/currency";

/**
 * Bảng khách hàng.
 *   - partnerId = người đang đăng nhập (nhân viên: chỉ khách của mình).
 *   - teamOf = đối tác: gồm khách của nhân viên, thêm cột Người bán (sellerLabels).
 *   - cả hai null: toàn hệ thống (bảng quản trị — thêm cột người bán).
 */
export async function CustomersView({
  partnerId,
  teamOf = null,
  sellerLabels,
  basePath,
  q,
  source,
  page,
  keep,
}: {
  partnerId: number | null;
  teamOf?: number | null;
  sellerLabels?: Record<number, string>;
  basePath: string;
  q: string;
  source: string | null;
  page: number;
  /** Tham số URL giữ lại khi chuyển trang (vd bộ lọc đối tác của bảng quản trị). */
  keep?: Record<string, string | undefined>;
}) {
  const showPartner = partnerId === null && teamOf === null;
  const showSeller = teamOf !== null && sellerLabels !== undefined;
  const [{ rows, total, pageSize }, sources] = await Promise.all([
    listCustomers({ partnerId, teamOf, q, source, page, pageSize: 20 }),
    listCouponSources(partnerId, teamOf),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex-1">
          <CustomerSearch />
        </div>
        <SourceFilter sources={sources} />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-16 text-center">
          <p className="text-sm font-medium">Không tìm thấy khách hàng</p>
          <p className="text-xs text-muted-foreground">Thử điều chỉnh từ khoá tìm kiếm hoặc bộ lọc nguồn.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Khách hàng</TableHead>
                {showPartner ? <TableHead>Người bán</TableHead> : null}
                {showSeller ? <TableHead>Người bán</TableHead> : null}
                <TableHead>Nguồn</TableHead>
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
                        <AvatarFallback className="text-xs">{c.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col leading-tight">
                        <span className="text-sm font-medium">{c.username}</span>
                        <span className="text-xs text-muted-foreground">{c.email ?? ""}</span>
                      </div>
                    </div>
                  </TableCell>
                  {showPartner ? (
                    <TableCell className="text-xs text-muted-foreground">{c.partnerName ?? "—"}</TableCell>
                  ) : null}
                  {showSeller ? (
                    <TableCell className="text-sm">
                      {c.partnerId !== null ? (sellerLabels?.[c.partnerId] ?? c.partnerName ?? "—") : "—"}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    {c.source ? (
                      <span className="inline-block max-w-[140px] truncate rounded-full border px-2 py-0.5 align-middle text-[11px] font-medium">
                        {c.source}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="num text-right text-sm">{formatNumber(c.orderCount)}</TableCell>
                  <TableCell className="num text-right text-sm font-semibold">{formatVND(c.totalSpent)}</TableCell>
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
        </div>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        basePath={basePath}
        searchParams={{ ...keep, q: q || undefined, source: source ?? undefined }}
      />
    </div>
  );
}
