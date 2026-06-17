import { getPool, sql } from "@/lib/db/sql";
import { calcCommissionFromTotal } from "@/lib/commission";
import { getTrendSeries, getTrendSinceDate, type TrendRange } from "@/lib/data/trend";

export type Partner = {
  id: number;
  username: string;
  email: string;
  name: string | null;
  phone: string | null;
  isActive: boolean;
  underDiscountRate: number;
  aboveDiscountRate: number;
  revenueReference: number;
  // Aggregate stats (populated in listPartners, null in getPartner)
  totalRevenue: number;
  totalCommission: number;
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
  IsActive: boolean | null;
  UnderDiscountRate: number | null;
  AboveDiscountRate: number | null;
  RevenueReference: number | null;
  TotalRevenue?: number;
  TotalCommission?: number;
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

  const commission = r.TotalCommission ?? calcCommissionFromTotal(rev);

  return {
    id: r.PartnerId,
    username: r.UserName,
    email: r.Email,
    name: r.Name ?? null,
    phone: r.PhoneNumber ?? null,
    isActive: r.IsActive ?? false,
    underDiscountRate: underRate,
    aboveDiscountRate: aboveRate,
    revenueReference: ref,
    totalRevenue: rev,
    totalCommission: commission,
    customerCount: r.CustomerCount ?? 0,
    couponCount: r.CouponCount ?? 0,
    createdAt: r.CreatedDate ?? null,
  };
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
    const trendPromise = getTrendSeries(numId, range);

    const [statsRes, trendSeries] = await Promise.all([
      getPartnerStats(pool, numId, since, false),
      trendPromise,
    ]);

    const s = statsRes;

    const totalCommission = calcCommissionFromTotal(s.TotalRevenue);

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
    const activePartnerCount = partners.filter((p) => p.isActive).length;
    const since = getTrendSinceDate(range);
    const trendPromise = getTrendSeries(null, range, true);

    const [statsRes, trendSeries] = await Promise.all([
      getPartnerStats(pool, null, since, true),
      trendPromise,
    ]);

    const stats = statsRes;

    return {
      totalRevenue: stats.TotalRevenue,
      totalCommission: calcCommissionFromTotal(stats.TotalRevenue),
      couponCount: stats.TotalCoupons,
      paidCount: stats.PaidCoupons,
      pendingCount: stats.PendingCoupons,
      customerCount: stats.CustomerCount,
      activePartnerCount,
      monthlyTrend: trendSeries.map((p) => ({
        month: p.period,
        revenue: p.revenue,
        commission: p.commission,
      })),
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
