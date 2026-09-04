import { getPool, sql } from "@/lib/db/sql";
import {
  calcCommissionFromTotal,
  calcMonthlyRemuneration,
  normalizePartnerType,
  PARTNER_TYPE_LABELS,
  type PartnerType,
  type RemunerationBreakdown,
} from "@/lib/commission";
import {
  getTrendRowsByPartner,
  getTrendSeries,
  getTrendSinceDate,
  type TrendRange,
} from "@/lib/data/trend";

export type Partner = {
  id: number;
  username: string;
  email: string;
  name: string | null;
  phone: string | null;
  isActive: boolean;
  partnerType: PartnerType;
  partnerTypeLabel: string;
  underDiscountRate: number;
  aboveDiscountRate: number;
  revenueReference: number;
  // Aggregate stats (populated in listPartners, null in getPartner)
  totalRevenue: number;
  totalCommission: number;
  monthlyRevenue: number;
  monthlyRemuneration: RemunerationBreakdown;
  customerCount: number;
  couponCount: number;
  createdAt: Date | null;
};

export type PartnerPerformance = {
  partner: Partner;
  totalRevenue: number;
  totalCommission: number;
  couponCount: number;
  paidCount: number;
  pendingCount: number;
  customerCount: number;
  conversionRate: number;
  monthlyRemuneration: RemunerationBreakdown;
  monthlyTrend: Array<{ month: string; revenue: number; commission: number }>;
};

export type AdminDashboardPerformance = {
  totalRevenue: number;
  totalCommission: number;
  couponCount: number;
  paidCount: number;
  pendingCount: number;
  customerCount: number;
  activePartnerCount: number;
  monthlyTrend: Array<{ month: string; revenue: number; commission: number }>;
};

type PartnerRow = {
  PartnerId: number;
  UserName: string;
  Email: string;
  Name: string | null;
  PhoneNumber: string | null;
  IsActive: boolean | number | null;
  PartnerType?: string | null;
  UnderDiscountRate: number | null;
  AboveDiscountRate: number | null;
  RevenueReference: number | null;
  TotalRevenue?: number;
  TotalCommission?: number;
  MonthlyRevenue?: number;
  CustomerCount?: number;
  CouponCount?: number;
  CreatedDate?: Date | null;
};

type PartnerStatsRow = {
  TotalCoupons: number;
  PaidCoupons: number;
  PendingCoupons: number;
  TotalRevenue: number;
  CustomerCount: number;
};

const EMPTY_STATS: PartnerStatsRow = {
  TotalCoupons: 0,
  PaidCoupons: 0,
  PendingCoupons: 0,
  TotalRevenue: 0,
  CustomerCount: 0,
};

function currentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0),
  };
}

async function getPartnerStats(
  pool: Awaited<ReturnType<typeof getPool>>,
  partnerId: number | null,
  since: Date | null,
  activeOnly: boolean,
): Promise<PartnerStatsRow> {
  try {
    const res = await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .input("Since", sql.DateTime, since)
      .input("ActiveOnly", sql.Bit, activeOnly ? 1 : 0)
      .execute<PartnerStatsRow>("usp_GetPartnerStats");
    return res.recordset[0] ?? EMPTY_STATS;
  } catch (err) {
    // Cho phép app vẫn chạy nếu DB chưa deploy bản procedure có @Since/@ActiveOnly.
    if (partnerId === null || activeOnly) throw err;

    console.warn("[getPartnerStats] Falling back to legacy usp_GetPartnerStats", err);
    const res = await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .execute<PartnerStatsRow>("usp_GetPartnerStats");
    return res.recordset[0] ?? EMPTY_STATS;
  }
}

function mapPartner(r: PartnerRow): Partner {
  const underRate = r.UnderDiscountRate ?? 0;
  const aboveRate = r.AboveDiscountRate ?? 0;
  const ref = r.RevenueReference ?? 0;
  const rev = r.TotalRevenue ?? 0;
  const monthlyRevenue = r.MonthlyRevenue ?? 0;
  const partnerType = normalizePartnerType(r.PartnerType);

  const commission = r.TotalCommission ?? calcCommissionFromTotal(rev, partnerType);

  return {
    id: r.PartnerId,
    username: r.UserName,
    email: r.Email,
    name: r.Name ?? null,
    phone: r.PhoneNumber ?? null,
    isActive: r.IsActive === true || r.IsActive === 1,
    partnerType,
    partnerTypeLabel: PARTNER_TYPE_LABELS[partnerType],
    underDiscountRate: underRate,
    aboveDiscountRate: aboveRate,
    revenueReference: ref,
    totalRevenue: rev,
    totalCommission: commission,
    monthlyRevenue,
    monthlyRemuneration: calcMonthlyRemuneration(monthlyRevenue, partnerType),
    customerCount: r.CustomerCount ?? 0,
    couponCount: r.CouponCount ?? 0,
    createdAt: r.CreatedDate ?? null,
  };
}

