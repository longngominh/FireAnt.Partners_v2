import { getPool, sql } from "@/lib/db/sql";
import {
  calcCommissionFromTotal,
  currentMonthRange,
} from "@/lib/commission";

export type DashboardStats = {
  /** Hoa hồng đã nhận tháng này (bracket model, monthly reset). */
  netReceived: number;
  /** Ước tính hoa hồng nếu tất cả pending coupon được thanh toán trong tháng. */
  pendingAmount: number;
  /** Doanh số gốc đang chờ thanh toán (chưa phải hoa hồng). */
  pendingRevenue: number;
  /** Doanh thu tháng này (các coupon đã được thanh toán). */
  totalRevenue: number;
  /** Tổng coupon đã tạo (all-time). */
  couponsCreated: number;
  /** Coupon đã thanh toán tháng này (dùng cho hero tile hint). */
  couponsPaid: number;
  /** Coupon đã thanh toán all-time (dùng cho conversionRate). */
  allTimePaid: number;
  /** Số email khách duy nhất tháng này. */
  customersServed: number;
  /** Tỷ lệ thanh toán: all-time paid / all-time created. */
  conversionRate: number;
  monthlySeries: Array<{ month: string; revenue: number; commission: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
};

const EMPTY_STATS: DashboardStats = {
  netReceived: 0,
  pendingAmount: 0,
  pendingRevenue: 0,
  totalRevenue: 0,
  couponsCreated: 0,
  couponsPaid: 0,
  allTimePaid: 0,
  customersServed: 0,
  conversionRate: 0,
  monthlySeries: [],
  statusBreakdown: [],
};

export async function getDashboardStats(
  partnerId?: string | number | null,
): Promise<DashboardStats> {
  try {
    const numPartnerId =
      partnerId !== null && partnerId !== undefined
        ? typeof partnerId === "string"
          ? parseInt(partnerId, 10)
          : partnerId
        : null;

    const validPartnerId = numPartnerId !== null && !isNaN(numPartnerId) ? numPartnerId : null;

    const pool = await getPool();
    const { start: monthStart, end: monthEnd } = currentMonthRange();

    // ─── 1. Stats tháng hiện tại ──────────────────────────────────────────────
    type MonthStatsRow = { PaidLinks: number; TotalRevenue: number; Customers: number };
    const monthRes = await pool
      .request()
      .input("PartnerId",  sql.Int,      validPartnerId)
      .input("MonthStart", sql.DateTime, monthStart)
      .input("MonthEnd",   sql.DateTime, monthEnd)
      .execute<MonthStatsRow>("usp_GetDashboardMonthStats");

    const m = monthRes.recordset[0] ?? { PaidLinks: 0, TotalRevenue: 0, Customers: 0 };

    // ─── 2. Tổng coupon all-time ──────────────────────────────────────────────
    type AllStatsRow = {
      GeneratedLinks: number;
      PaidLinks: number;
      PendingLinks: number;
      ExpiredLinks: number;
    };
    const allRes = await pool
      .request()
      .input("PartnerId", sql.Int, validPartnerId)
      .execute<AllStatsRow>("usp_GetDashboardAllStats");

    const a = allRes.recordset[0] ?? { GeneratedLinks: 0, PaidLinks: 0, PendingLinks: 0, ExpiredLinks: 0 };

    // ─── 3. Doanh số pending ─────────────────────────────────────────────────
    type PendingRow = { PendingRevenue: number };
    const pendingRes = await pool
      .request()
      .input("PartnerId", sql.Int, validPartnerId)
      .execute<PendingRow>("usp_GetDashboardPendingRevenue");

    const pendingRevenue = pendingRes.recordset[0]?.PendingRevenue ?? 0;

    // ─── 4. Monthly trend — 6 tháng gần nhất ────────────────────────────────
    const since = new Date(Date.now() - 180 * 86_400_000);
    type TrendRow = { Month: string; Revenue: number };
    const trendRes = await pool
      .request()
      .input("PartnerId", sql.Int,      validPartnerId)
      .input("Since",     sql.DateTime, since)
      .execute<TrendRow>("usp_GetDashboardTrend");

    const monthlySeries = trendRes.recordset.map((r) => ({
      month: r.Month,
      revenue: r.Revenue,
      commission: calcCommissionFromTotal(r.Revenue),
    }));

    // ─── Tổng hợp ────────────────────────────────────────────────────────────
    const totalRevenue = m.TotalRevenue;
    const netReceived = calcCommissionFromTotal(totalRevenue);

    const pendingAmount = Math.max(
      0,
      calcCommissionFromTotal(totalRevenue + pendingRevenue) - netReceived,
    );

    const conversionRate =
      a.GeneratedLinks > 0 ? (a.PaidLinks / a.GeneratedLinks) * 100 : 0;

    return {
      netReceived,
      pendingAmount,
      pendingRevenue,
      totalRevenue,
      couponsCreated: a.GeneratedLinks,
      couponsPaid: m.PaidLinks,
      allTimePaid: a.PaidLinks,
      customersServed: m.Customers,
      conversionRate,
      monthlySeries,
      statusBreakdown: [
        { status: "PAID",    count: a.PaidLinks },
        { status: "PENDING", count: a.PendingLinks },
        { status: "EXPIRED", count: a.ExpiredLinks },
      ],
    };
  } catch (err) {
    console.error("[getDashboardStats]", err);
    return EMPTY_STATS;
  }
}
