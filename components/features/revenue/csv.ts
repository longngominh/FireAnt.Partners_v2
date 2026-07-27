import type { MonthlyPartnerRevenue, MonthlyRevenueTotals } from "@/lib/data/revenue";
import { formatMonthRangeLabel, type MonthKey } from "@/lib/utils/month";

const HEADER = [
  "Cộng tác viên",
  "Email",
  "Tài khoản",
  "Loại",
  "Trạng thái",
  "Doanh thu",
  "Lương cứng",
  "Hoa hồng",
  "Thưởng doanh số",
  "Tổng thù lao",
  "Tỷ lệ hiệu dụng (%)",
  "Số đơn",
  "Số khách",
];

/**
 * Dấu phân cách `;` + dấu thập phân `,` theo quy ước vi-VN để Excel bản Việt
 * tách cột đúng mà không cần thao tác Text to Columns.
 */
const DELIMITER = ";";

function escapeCell(value: string | number): string {
  const text = typeof value === "number" ? String(value) : value;
  return /["\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function percent(rate: number): string {
  return (rate * 100).toFixed(2).replace(".", ",");
}

function toLine(cells: Array<string | number>): string {
  return cells.map(escapeCell).join(DELIMITER);
}

export function buildMonthlyRevenueCsv(
  rows: MonthlyPartnerRevenue[],
  totals: MonthlyRevenueTotals,
  month: MonthKey,
): string {
  const lines = [
    toLine([`Doanh thu & hoa hồng cộng tác viên — ${formatMonthRangeLabel(month)}`]),
    "",
    toLine(HEADER),
    ...rows.map((row) =>
      toLine([
        row.name ?? row.username,
        row.email ?? "",
        row.username,
        row.partnerTypeLabel,
        row.isActive ? "Đang hoạt động" : "Tạm dừng",
        row.revenue,
        row.remuneration.baseSalary,
        row.remuneration.commission,
        row.remuneration.performanceBonus,
        row.remuneration.total,
        percent(row.remuneration.effectiveRate),
        row.orderCount,
        row.customerCount,
      ]),
    ),
    toLine([
      "TỔNG CỘNG",
      "",
      "",
      "",
      `${totals.partnerCount} CTV`,
      totals.revenue,
      totals.baseSalary,
      totals.commission,
      totals.performanceBonus,
      totals.remuneration,
      percent(totals.revenue > 0 ? totals.remuneration / totals.revenue : 0),
      totals.orderCount,
      totals.customerCount,
    ]),
  ];

  return lines.join("\r\n");
}

export function monthlyRevenueCsvFilename(month: MonthKey): string {
  return `doanh-thu-hoa-hong-${month}.csv`;
}
