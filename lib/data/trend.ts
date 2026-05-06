"use server";

import { getPool, sql } from "@/lib/db/sql";
import { calcCommissionFromTotal } from "@/lib/commission";

export type TrendRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "2Y" | "ALL";
export type TrendPoint = { period: string; revenue: number; commission: number };

function getSinceDays(range: TrendRange): number | null {
  switch (range) {
    case "1W":  return 7;
    case "1M":  return 30;
    case "3M":  return 90;
    case "6M":  return 180;
    case "1Y":  return 365;
    case "2Y":  return 730;
    case "ALL": return null;
  }
}

function isDaily(range: TrendRange): boolean {
  return range === "1W" || range === "1M";
}

export async function getTrendSeries(
  partnerId: string | number | null,
  range: TrendRange,
): Promise<TrendPoint[]> {
  try {
    const numPartnerId =
      partnerId !== null && partnerId !== undefined
        ? typeof partnerId === "string"
          ? parseInt(partnerId, 10)
          : partnerId
        : null;

    const isFiltered = numPartnerId !== null && !isNaN(numPartnerId);

    const days = getSinceDays(range);
    const daily = isDaily(range);

    const pool = await getPool();
    const partnerClause = isFiltered ? "cp.PartnerId = @partnerId" : "1=1";
    const periodFormat = daily ? "'yyyy-MM-dd'" : "'yyyy-MM'";

    const req = pool.request();
    if (isFiltered) req.input("partnerId", sql.Int, numPartnerId);
    if (days !== null) {
      const since = new Date(Date.now() - days * 86_400_000);
      req.input("since", sql.DateTime, since);
    }

    const sinceClause = days !== null ? "AND cp.CreatedDate >= @since" : "";

    type TrendRow = { Period: string; Revenue: number };
    const res = await req.query<TrendRow>(`
      SELECT
        FORMAT(o.OrderDate, ${periodFormat}) AS Period,
        SUM(pkg.Amount)                       AS Revenue
      FROM  Coupons cp
      INNER JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
      LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
      WHERE ${partnerClause}
        AND cp.IsUsed = 1
        ${sinceClause}
      GROUP BY FORMAT(o.OrderDate, ${periodFormat})
      ORDER BY Period
    `);

    return res.recordset.map((r) => ({
      period: r.Period,
      revenue: r.Revenue,
      commission: calcCommissionFromTotal(r.Revenue),
    }));
  } catch (err) {
    console.error("[getTrendSeries]", err);
    return [];
  }
}
