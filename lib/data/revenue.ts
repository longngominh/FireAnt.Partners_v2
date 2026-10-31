import { getPool, sql } from "@/lib/db/sql";
import {
  calcPartnerRemuneration,
  normalizePartnerType,
  PARTNER_STAFF_TYPE,
  PARTNER_TYPE_LABELS,
  type ContractTier,
  type PartnerType,
  type RemunerationBreakdown,
} from "@/lib/commission";
import { getContractsForMonth, tierInMonth } from "@/lib/data/contracts";
import {
  emptyBreakdown,
  getRevenueBreakdowns,
  getSellerBreakdowns,
  listClassifiedOrders,
  mergeBreakdowns,
  otherRevenue,
  remunerationBase,
  type OrderKind,
  type RevenueBreakdown,
} from "@/lib/data/revenue-breakdown";
import { monthRange, normalizeMonthKey, shiftMonth, type MonthKey } from "@/lib/utils/month";

export type MonthlyPartnerRevenue = {
  partnerId: number;
  username: string;
  email: string;
  name: string | null;
  phone: string | null;
  isActive: boolean;
  partnerType: PartnerType;
  partnerTypeLabel: string;
  /** Toàn bộ doanh số qua link trong tháng (mọi loại đơn). */
  revenue: number;
  /** Doanh số khách mua gói hội viên lần đầu — căn cứ tính thù lao theo phụ lục. */
  newCustomerRevenue: number;
  /** Doanh số qua link của chính đối tác / của nhân viên trong thời gian được ghi nhận. */
  directRevenue: number;
  staffRevenue: number;
  /** Phụ lục áp dụng cho tháng. */
  tier: ContractTier;
  /** Gia hạn + nâng cấp + khóa học + khác — chưa tính thù lao theo hạng. */
  otherRevenue: number;
  breakdown: RevenueBreakdown;
  orderCount: number;
  customerCount: number;
  lastOrderAt: Date | null;
  remuneration: RemunerationBreakdown;
};

export type MonthlyRevenueTotals = {
  partnerCount: number;
  revenue: number;
  newCustomerRevenue: number;
  otherRevenue: number;
  baseSalary: number;
  commission: number;
  performanceBonus: number;
  remuneration: number;
  orderCount: number;
  customerCount: number;
};

export type MonthlyRevenueReport = {
  month: MonthKey;
  start: Date;
  end: Date;
  rows: MonthlyPartnerRevenue[];
  totals: MonthlyRevenueTotals;
};

type ProfileRow = {
  PartnerId: number;
  UserName: string;
  Email: string;
  Name: string | null;
  PhoneNumber: string | null;
  IsActive: boolean | number | null;
  PartnerType: string | null;
};

export type PartnerProfile = {
  partnerId: number;
  username: string;
  email: string;
  name: string | null;
  phone: string | null;
  isActive: boolean;
  partnerType: PartnerType;
};

/**
 * Thông tin cơ bản của người được FireAnt chi trả: đối tác (CTV) và NVKD, kèm email/tên/SĐT
 * trên tài khoản FireAnt. Nhân viên của đối tác không có dòng riêng.
 */
export async function listPartnerProfiles(partnerId: number | null = null): Promise<PartnerProfile[]> {
  const pool = await getPool();
  const res = await pool
    .request()
    .input("PartnerId", sql.Int, partnerId)
    .input("StaffType", sql.NVarChar(32), PARTNER_STAFF_TYPE)
    .query<ProfileRow>(`
      SELECT p.PartnerId, i.UserName, i.Email, i.Name, i.PhoneNumber, p.IsActive, p.PartnerType
      FROM Partners p
      INNER JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i ON p.UserName = i.UserName
      WHERE (@PartnerId IS NULL OR p.PartnerId = @PartnerId)
        AND ISNULL(p.PartnerType, N'') <> @StaffType;
    `);
  return res.recordset.map((r) => ({
    partnerId: r.PartnerId,
    username: r.UserName,
    email: r.Email,
    name: r.Name ?? null,
    phone: r.PhoneNumber ?? null,
    isActive: r.IsActive === true || r.IsActive === 1,
    partnerType: normalizePartnerType(r.PartnerType),
  }));
}

