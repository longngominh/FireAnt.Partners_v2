import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MonthlyPartnerRevenue, MonthlyRevenueTotals } from "@/lib/data/revenue";
import type { RevenueSortKey, SortOrder } from "@/lib/data/revenue-view";
import { formatNumber, formatVND } from "@/lib/utils/currency";

type Column = {
  key: RevenueSortKey | null;
  label: string;
  align: "left" | "right";
  className?: string;
};

const COLUMNS: Column[] = [
  { key: "name", label: "Cộng tác viên", align: "left" },
  { key: null, label: "Loại", align: "left", className: "hidden xl:table-cell" },
  { key: "orders", label: "Đơn", align: "right", className: "hidden sm:table-cell text-right" },
  { key: "customers", label: "Khách", align: "right", className: "hidden sm:table-cell text-right" },
  { key: "revenue", label: "Doanh số", align: "right", className: "text-right" },
  { key: null, label: "Lương cứng", align: "right", className: "hidden lg:table-cell text-right" },
  {
    key: "commission",
    label: "Hoa hồng",
    align: "right",
    className: "bg-success/5 text-right text-success",
  },
  { key: null, label: "Thưởng", align: "right", className: "hidden lg:table-cell text-right" },
  { key: "remuneration", label: "Tổng doanh thu", align: "right", className: "text-right" },
  { key: null, label: "Tỷ lệ", align: "right", className: "hidden md:table-cell text-right" },
];

type Props = {
  rows: MonthlyPartnerRevenue[];
  totals: MonthlyRevenueTotals;
  /** Bỏ qua để render tiêu đề tĩnh (trang cộng tác viên chỉ có 1 dòng). */
  sort?: RevenueSortKey;
  order?: SortOrder;
  buildSortHref?: (key: RevenueSortKey) => string;
  /** Link tới trang chi tiết cộng tác viên — chỉ admin dùng. */
  partnerHrefPrefix?: string;
  emptyMessage?: string;
};

function percentLabel(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function HeadCell({
  column,
  sort,
  order,
  buildSortHref,
}: {
  column: Column;
  sort?: RevenueSortKey;
  order: SortOrder;
  buildSortHref?: (key: RevenueSortKey) => string;
}) {
  if (!column.key || !buildSortHref) {
    return <TableHead className={column.className}>{column.label}</TableHead>;
  }

  const isActive = sort === column.key;
  const indicator = isActive ? (order === "asc" ? "↑" : "↓") : "↕";

  return (
    <TableHead className={column.className}>
      <Link
        href={buildSortHref(column.key)}
        aria-label={`Sắp xếp theo ${column.label}`}
        className={`inline-flex items-center gap-1 hover:text-primary ${
          column.align === "right" ? "w-full justify-end" : ""
        } ${isActive ? "font-semibold text-foreground" : ""}`}
      >
        <span>{column.label}</span>
        <span aria-hidden className="text-[10px] text-muted-foreground">
          {indicator}
        </span>
      </Link>
    </TableHead>
  );
}

export function MonthlyRevenueTable({
  rows,
  totals,
  sort,
  order = "desc",
  buildSortHref,
  partnerHrefPrefix,
  emptyMessage = "Không có cộng tác viên nào khớp bộ lọc.",
}: Props) {
  const overallRate = totals.revenue > 0 ? totals.remuneration / totals.revenue : 0;

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {COLUMNS.map((column) => (
              <HeadCell
                key={column.label}
                column={column}
                sort={sort}
                order={order}
                buildSortHref={buildSortHref}
              />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={COLUMNS.length}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : null}
          {rows.map((row, index) => (
            <TableRow key={row.partnerId} className={index % 2 === 1 ? "bg-muted/20" : ""}>
              <TableCell>
                <div className="flex flex-col leading-tight">
                  {partnerHrefPrefix ? (
                    <Link
                      href={`${partnerHrefPrefix}/${row.partnerId}`}
                      className="text-sm font-medium hover:text-primary hover:underline"
                    >
                      {row.name ?? row.username}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{row.name ?? row.username}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{row.email}</span>
                  <div className="mt-1 flex flex-wrap gap-1 xl:hidden">
                    <Badge variant="outline">{row.partnerTypeLabel}</Badge>
                    {!row.isActive ? (
                      <Badge
                        variant="outline"
                        className="border-muted-foreground/30 bg-muted text-muted-foreground"
                      >
                        Tạm dừng
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                <div className="flex flex-col items-start gap-1">
                  <Badge variant="outline" className="w-fit">
                    {row.partnerTypeLabel}
                  </Badge>
                  {!row.isActive ? (
                    <span className="text-[11px] text-muted-foreground">Tạm dừng</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="num hidden text-right text-sm sm:table-cell">
                {formatNumber(row.orderCount)}
              </TableCell>
              <TableCell className="num hidden text-right text-sm sm:table-cell">
                {formatNumber(row.customerCount)}
              </TableCell>
              <TableCell className="num text-right text-sm">{formatVND(row.revenue)}</TableCell>
              <TableCell className="num hidden text-right text-sm lg:table-cell">
                {formatVND(row.remuneration.baseSalary)}
              </TableCell>
              <TableCell className="num bg-success/5 text-right text-sm font-semibold text-success">
                {formatVND(row.remuneration.commission)}
              </TableCell>
              <TableCell className="num hidden text-right text-sm lg:table-cell">
                {formatVND(row.remuneration.performanceBonus)}
              </TableCell>
              <TableCell className="num text-right text-sm font-semibold">
                {formatVND(row.remuneration.total)}
              </TableCell>
              <TableCell className="num hidden text-right text-xs text-muted-foreground md:table-cell">
                {percentLabel(row.remuneration.effectiveRate)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {rows.length > 0 ? (
          <TableFooter>
            <TableRow className="hover:bg-muted/50">
              <TableCell className="text-sm font-semibold">
                Tổng cộng
                <span className="ml-1 font-normal text-muted-foreground">
                  ({formatNumber(totals.partnerCount)} CTV)
                </span>
              </TableCell>
              <TableCell className="hidden xl:table-cell" />
              <TableCell className="num hidden text-right text-sm sm:table-cell">
                {formatNumber(totals.orderCount)}
              </TableCell>
              <TableCell className="num hidden text-right text-sm sm:table-cell">
                {formatNumber(totals.customerCount)}
              </TableCell>
              <TableCell className="num text-right text-sm">{formatVND(totals.revenue)}</TableCell>
              <TableCell className="num hidden text-right text-sm lg:table-cell">
                {formatVND(totals.baseSalary)}
              </TableCell>
              <TableCell className="num bg-success/5 text-right text-sm font-semibold text-success">
                {formatVND(totals.commission)}
              </TableCell>
              <TableCell className="num hidden text-right text-sm lg:table-cell">
                {formatVND(totals.performanceBonus)}
              </TableCell>
              <TableCell className="num text-right text-sm font-semibold">
                {formatVND(totals.remuneration)}
              </TableCell>
              <TableCell className="num hidden text-right text-xs text-muted-foreground md:table-cell">
                {percentLabel(overallRate)}
              </TableCell>
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </Card>
  );
}