async function getPartnerMonthlyRevenue(
  pool: Awaited<ReturnType<typeof getPool>>,
  partnerId: number,
): Promise<number> {
  const { start, end } = currentMonthRange();
  const res = await pool
    .request()
    .input("PartnerId", sql.Int, partnerId)
    .input("StartDate", sql.DateTime, start)
    .input("EndDate", sql.DateTime, end)
    .query<{ MonthlyRevenue: number }>(`
      WITH PaidOrders AS (
        -- Inline của db/views/vw_PaidOrders.sql: đơn IsPaid = 1,
        -- Amount = doanh thu thực thu (đơn nâng cấp chỉ tính phần chênh lệch đã trả).
        SELECT
          o.OrderID, o.OrderDate, o.CouponCode,
          CASE
            WHEN o.UpgradeAmount IS NOT NULL OR upg.Amount IS NOT NULL
              THEN ROUND(ISNULL(o.UpgradeAmount, 0) + ISNULL(upg.Amount, 0), 0)
            ELSE ISNULL(pkg.Amount, 0)
          END AS Amount
        FROM [EStocks_Data].[dbo].[service_Orders] o
        LEFT JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = o.PackageID
        OUTER APPLY (
          SELECT SUM(up.Amount) AS Amount
          FROM [EStocks_Data].[dbo].[service_Upgrades] up
          WHERE up.OrderID = o.OrderID
        ) upg
        WHERE o.IsPaid = 1
      ),
      PaidOrderIds AS (
        SELECT
          cp.CouponID,
          MAX(so.OrderID) AS OrderID
        FROM Coupons cp
        INNER JOIN PaidOrders so ON so.CouponCode = cp.CouponCode
        WHERE cp.PartnerId = @PartnerId
          AND cp.IsUsed = 1
        GROUP BY cp.CouponID
      )
      SELECT ISNULL(SUM(o.Amount), 0) AS MonthlyRevenue
      FROM Coupons cp
      INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
      INNER JOIN PaidOrders o     ON o.OrderID    = poi.OrderID
      WHERE cp.PartnerId = @PartnerId
        AND o.OrderDate >= @StartDate
        AND o.OrderDate < @EndDate;
    `);

  return res.recordset[0]?.MonthlyRevenue ?? 0;
}

export async function listPartners(): Promise<Partner[]> {
  try {
    const pool = await getPool();
    const res = await pool.request().execute<PartnerRow>("usp_ListPartners");
    return res.recordset.map(mapPartner);
  } catch (err) {
    console.error("[listPartners]", err);
    return [];
  }
}

export async function getPartner(id: number | string): Promise<Partner | null> {
  const numId = typeof id === "string" ? parseInt(id, 10) : id;
  if (isNaN(numId)) return null;

  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("PartnerId", sql.Int, numId)
      .execute<PartnerRow>("usp_GetPartner");
    return res.recordset[0] ? mapPartner(res.recordset[0]) : null;
  } catch (err) {
    console.error("[getPartner]", err);
    return null;
  }
}