export type SplitBreakdown = { direct: RevenueBreakdown; staff: RevenueBreakdown };

export function buildMonthlyRow(
  profile: PartnerProfile,
  split: SplitBreakdown,
  tier: ContractTier,
): MonthlyPartnerRevenue {
  const breakdown = mergeBreakdowns(split.direct, split.staff);
  return {
    ...profile,
    partnerTypeLabel: PARTNER_TYPE_LABELS[profile.partnerType],
    revenue: breakdown.total.revenue,
    newCustomerRevenue: breakdown.new.revenue,
    otherRevenue: otherRevenue(breakdown),
    directRevenue: split.direct.total.revenue,
    staffRevenue: split.staff.total.revenue,
    tier,
    breakdown,
    orderCount: breakdown.total.orders,
    customerCount: breakdown.total.customers,
    lastOrderAt: breakdown.lastOrderAt,
    remuneration: calcPartnerRemuneration(profile.partnerType, tier, remunerationBase(breakdown)),
  };
}

/** Gom kết quả theo người bán thành (trực tiếp, từ nhân viên) cho từng đối tác của một tháng. */
export async function getSplitBreakdowns(
  month: MonthKey,
  partnerId: number | null = null,
): Promise<Map<number, SplitBreakdown>> {
  const { start, end } = monthRange(month);
  const rows = await getSellerBreakdowns({ start, end, partnerId });
  const result = new Map<number, SplitBreakdown>();
  for (const row of rows) {
    if (row.month !== month) continue;
    const split = result.get(row.partnerId) ?? { direct: emptyBreakdown(), staff: emptyBreakdown() };
    if (row.sellerId === row.partnerId) split.direct = mergeBreakdowns(split.direct, row.breakdown);
    else split.staff = mergeBreakdowns(split.staff, row.breakdown);
    result.set(row.partnerId, split);
  }
  return result;
}

/** Cộng dồn một tập dòng bất kỳ — dùng lại được sau khi lọc ở phía trang. */
export function sumMonthlyTotals(rows: MonthlyPartnerRevenue[]): MonthlyRevenueTotals {
  return rows.reduce<MonthlyRevenueTotals>(
    (acc, row) => ({
      partnerCount: acc.partnerCount + 1,
      revenue: acc.revenue + row.revenue,
      newCustomerRevenue: acc.newCustomerRevenue + row.newCustomerRevenue,
      otherRevenue: acc.otherRevenue + row.otherRevenue,
      baseSalary: acc.baseSalary + row.remuneration.baseSalary,
      commission: acc.commission + row.remuneration.commission,
      performanceBonus: acc.performanceBonus + row.remuneration.performanceBonus,
      remuneration: acc.remuneration + row.remuneration.total,
      orderCount: acc.orderCount + row.orderCount,
      customerCount: acc.customerCount + row.customerCount,
    }),
    {
      partnerCount: 0,
      revenue: 0,
      newCustomerRevenue: 0,
      otherRevenue: 0,
      baseSalary: 0,
      commission: 0,
      performanceBonus: 0,
      remuneration: 0,
      orderCount: 0,
      customerCount: 0,
    },
  );
}

export type MonthlyPaidOrder = {
  partnerId: number;
  /** Người bán: chính đối tác hoặc nhân viên của đối tác. */
  sellerId: number;
  orderId: number;
  orderDate: Date;
  couponCode: string | null;
  customerUserName: string | null;
  packageName: string | null;
  /** Giá niêm yết của gói — để đối chiếu với doanh thu thực thu của đơn nâng cấp. */
  listAmount: number;
  amount: number;
  kind: OrderKind;
};

/**
 * Từng đơn đã thanh toán của mọi CTV trong tháng (đã phân loại) — cùng cách chọn đơn
 * với getMonthlyRevenueReport nên tổng theo CTV khớp cột Doanh số của bảng kê.
 * Dùng cho sheet "Bảng kê đơn hàng" của giấy đề nghị thanh toán.
 */
