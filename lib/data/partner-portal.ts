import {
  calcPartnerRemuneration,
  type ContractTier,
  type PartnerType,
  type RemunerationBreakdown,
} from "@/lib/commission";
import { getContractTierHistory, tierInMonth } from "@/lib/data/contracts";
import {
  emptyBreakdown,
  getOwnSalesBreakdowns,
  getSellerBreakdowns,
  mergeBreakdowns,
  remunerationBase,
  type RevenueBreakdown,
} from "@/lib/data/revenue-breakdown";
import { listStaffMembers, type StaffMember } from "@/lib/data/staff";
import { monthRange, recentMonthKeys, type MonthKey } from "@/lib/utils/month";

/**
 * Số liệu cổng bán hàng theo tháng: đối tác (trực tiếp + nhân viên, thù lao theo phụ lục của
 * từng tháng) và nhân viên (doanh số do chính mình tạo ra).
 */

export type PartnerMonth = {
  month: MonthKey;
  tier: ContractTier;
  direct: RevenueBreakdown;
  staff: RevenueBreakdown;
  total: RevenueBreakdown;
  remuneration: RemunerationBreakdown;
};

export type StaffMonthStats = {
  staffPartnerId: number;
  breakdown: RevenueBreakdown;
};

export type PartnerPortalData = {
  months: PartnerMonth[];
  current: PartnerMonth;
  members: StaffMember[];
  /** Doanh số từng nhân viên trong tháng hiện tại (chỉ phần tính cho đối tác). */
  staffThisMonth: Map<number, RevenueBreakdown>;
};

/** `count` tháng gần nhất (cũ → mới) của một đối tác, tháng cuối là `lastMonth`. */
export async function getPartnerMonths(params: {
  partnerId: number;
  partnerType: PartnerType;
  lastMonth: MonthKey;
  count: number;
}): Promise<PartnerPortalData> {
  const { partnerId, partnerType, lastMonth, count } = params;
  const months = recentMonthKeys(lastMonth, count);
  const start = monthRange(months[0]).start;
  const end = monthRange(lastMonth).end;
  const [rows, tiers, members] = await Promise.all([
    getSellerBreakdowns({ start, end, partnerId }),
    getContractTierHistory(months, partnerId),
    listStaffMembers(partnerId),
  ]);

  const result: PartnerMonth[] = months.map((month) => {
    let direct = emptyBreakdown();
    let staff = emptyBreakdown();
    for (const row of rows) {
      if (row.month !== month || row.partnerId !== partnerId) continue;
      if (row.sellerId === partnerId) direct = mergeBreakdowns(direct, row.breakdown);
      else staff = mergeBreakdowns(staff, row.breakdown);
    }
    const total = mergeBreakdowns(direct, staff);
    const tier = tierInMonth(tiers, partnerId, month);
    return {
      month,
      tier,
      direct,
      staff,
      total,
      remuneration: calcPartnerRemuneration(partnerType, tier, remunerationBase(total)),
    };
  });

  const staffThisMonth = new Map<number, RevenueBreakdown>();
  for (const row of rows) {
    if (row.month === lastMonth && row.sellerId !== partnerId) {
      staffThisMonth.set(row.sellerId, mergeBreakdowns(staffThisMonth.get(row.sellerId) ?? emptyBreakdown(), row.breakdown));
    }
  }

  return { months: result, current: result[result.length - 1], members, staffThisMonth };
}

export type OwnSalesMonth = { month: MonthKey; breakdown: RevenueBreakdown };

/** Doanh số do một người bán tạo ra trong `count` tháng gần nhất (cũ → mới). */
export async function getOwnSalesMonths(sellerId: number, lastMonth: MonthKey, count: number): Promise<OwnSalesMonth[]> {
  const months = recentMonthKeys(lastMonth, count);
  const rows = await getOwnSalesBreakdowns({
    start: monthRange(months[0]).start,
    end: monthRange(lastMonth).end,
    sellerId,
  });
  const byMonth = new Map(rows.map((r) => [r.month, r.breakdown]));
  return months.map((month) => ({ month, breakdown: byMonth.get(month) ?? emptyBreakdown() }));
}
