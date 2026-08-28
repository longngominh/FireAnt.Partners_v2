import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MonthPicker } from "@/components/features/revenue/month-picker";
import { ExportCsvButton } from "@/components/features/revenue/export-csv-button";
import { PaymentRequestDialog } from "@/components/features/revenue/payment-request-dialog";
import { MonthlyRevenueTable } from "@/components/features/revenue/monthly-revenue-table";
import { PARTNER_TYPE_LABELS } from "@/lib/commission";
import { getMonthlyRevenueReport, sumMonthlyTotals } from "@/lib/data/revenue";
import {
  DEFAULT_ORDERS,
  DEFAULT_SORT,
  filterRevenueRows,
  parseRevenueFilters,
  parseRevenueSorting,
  sortRevenueRows,
  type RevenueSortKey,
  type SortOrder,
} from "@/lib/data/revenue-view";
import { formatMonthLabel, normalizeMonthKey } from "@/lib/utils/month";
import { formatNumber, formatVND } from "@/lib/utils/currency";

export const metadata = { title: "Doanh thu & hoa hồng theo tháng" };

const BASE_PATH = "/admin/revenue";

type SearchParams = Promise<{
  month?: string;
  q?: string;
  type?: string;
  status?: string;
  rows?: string;
  sort?: string;
  order?: string;
}>;

export default async function AdminRevenuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/revenue");

  const params = await searchParams;
  const month = normalizeMonthKey(params.month);
  const filters = parseRevenueFilters(params);
  const { sort, order } = parseRevenueSorting(params);

  const report = await getMonthlyRevenueReport({ month });
  const rows = sortRevenueRows(filterRevenueRows(report.rows, filters), { sort, order });
  const totals = sumMonthlyTotals(rows);

  const { q, type, status, rows: rowsFilter } = filters;
  const activeFilters = { q, type, status, rows: rowsFilter, sort, order };
  const hasFilters = Boolean(q) || type !== "all" || status !== "all" || rowsFilter !== "earning";
  const payableCount = rows.filter((row) => row.remuneration.commission > 0).length;

  function buildHref(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams({ month });
    if (q) sp.set("q", q);
    if (type !== "all") sp.set("type", type);
    if (status !== "all") sp.set("status", status);
    if (rowsFilter !== "earning") sp.set("rows", rowsFilter);
    if (sort !== DEFAULT_SORT) sp.set("sort", sort);
    if (order !== DEFAULT_ORDERS[sort]) sp.set("order", order);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) sp.delete(key);
      else sp.set(key, value);
    }
    return `${BASE_PATH}?${sp.toString()}`;
  }

  function buildSortHref(key: RevenueSortKey) {
    const nextOrder: SortOrder =
      sort === key ? (order === "asc" ? "desc" : "asc") : DEFAULT_ORDERS[key];
    return buildHref({ sort: key, order: nextOrder });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Doanh thu & hoa hồng theo tháng</h1>
          <p className="text-sm text-muted-foreground">
            Bảng kê {formatMonthLabel(month).toLowerCase()} — tính trên đơn đã thanh toán từ ngày 1
            đến hết ngày cuối tháng.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker month={month} basePath={BASE_PATH} searchParams={activeFilters} />
          <ExportCsvButton rows={rows} totals={totals} month={month} />
          <PaymentRequestDialog
            month={month}
            searchParams={activeFilters}
            defaultRequesterName={session.user.name ?? ""}
            payableCount={payableCount}
            payableAmount={rows.reduce((sum, row) => sum + row.remuneration.commission, 0)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Doanh số tháng</p>
          <p className="num mt-1 text-xl font-semibold">{formatVND(totals.revenue)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {formatNumber(totals.orderCount)} đơn đã thanh toán
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Hoa hồng</p>
          <p className="num mt-1 text-xl font-semibold text-success">
            {formatVND(totals.commission)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Thưởng doanh số {formatVND(totals.performanceBonus)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Tổng doanh thu phải trả</p>
          <p className="num mt-1 text-xl font-semibold">{formatVND(totals.remuneration)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Gồm lương cứng {formatVND(totals.baseSalary)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Cộng tác viên</p>
          <p className="num mt-1 text-xl font-semibold">{formatNumber(totals.partnerCount)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tỷ lệ hiệu dụng{" "}
            {totals.revenue > 0
              ? `${((totals.remuneration / totals.revenue) * 100).toFixed(1)}%`
              : "—"}
          </p>
        </Card>
      </div>

      <Card className="p-4">
        <form className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_180px_200px_auto_auto]">
          <input type="hidden" name="month" value={month} />
          {sort !== DEFAULT_SORT ? <input type="hidden" name="sort" value={sort} /> : null}
          {order !== DEFAULT_ORDERS[sort] ? (
            <input type="hidden" name="order" value={order} />
          ) : null}
          <Input
            name="q"
            defaultValue={q}
            placeholder="Tìm theo tên, email, tài khoản"
            aria-label="Tìm cộng tác viên"
          />
          <select
            name="type"
            defaultValue={type}
            aria-label="Lọc theo loại cộng tác viên"
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="all">Tất cả loại</option>
            <option value="sales_employee">{PARTNER_TYPE_LABELS.sales_employee}</option>
            <option value="collaborator">{PARTNER_TYPE_LABELS.collaborator}</option>
          </select>
          <select
            name="status"
            defaultValue={status}
            aria-label="Lọc theo trạng thái"
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Tạm dừng</option>
          </select>
          <select
            name="rows"
            defaultValue={rowsFilter}
            aria-label="Phạm vi hiển thị"
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="earning">Chỉ CTV phát sinh</option>
            <option value="all">Tất cả CTV</option>
          </select>
          <Button type="submit">Lọc</Button>
          {hasFilters ? (
            <Button asChild variant="outline">
              <Link href={`${BASE_PATH}?month=${month}`}>Xóa lọc</Link>
            </Button>
          ) : null}
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Đang hiển thị {formatNumber(rows.length)}/{formatNumber(report.rows.length)} cộng tác
          viên. Số liệu tổng hợp phía trên tính theo danh sách đang hiển thị.
        </p>
      </Card>

      <MonthlyRevenueTable
        rows={rows}
        totals={totals}
        sort={sort}
        order={order}
        buildSortHref={buildSortHref}
        partnerHrefPrefix="/admin/partners"
        emptyMessage={
          rowsFilter === "earning"
            ? "Không có cộng tác viên nào phát sinh doanh số trong tháng này."
            : "Không tìm thấy cộng tác viên phù hợp."
        }
      />
    </div>
  );
}
