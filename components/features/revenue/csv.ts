import { CONTRACT_TIER_LABELS } from "@/lib/commission";
import type { MonthlyPartnerRevenue, MonthlyRevenueTotals } from "@/lib/data/revenue";
import { formatMonthRangeLabel, type MonthKey } from "@/lib/utils/month";

const HEADER = [
  "Đối tác",
  "Email",
  "Tài khoản",
  "Loại",
  "Trạng thái",
  "Chế độ tính",
  "Phụ lục",
  "DS trực tiếp",
  "DS từ nhân viên",
  "DS khách mới",
  "DS gia hạn, nâng cấp, khóa học",
  "Tổng doanh số",
  "DS tính thù lao",
  "Lương cứng",
  "Hoa hồng",
  "Thưởng doanh số",
  "Thù lao chi trả",
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
  const commissionBase = rows.reduce((sum, row) => sum + row.remuneration.revenue, 0);
  const payable = totals.commission + totals.performanceBonus;
  const lines = [
    toLine([`Phí/thù lao đối tác — ${formatMonthRangeLabel(month)}`]),
    "",
    toLine(HEADER),
    ...rows.map((row) =>
      toLine([
        row.name ?? row.username,
        row.email ?? "",
        row.username,
        row.partnerTypeLabel,
        row.isActive ? "Đang hoạt động" : "Tạm dừng",
        row.remuneration.policy === "tier" ? "Theo phụ lục" : "Bậc lũy tiến",
        row.partnerType === "collaborator" ? CONTRACT_TIER_LABELS[row.tier] : "",
        row.directRevenue,
        row.staffRevenue,
        row.newCustomerRevenue,
        row.otherRevenue,
        row.revenue,
        row.remuneration.revenue,
        row.remuneration.baseSalary,
        row.remuneration.commission,
        row.remuneration.performanceBonus,
        row.remuneration.commission + row.remuneration.performanceBonus,
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
      `${totals.partnerCount} người`,
      "",
      "",
      rows.reduce((sum, row) => sum + row.directRevenue, 0),
      rows.reduce((sum, row) => sum + row.staffRevenue, 0),
      totals.newCustomerRevenue,
      totals.otherRevenue,
      totals.revenue,
      commissionBase,
      totals.baseSalary,
      totals.commission,
      totals.performanceBonus,
      payable,
      percent(commissionBase > 0 ? payable / commissionBase : 0),
      totals.orderCount,
      totals.customerCount,
    ]),
  ];

  return lines.join("\r\n");
}

export function monthlyRevenueCsvFilename(month: MonthKey): string {
  return `thu-lao-doi-tac-${month}.csv`;
}
