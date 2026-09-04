import { getPool, sql } from "@/lib/db/sql";
import { calcCommissionFromTotal, type PartnerType } from "@/lib/commission";

export type TrendRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "2Y" | "ALL";
export type TrendPoint = { period: string; revenue: number; commission: number };

export function isTrendRange(value: string | undefined): value is TrendRange {
  return value === "1W"
    || value === "1M"
    || value === "3M"
    || value === "6M"
    || value === "1Y"
    || value === "2Y"
    || value === "ALL";
}

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

export function getTrendSinceDate(range: TrendRange): Date | null {
  const days = getSinceDays(range);
  return days !== null ? new Date(Date.now() - days * 86_400_000) : null;
}

function isDaily(range: TrendRange): boolean {
  return range === "1W" || range === "1M";
}

export type PartnerTrendRow = {
  partnerId: number;
  /** null khi đơn không có OrderDate */
  period: string | null;
  revenue: number;
};

/**
 * Trend của NHIỀU partner trong một truy vấn, trả về theo (partnerId, period).
 *
 * Cùng bộ lọc với usp_GetTrendSeries / usp_GetPartnerStats (coupon IsUsed = 1,
 * CreatedDate >= @Since, đơn đã thanh toán mới nhất của mỗi coupon qua vw_PaidOrders)
 * nhưng GROUP BY thêm PartnerId để đọc vw_PaidOrders một lần thay vì N lần.
 * Cộng revenue của một partner qua mọi period = TotalRevenue mà usp_GetPartnerStats
 * trả về cho partner đó trong cùng khung thời gian.
 *
 * partnerIds = null → mọi partner (kết hợp activeOnly để chỉ lấy partner đang hoạt động).
 */
export async function getTrendRowsByPartner(
  partnerIds: number[] | null,
  range: TrendRange,
  activeOnly = false,
): Promise<PartnerTrendRow[]> {
  if (partnerIds !== null && partnerIds.length === 0) return [];

  try {
    const pool = await getPool();
    const since = getTrendSinceDate(range);

    type Row = { PartnerId: number | null; Period: string | null; Revenue: number | null };
    const res = await pool
      .request()
      .input("PartnerIds", sql.NVarChar(sql.MAX), partnerIds ? partnerIds.join(",") : null)
      .input("Since", sql.DateTime, since)
      .input("IsDaily", sql.Bit, isDaily(range) ? 1 : 0)
      .input("ActiveOnly", sql.Bit, activeOnly ? 1 : 0)
      .query<Row>(`
        WITH PaidOrderIds AS (
          SELECT
            cp.CouponID,
            cp.PartnerId,
            MAX(so.OrderID) AS OrderID
          FROM Coupons cp
          INNER JOIN vw_PaidOrders so ON so.CouponCode = cp.CouponCode
          LEFT  JOIN Partners p       ON p.PartnerId   = cp.PartnerId
          WHERE cp.IsUsed = 1
            AND (@PartnerIds IS NULL OR cp.PartnerId IN (
                  SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@PartnerIds, ',')))
            AND (@Since IS NULL OR cp.CreatedDate >= @Since)
            AND (@ActiveOnly = 0 OR p.IsActive = 1)
          GROUP BY cp.CouponID, cp.PartnerId
        )
        SELECT
          poi.PartnerId,
          CASE
            WHEN @IsDaily = 1 THEN FORMAT(o.OrderDate, 'yyyy-MM-dd')
            ELSE                    FORMAT(o.OrderDate, 'yyyy-MM')
          END               AS Period,
          SUM(o.Amount)     AS Revenue
        FROM PaidOrderIds poi
        INNER JOIN vw_PaidOrders o ON o.OrderID = poi.OrderID
        GROUP BY
          poi.PartnerId,
          CASE
            WHEN @IsDaily = 1 THEN FORMAT(o.OrderDate, 'yyyy-MM-dd')
            ELSE                    FORMAT(o.OrderDate, 'yyyy-MM')
          END
        ORDER BY Period;
      `);

    return res.recordset
      .filter((r) => r.PartnerId !== null)
      .map((r) => ({
        partnerId: r.PartnerId as number,
        period: r.Period,
        revenue: r.Revenue ?? 0,
      }));
  } catch (err) {
    console.error("[getTrendRowsByPartner]", err);
    return [];
  }
}

/**
 * Lấy trend cho nhiều partner rồi cộng dồn theo period (một truy vấn).
 * Dùng cho /api/trend?partnerIds=... — hoa hồng tính theo bậc mặc định
 * (sales_employee) cho từng (partner, period) như trước.
 */
export async function getTrendSeriesForPartners(
  partnerIds: number[],
  range: TrendRange,
): Promise<TrendPoint[]> {
  if (partnerIds.length === 0) return [];

  const rows = await getTrendRowsByPartner(partnerIds, range);

  const merged = new Map<string, TrendPoint>();
  for (const row of rows) {
    if (row.period === null) continue;
    const commission = calcCommissionFromTotal(row.revenue);
    const existing = merged.get(row.period);
    if (existing) {
      existing.revenue += row.revenue;
      existing.commission += commission;
    } else {
      merged.set(row.period, { period: row.period, revenue: row.revenue, commission });
    }
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.period.localeCompare(b.period),
  );
}

export async function getTrendSeries(
  partnerId: string | number | null,
  range: TrendRange,
  activeOnly = false,
  partnerType: PartnerType = "sales_employee",
): Promise<TrendPoint[]> {
  try {
    const numPartnerId =
      partnerId !== null && partnerId !== undefined
        ? typeof partnerId === "string"
          ? parseInt(partnerId, 10)
          : partnerId
        : null;

    const validPartnerId = numPartnerId !== null && !isNaN(numPartnerId) ? numPartnerId : null;

    const since = getTrendSinceDate(range);

    const pool = await getPool();

    type TrendRow = { Period: string; Revenue: number };
    let res;
    try {
      res = await pool
        .request()
        .input("PartnerId", sql.Int, validPartnerId)
        .input("Since", sql.DateTime, since)
        .input("IsDaily", sql.Bit, isDaily(range) ? 1 : 0)
        .input("ActiveOnly", sql.Bit, activeOnly ? 1 : 0)
        .execute<TrendRow>("usp_GetTrendSeries");
    } catch (err) {
      console.warn("[getTrendSeries] Falling back to legacy usp_GetTrendSeries", err);
      res = await pool
        .request()
        .input("PartnerId", sql.Int, validPartnerId)
        .input("Since", sql.DateTime, since)
        .input("IsDaily", sql.Bit, isDaily(range) ? 1 : 0)
        .execute<TrendRow>("usp_GetTrendSeries");
    }

    return res.recordset.map((r) => ({
      period: r.Period,
      revenue: r.Revenue,
      commission: calcCommissionFromTotal(r.Revenue, partnerType),
    }));
  } catch (err) {
    console.error("[getTrendSeries]", err);
    return [];
  }
}
