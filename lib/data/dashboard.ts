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

    const isFiltered = numPartnerId !== null && !isNaN(numPartnerId);
    const partnerClause = isFiltered ? "cp.PartnerId = @partnerId" : "1=1";

    const pool = await getPool();
    const { start: monthStart, end: monthEnd } = currentMonthRange();

    // ─── 1. Stats tháng hiện tại (cho netReceived, totalRevenue, couponsPaid) ───
    const monthReq = pool
      .request()
      .input("monthStart", sql.DateTime, monthStart)
      .input("monthEnd",   sql.DateTime, monthEnd);
    if (isFiltered) monthReq.input("partnerId", sql.Int, numPartnerId);

    type MonthStatsRow = {
      PaidLinks: number;
      TotalRevenue: number;
      Customers: number;
    };

    const monthRes = await monthReq.query<MonthStatsRow>(`
      SELECT
        COUNT(*)                                          AS PaidLinks,
        ISNULL(SUM(pkg.Amount), 0)                        AS TotalRevenue,
        COUNT(DISTINCT o.UserName)                        AS Customers
      FROM  Coupons cp
      INNER JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
      LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
      WHERE ${partnerClause}
        AND cp.IsUsed   = 1
        AND o.OrderDate >= @monthStart
        AND o.OrderDate <  @monthEnd
    `);

    const m = monthRes.recordset[0] ?? { PaidLinks: 0, TotalRevenue: 0, Customers: 0 };

    // ─── 2. Tổng coupon (all-time, cho couponsCreated + status breakdown) ───────
    const allReq = pool.request();
    if (isFiltered) allReq.input("partnerId2", sql.Int, numPartnerId);
    const partnerClause2 = isFiltered ? "cp.PartnerId = @partnerId2" : "1=1";

    type AllStatsRow = {
      GeneratedLinks: number;
      PaidLinks: number;
      PendingLinks: number;
      ExpiredLinks: number;
    };

    const allRes = await allReq.query<AllStatsRow>(`
      SELECT
        COUNT(*)                                                                                AS GeneratedLinks,
        SUM(CASE WHEN cp.IsUsed = 1 THEN 1 ELSE 0 END)                                        AS PaidLinks,
        SUM(CASE WHEN cp.IsUsed = 0 AND o.OrderID IS NULL AND cp.ExpireDate >= GETDATE() THEN 1 ELSE 0 END) AS PendingLinks,
        SUM(CASE WHEN cp.IsUsed = 0 AND cp.ExpireDate < GETDATE() THEN 1 ELSE 0 END)           AS ExpiredLinks
      FROM  Coupons cp
      LEFT  JOIN [EStocks_Data].[dbo].[service_Orders] o ON o.CouponCode = cp.CouponCode
      WHERE ${partnerClause2}
    `);

    const a = allRes.recordset[0] ?? { GeneratedLinks: 0, PaidLinks: 0, PendingLinks: 0, ExpiredLinks: 0 };

    // ─── 3. Doanh số pending (để tính hoa hồng ước tính) ─────────────────────────
    const pendingReq = pool.request();
    if (isFiltered) pendingReq.input("partnerId4", sql.Int, numPartnerId);
    const partnerClause4 = isFiltered ? "cp.PartnerId = @partnerId4" : "1=1";

    type PendingRow = { PendingRevenue: number };
    const pendingRes = await pendingReq.query<PendingRow>(`
      SELECT ISNULL(SUM(pkg.Amount), 0) AS PendingRevenue
      FROM  Coupons cp
      LEFT  JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
      LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = COALESCE(
        o.PackageID,
        TRY_CAST(SUBSTRING(
          cp.PaymentLink,
          CHARINDEX('packageId=', cp.PaymentLink) + 10,
          CHARINDEX('&', cp.PaymentLink + '&', CHARINDEX('packageId=', cp.PaymentLink) + 10)
            - (CHARINDEX('packageId=', cp.PaymentLink) + 10)
        ) AS INT)
      )
      WHERE ${partnerClause4}
        AND cp.IsUsed = 0
        AND o.OrderID IS NULL
        AND cp.ExpireDate >= GETDATE()
    `);

    const pendingRevenue = pendingRes.recordset[0]?.PendingRevenue ?? 0;

    // ─── 4. Monthly trend — 6 tháng gần nhất ────────────────────────────────────
    const since = new Date(Date.now() - 180 * 86_400_000);
    const trendReq = pool
      .request()
      .input("since", sql.DateTime, since);
    if (isFiltered) trendReq.input("partnerId3", sql.Int, numPartnerId);
    const partnerClause3 = isFiltered ? "cp.PartnerId = @partnerId3" : "1=1";

    type TrendRow = { Month: string; Revenue: number };
    const trendRes = await trendReq.query<TrendRow>(`
      SELECT
        FORMAT(o.OrderDate, 'yyyy-MM') AS Month,
        SUM(pkg.Amount)                AS Revenue
      FROM  Coupons cp
      INNER JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
      LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
      WHERE ${partnerClause3}
        AND cp.IsUsed      = 1
        AND o.OrderDate >= @since
      GROUP BY FORMAT(o.OrderDate, 'yyyy-MM')
      ORDER BY Month
    `);

    const monthlySeries = trendRes.recordset.map((r) => ({
      month: r.Month,
      revenue: r.Revenue,
      // Mỗi tháng tính hoa hồng độc lập (monthly reset).
      commission: calcCommissionFromTotal(r.Revenue),
    }));

    // ─── Tổng hợp ────────────────────────────────────────────────────────────────
    const totalRevenue = m.TotalRevenue;
    const netReceived = calcCommissionFromTotal(totalRevenue);

    // Ước tính hoa hồng tăng thêm nếu tất cả pending coupon được thanh toán tháng này.
    const pendingAmount = Math.max(
      0,
      calcCommissionFromTotal(totalRevenue + pendingRevenue) - netReceived,
    );

    // Tỷ lệ thanh toán: all-time paid / all-time created (đúng hơn so với cross-period).
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
