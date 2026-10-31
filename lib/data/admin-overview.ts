import { CONTRACT_TIERS, type ContractTier } from "@/lib/commission";
import { payableAmount } from "@/lib/earnings/explain";
import { getPartnerPaymentInfoMap, missingPaymentFields, type PartnerPaymentInfo } from "@/lib/data/partner-payment-info";
import { getMonthlyRevenueReport, type MonthlyPartnerRevenue } from "@/lib/data/revenue";
import { countActiveStaffByPartner, getStaffStats, listStaffApplications, type StaffStats } from "@/lib/data/staff";
import { currentMonthKey, type MonthKey } from "@/lib/utils/month";

/** Doanh thu tính thù lao của đối tác trong một tháng, chia theo phụ lục áp dụng tháng đó. */
export type PolicyMonthPoint = { month: MonthKey } & Record<ContractTier, number>;

export type OverviewKpis = {
  /** Doanh thu tính thù lao của đối tác (gồm doanh số nhân viên). */
  baseRevenue: number;
  /** Toàn bộ doanh thu qua link: đối tác, nhân viên, NVKD, mọi loại đơn. */
  totalRevenue: number;
  /** Phí/thù lao đối tác. */
  payout: number;
  /** Số đối tác có doanh thu trong tháng. */
  activePartners: number;
};

export type AdminOverview = {
  month: MonthKey;
  /** Các dòng bảng kê tháng hiện tại — để biểu đồ lịch sử dùng đúng số của các thẻ. */
  rows: MonthlyPartnerRevenue[];
  counts: { partners: number; salesEmployees: number };
  kpis: OverviewKpis;
  /** Đối tác theo phụ lục đang hiệu lực (tháng hiện tại). */
  distribution: Array<{ tier: ContractTier; count: number; payout: number }>;
  leaders: Array<{
    partnerId: number;
    name: string;
    company: boolean;
    tier: ContractTier;
    base: number;
    newCustomers: number;
    staff: number;
  }>;
  missingInfo: Array<{ partnerId: number; name: string; payout: number }>;
  pending: { count: number; partners: number; oldest: Date | null };
  staff: StaffStats & { top: { partnerId: number; name: string; count: number } | null };
};

/** Tên hiển thị ở bảng quản trị: tên trên chứng từ (pháp nhân/cá nhân) trước tên tài khoản FireAnt. */
export function adminPartnerName(
  row: Pick<MonthlyPartnerRevenue, "name" | "username">,
  info: PartnerPaymentInfo | undefined,
): string {
  return info?.fullName || row.name?.trim() || row.username;
}

/** Các chỉ số đầu trang tổng quan, từ các dòng bảng kê của một tháng. */
export function overviewKpis(rows: MonthlyPartnerRevenue[]): OverviewKpis {
  const kpis: OverviewKpis = { baseRevenue: 0, totalRevenue: 0, payout: 0, activePartners: 0 };
  for (const row of rows) {
    kpis.totalRevenue += row.revenue;
    if (row.partnerType !== "collaborator") continue;
    kpis.baseRevenue += row.remuneration.revenue;
    kpis.payout += payableAmount(row.remuneration);
    if (row.revenue > 0) kpis.activePartners += 1;
  }
  return kpis;
}

/**
 * Doanh thu tính thù lao của đối tác theo phụ lục của từng tháng (đã gồm doanh số nhân viên),
 * từ các dòng bảng kê nhiều tháng (getRecentRevenueRows).
 */
export function policyTrendFrom(
  history: Map<MonthKey, MonthlyPartnerRevenue[]>,
  months: MonthKey[],
): PolicyMonthPoint[] {
  return months.map((month) => {
    const point: PolicyMonthPoint = { month, normal: 0, silver: 0, gold: 0, diamond: 0 };
    for (const row of history.get(month) ?? []) {
      if (row.partnerType === "collaborator") point[row.tier] += row.remuneration.revenue;
    }
    return point;
  });
}

/** Số liệu tháng hiện tại. Lịch sử (biểu đồ) lấy riêng để trang hiện trước rồi stream sau. */
export async function getAdminOverview(): Promise<AdminOverview> {
  const month = currentMonthKey();
  const [report, paymentInfo, staffCounts, staffStats, pendingApps] = await Promise.all([
    getMonthlyRevenueReport({ month }),
    getPartnerPaymentInfoMap(),
    countActiveStaffByPartner(),
    getStaffStats(),
    listStaffApplications({ status: "pending" }),
  ]);

  const partners = report.rows.filter((r) => r.partnerType === "collaborator");
  const nameOf = (r: MonthlyPartnerRevenue) => adminPartnerName(r, paymentInfo.get(r.partnerId));
  const payable = (r: MonthlyPartnerRevenue) => payableAmount(r.remuneration);

  const counted = partners.filter((r) => r.isActive || payable(r) > 0);
  const distribution = CONTRACT_TIERS.map((tier) => {
    const list = counted.filter((r) => r.tier === tier);
    return { tier, count: list.length, payout: list.reduce((s, r) => s + payable(r), 0) };
  });

  const leaders = partners
    .filter((r) => r.remuneration.revenue > 0)
    .sort((a, b) => b.remuneration.revenue - a.remuneration.revenue)
    .slice(0, 5)
    .map((r) => ({
      partnerId: r.partnerId,
      name: nameOf(r),
      company: paymentInfo.get(r.partnerId)?.legalType === "company",
      tier: r.tier,
      base: r.remuneration.revenue,
      newCustomers: r.breakdown.new.customers,
      staff: staffCounts.get(r.partnerId) ?? 0,
    }));

  const missingInfo = report.rows
    .filter((r) => payable(r) > 0 && missingPaymentFields(paymentInfo.get(r.partnerId)).length > 0)
    .sort((a, b) => payable(b) - payable(a))
    .map((r) => ({ partnerId: r.partnerId, name: nameOf(r), payout: payable(r) }));

  let top: AdminOverview["staff"]["top"] = null;
  for (const [partnerId, count] of staffCounts) {
    if (!top || count > top.count) {
      const row = report.rows.find((r) => r.partnerId === partnerId);
      top = { partnerId, count, name: row ? nameOf(row) : `Đối tác #${partnerId}` };
    }
  }

  return {
    month,
    counts: {
      partners: partners.filter((r) => r.isActive).length,
      salesEmployees: report.rows.filter((r) => r.partnerType === "sales_employee" && r.isActive).length,
    },
    rows: report.rows,
    kpis: overviewKpis(report.rows),
    distribution,
    leaders,
    missingInfo,
    pending: {
      count: pendingApps.length,
      partners: new Set(pendingApps.map((a) => a.partnerId)).size,
      oldest: pendingApps.reduce<Date | null>((min, a) => (!min || a.createdAt < min ? a.createdAt : min), null),
    },
    staff: { ...staffStats, top },
  };
}
