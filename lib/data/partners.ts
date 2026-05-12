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
): Promise<PartnerPerformance | null> {
  const numId = typeof partnerId === "string" ? parseInt(partnerId, 10) : partnerId;
  if (isNaN(numId)) return null;

  try {
    const partner = await getPartner(numId);
    if (!partner) return null;

    const pool = await getPool();

    type StatsRow = {
      TotalCoupons: number;
      PaidCoupons: number;
      PendingCoupons: number;
      TotalRevenue: number;
      CustomerCount: number;
    };
    const statsRes = await pool
      .request()
      .input("PartnerId", sql.Int, numId)
      .execute<StatsRow>("usp_GetPartnerStats");

    const s = statsRes.recordset[0] ?? {
      TotalCoupons: 0,
      PaidCoupons: 0,
      PendingCoupons: 0,
      TotalRevenue: 0,
      CustomerCount: 0,
    };

    type TrendRow = { Month: string; Revenue: number };
    const trendRes = await pool
      .request()
      .input("PartnerId", sql.Int, numId)
      .execute<TrendRow>("usp_GetPartnerTrend");

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