export async function getPartnerPerformance(
  partnerId: number | string,
  range: TrendRange = "ALL",
): Promise<PartnerPerformance | null> {
  const numId = typeof partnerId === "string" ? parseInt(partnerId, 10) : partnerId;
  if (isNaN(numId)) return null;

  try {
    const [partner, pool] = await Promise.all([getPartner(numId), getPool()]);
    if (!partner) return null;

    const since = getTrendSinceDate(range);

    const [statsRes, trendSeries, monthlyRevenue] = await Promise.all([
      getPartnerStats(pool, numId, since, false),
      getTrendSeries(numId, range, false, partner.partnerType),
      getPartnerMonthlyRevenue(pool, numId),
    ]);

    const s = statsRes;

    const totalCommission = calcCommissionFromTotal(s.TotalRevenue, partner.partnerType);
    const monthlyRemuneration = calcMonthlyRemuneration(monthlyRevenue, partner.partnerType);

    const monthlyTrend = trendSeries.map((p) => ({
      month: p.period,
      revenue: p.revenue,
      commission: p.commission,
    }));

    return {
      partner,
      totalRevenue: s.TotalRevenue,
      totalCommission,
      couponCount: s.TotalCoupons,
      paidCount: s.PaidCoupons,
      pendingCount: s.PendingCoupons,
      customerCount: s.CustomerCount,
      conversionRate: s.TotalCoupons > 0 ? (s.PaidCoupons / s.TotalCoupons) * 100 : 0,
      monthlyRemuneration,
      monthlyTrend,
    };
  } catch (err) {
    console.error("[getPartnerPerformance]", err);
    return null;
  }
}

/**
 * Số liệu dashboard admin cho một khung thời gian.
 *
 * Hoa hồng tính theo bậc của TỪNG partner nên không thể lấy từ doanh thu tổng —
 * cần doanh thu từng partner trong khung thời gian. Trước đây mỗi partner tốn
 * 2 stored procedure (stats + trend) → 1 + 2N lượt gọi (67 lượt với 33 partner).
 * Giờ chỉ 2 truy vấn: stats toàn cục + trend theo (partner, period); doanh thu
 * từng partner suy ra bằng cách cộng trend của partner đó (cùng bộ lọc).
 *
 * @param preloadedPartners Danh sách partner nếu trang đã tải sẵn, tránh gọi
 *   usp_ListPartners (nặng nhất trong các SP) hai lần trong một request.
 */
export async function getAdminDashboardPerformance(
  range: TrendRange,
  preloadedPartners?: Partner[],
): Promise<AdminDashboardPerformance> {
  try {
    const [pool, partners] = await Promise.all([
      getPool(),
      preloadedPartners ?? listPartners(),
    ]);
    const activePartners = partners.filter((p) => p.isActive);
    const since = getTrendSinceDate(range);

    const [stats, trendRows] = await Promise.all([
      getPartnerStats(pool, null, since, true),
      getTrendRowsByPartner(null, range, true),
    ]);

    const typeByPartnerId = new Map<number, PartnerType>(
      activePartners.map((p) => [p.id, p.partnerType]),
    );
    const revenueByPartnerId = new Map<number, number>();
    const trendByPeriod = new Map<string, { month: string; revenue: number; commission: number }>();

    for (const row of trendRows) {
      const partnerType = typeByPartnerId.get(row.partnerId);
      // Partner không có trong danh sách (đã xoá/không còn active) → bỏ qua,
      // giống hành vi cũ chỉ lặp qua activePartners.
      if (!partnerType) continue;

      revenueByPartnerId.set(
        row.partnerId,
        (revenueByPartnerId.get(row.partnerId) ?? 0) + row.revenue,
      );

      if (row.period === null) continue;
      const commission = calcCommissionFromTotal(row.revenue, partnerType);
      const existing = trendByPeriod.get(row.period);
      if (existing) {
        existing.revenue += row.revenue;
        existing.commission += commission;
      } else {
        trendByPeriod.set(row.period, { month: row.period, revenue: row.revenue, commission });
      }
    }

    let totalCommission = 0;
    for (const [partnerId, revenue] of revenueByPartnerId) {
      totalCommission += calcCommissionFromTotal(revenue, typeByPartnerId.get(partnerId)!);
    }

    return {
      totalRevenue: stats.TotalRevenue,
      totalCommission,
      couponCount: stats.TotalCoupons,
      paidCount: stats.PaidCoupons,
      pendingCount: stats.PendingCoupons,
      customerCount: stats.CustomerCount,
      activePartnerCount: activePartners.length,
      monthlyTrend: Array.from(trendByPeriod.values()).sort((a, b) =>
        a.month.localeCompare(b.month),
      ),
    };
  } catch (err) {
    console.error("[getAdminDashboardPerformance]", err);
    return {
      totalRevenue: 0,
      totalCommission: 0,
      couponCount: 0,
      paidCount: 0,
      pendingCount: 0,
      customerCount: 0,
      activePartnerCount: 0,
      monthlyTrend: [],
    };
  }
}