export async function listMonthlyPaidOrders(month: MonthKey): Promise<MonthlyPaidOrder[]> {
  const { start, end } = monthRange(normalizeMonthKey(month));
  const orders = await listClassifiedOrders({ start, end });
  return orders
    .map((o) => ({
      partnerId: o.partnerId,
      sellerId: o.sellerId,
      orderId: o.orderId,
      orderDate: o.orderDate,
      couponCode: o.couponCode,
      customerUserName: o.customerUserName,
      packageName: o.packageName,
      listAmount: o.listAmount,
      amount: o.amount,
      kind: o.kind,
    }))
    .sort(
      (a, b) =>
        a.partnerId - b.partnerId ||
        a.orderDate.getTime() - b.orderDate.getTime() ||
        a.orderId - b.orderId,
    );
}

/**
 * Doanh số, phụ lục và thù lao của từng người được FireAnt chi trả trong 1 tháng.
 *
 * Doanh số quy về tháng theo OrderDate của đơn đã thanh toán, gồm doanh số của nhân viên
 * trong thời gian được ghi nhận. Thù lao theo phụ lục áp dụng cho tháng đó.
 */
export async function getMonthlyRevenueReport({
  month,
  partnerId = null,
}: {
  month: MonthKey;
  partnerId?: number | null;
}): Promise<MonthlyRevenueReport> {
  const normalizedMonth = normalizeMonthKey(month);
  const { start, end } = monthRange(normalizedMonth);

  try {
    const [profiles, splits, contracts] = await Promise.all([
      listPartnerProfiles(partnerId),
      getSplitBreakdowns(normalizedMonth, partnerId),
      getContractsForMonth(normalizedMonth, partnerId),
    ]);
    const empty: SplitBreakdown = { direct: emptyBreakdown(), staff: emptyBreakdown() };
    const rows = profiles
      .map((profile) =>
        buildMonthlyRow(
          profile,
          splits.get(profile.partnerId) ?? empty,
          contracts.get(profile.partnerId)?.tier ?? "normal",
        ),
      )
      .sort((a, b) => b.revenue - a.revenue || a.partnerId - b.partnerId);
    return { month: normalizedMonth, start, end, rows, totals: sumMonthlyTotals(rows) };
  } catch (err) {
    console.error("[getMonthlyRevenueReport]", err);
    return { month: normalizedMonth, start, end, rows: [], totals: sumMonthlyTotals([]) };
  }
}

export type PartnerMonthHistory = {
  month: MonthKey;
  breakdown: RevenueBreakdown;
  tier: ContractTier;
  remuneration: RemunerationBreakdown;
};

/** `count` tháng gần nhất tính tới `lastMonth` (cũ → mới), kể cả tháng không có đơn. */
export function recentMonths(lastMonth: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(lastMonth, i - count + 1));
}

/**
 * Lịch sử doanh số/phụ lục/thù lao từng tháng. partnerId null → mọi đối tác
 * (Map theo partnerId), dùng một truy vấn cho cả khoảng thời gian.
 */
export async function getMonthlyHistory(params: {
  months: MonthKey[];
  partnerId?: number | null;
  partnerTypes: Map<number, PartnerType>;
  tiers: Map<number, Map<MonthKey, ContractTier>>;
}): Promise<Map<number, PartnerMonthHistory[]>> {
  const { months, partnerId = null, partnerTypes, tiers } = params;
  const result = new Map<number, PartnerMonthHistory[]>();
  if (months.length === 0) return result;

  const start = monthRange(months[0]).start;
  const end = monthRange(months[months.length - 1]).end;
  const rows = await getRevenueBreakdowns({ start, end, partnerId });

  const byKey = new Map(rows.map((r) => [`${r.partnerId}|${r.month}`, r.breakdown]));
  const partnerIds = partnerId !== null ? [partnerId] : Array.from(partnerTypes.keys());
  for (const id of partnerIds) {
    const type = partnerTypes.get(id) ?? "collaborator";
    result.set(
      id,
      months.map((month) => {
        const breakdown = byKey.get(`${id}|${month}`) ?? emptyBreakdown();
        const tier = tierInMonth(tiers, id, month);
        return {
          month,
          breakdown,
          tier,
          remuneration: calcPartnerRemuneration(type, tier, remunerationBase(breakdown)),
        };
      }),
    );
  }
  return result;
}
