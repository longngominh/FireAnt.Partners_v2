import { getPool, sql } from "@/lib/db/sql";
import { calcCommissionFromTotal } from "@/lib/commission";

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
    isActive: r.IsActive ?? true,
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
    const res = await pool.request().query<PartnerRow>(`
      SELECT
        p.PartnerId,
        i.UserName, i.Email, i.Name, i.PhoneNumber,
        p.IsActive,
        po.UnderDiscountRate, po.AboveDiscountRate, po.RevenueReference,
        ISNULL(stats.TotalRevenue,  0) AS TotalRevenue,
        ISNULL(stats.CouponCount,   0) AS CouponCount,
        ISNULL(stats.CustomerCount, 0) AS CustomerCount
      FROM Partners p
      LEFT  JOIN Policies po                             ON p.PolicyId = po.PolicyId
      INNER JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i ON p.UserId  = i.Id
      LEFT JOIN (
        SELECT
          cp.PartnerId,
          ISNULL(SUM(CASE WHEN cp.IsUsed = 1 THEN pkg.Amount ELSE 0 END), 0)  AS TotalRevenue,
          COUNT(*)                                                             AS CouponCount,
          COUNT(DISTINCT CASE WHEN cp.IsUsed = 1 THEN o.UserName END)         AS CustomerCount
        FROM  Coupons cp
        LEFT  JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
        LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
        GROUP BY cp.PartnerId
      ) stats ON p.PartnerId = stats.PartnerId
      ORDER BY p.PartnerId
    `);
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
      .input("id", sql.Int, numId)
      .query<PartnerRow>(`
        SELECT
          p.PartnerId,
          i.UserName, i.Email, i.Name, i.PhoneNumber,
          p.IsActive,
          po.UnderDiscountRate, po.AboveDiscountRate, po.RevenueReference
        FROM   Partners p
        LEFT  JOIN Policies po                              ON p.PolicyId = po.PolicyId
        INNER JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i ON p.UserId   = i.Id
        WHERE  p.PartnerId = @id
      `);
    return res.recordset[0] ? mapPartner(res.recordset[0]) : null;
  } catch (err) {
    console.error("[getPartner]", err);
    return null;
  }
}

export async function getPartnerPerformance(
  partnerId: number | string,
): Promise<PartnerPerformance | null> {
  const numId = typeof partnerId === "string" ? parseInt(partnerId, 10) : partnerId;
  if (isNaN(numId)) return null;

  try {
  const partner = await getPartner(numId);
  if (!partner) return null;

  const pool = await getPool();

  // Aggregate stats
  type StatsRow = {
    TotalCoupons: number;
    PaidCoupons: number;
    PendingCoupons: number;
    TotalRevenue: number;
    CustomerCount: number;
  };
  const statsRes = await pool
    .request()
    .input("partnerId", sql.Int, numId)
    .query<StatsRow>(`
      SELECT
        COUNT(*)                                                                         AS TotalCoupons,
        SUM(CASE WHEN cp.IsUsed = 1 THEN 1 ELSE 0 END)                                              AS PaidCoupons,
        SUM(CASE WHEN cp.IsUsed = 0 AND o.OrderID IS NULL AND cp.ExpireDate >= GETDATE() THEN 1 ELSE 0 END) AS PendingCoupons,
        ISNULL(SUM(CASE WHEN cp.IsUsed = 1 THEN pkg.Amount ELSE 0 END), 0)                AS TotalRevenue,
        COUNT(DISTINCT CASE WHEN cp.IsUsed = 1 THEN o.UserName END)                       AS CustomerCount
      FROM  Coupons cp
      LEFT  JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
      LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
      WHERE cp.PartnerId = @partnerId
    `);

  const s = statsRes.recordset[0] ?? {
    TotalCoupons: 0,
    PaidCoupons: 0,
    PendingCoupons: 0,
    TotalRevenue: 0,
    CustomerCount: 0,
  };

  // Monthly trend (last 6 months)
  type TrendRow = { Month: string; Revenue: number };
  const trendRes = await pool
    .request()
    .input("partnerId", sql.Int, numId)
    .query<TrendRow>(`
      SELECT TOP 6
        FORMAT(o.OrderDate, 'yyyy-MM') AS Month,
        SUM(pkg.Amount)                AS Revenue
      FROM  Coupons cp
      INNER JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
      LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
      WHERE cp.PartnerId = @partnerId
        AND cp.IsUsed    = 1
      GROUP BY FORMAT(o.OrderDate, 'yyyy-MM')
      ORDER BY Month DESC
    `);

  const totalCommission = calcCommissionFromTotal(s.TotalRevenue);

  const monthlyTrend = trendRes.recordset
    .reverse()
    .map((r) => ({
      month: r.Month,
      revenue: r.Revenue,
      commission: calcCommissionFromTotal(r.Revenue),
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
