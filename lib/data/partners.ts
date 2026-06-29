import { getPool, sql } from "@/lib/db/sql";
import {
  calcCommissionFromTotal,
  calcMonthlyRemuneration,
  normalizePartnerType,
  PARTNER_TYPE_LABELS,
  type PartnerType,
  type RemunerationBreakdown,
} from "@/lib/commission";
import { getTrendSeries, getTrendSinceDate, type TrendRange } from "@/lib/data/trend";

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
      WITH PaidOrderIds AS (
        SELECT
          cp.CouponID,
          MAX(so.OrderID) AS OrderID
        FROM Coupons cp
        INNER JOIN [EStocks_Data].[dbo].[service_Orders] so
          ON so.CouponCode = cp.CouponCode
         AND so.Status = 1
        WHERE cp.PartnerId = @PartnerId
          AND cp.IsUsed = 1
        GROUP BY cp.CouponID
      )
      SELECT ISNULL(SUM(pkg.Amount), 0) AS MonthlyRevenue
      FROM Coupons cp
      INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
      INNER JOIN [EStocks_Data].[dbo].[service_Orders] o ON o.OrderID = poi.OrderID
      LEFT JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID = pkg.PackageID
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

export async function getAdminDashboardPerformance(
  range: TrendRange,
): Promise<AdminDashboardPerformance> {
  try {
    const [pool, partners] = await Promise.all([getPool(), listPartners()]);
    const activePartners = partners.filter((p) => p.isActive);
    const activePartnerCount = activePartners.length;
    const since = getTrendSinceDate(range);

    const partnerStatsPromise = Promise.all(
      activePartners.map(async (partner) => {
        const stats = await getPartnerStats(pool, partner.id, since, false);
        return {
          partner,
          commission: calcCommissionFromTotal(stats.TotalRevenue, partner.partnerType),
        };
      }),
    );

    const partnerTrendPromise = Promise.all(
      activePartners.map((partner) =>
        getTrendSeries(partner.id, range, false, partner.partnerType),
      ),
    );

    const [statsRes, partnerStats, partnerTrendSeries] = await Promise.all([
      getPartnerStats(pool, null, since, true),
      partnerStatsPromise,
      partnerTrendPromise,
    ]);

    const stats = statsRes;
    const trendByPeriod = new Map<string, { month: string; revenue: number; commission: number }>();
    for (const series of partnerTrendSeries) {
      for (const point of series) {
        const existing = trendByPeriod.get(point.period);
        if (existing) {
          existing.revenue += point.revenue;
          existing.commission += point.commission;
        } else {
          trendByPeriod.set(point.period, {
            month: point.period,
            revenue: point.revenue,
            commission: point.commission,
          });
        }
      }
    }

    return {
      totalRevenue: stats.TotalRevenue,
      totalCommission: partnerStats.reduce((sum, p) => sum + p.commission, 0),
      couponCount: stats.TotalCoupons,
      paidCount: stats.PaidCoupons,
      pendingCount: stats.PendingCoupons,
      customerCount: stats.CustomerCount,
      activePartnerCount,
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
