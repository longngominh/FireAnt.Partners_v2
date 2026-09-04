import { getPool, sql } from "@/lib/db/sql";
import {
  calcMonthlyRemuneration,
  normalizePartnerType,
  PARTNER_TYPE_LABELS,
  type PartnerType,
  type RemunerationBreakdown,
} from "@/lib/commission";
import { monthRange, normalizeMonthKey, type MonthKey } from "@/lib/utils/month";

export type MonthlyPartnerRevenue = {
  partnerId: number;
  username: string;
  email: string;
  name: string | null;
  phone: string | null;
  isActive: boolean;
  partnerType: PartnerType;
  partnerTypeLabel: string;
  revenue: number;
  orderCount: number;
  customerCount: number;
  lastOrderAt: Date | null;
  remuneration: RemunerationBreakdown;
};

export type MonthlyRevenueTotals = {
  partnerCount: number;
  revenue: number;
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

type MonthlyRevenueRow = {
  PartnerId: number;
  UserName: string;
  Email: string;
  Name: string | null;
  PhoneNumber: string | null;
  IsActive: boolean | number | null;
  PartnerType: string | null;
  CreatedDate: Date | null;
  Revenue: number | null;
  OrderCount: number | null;
  CustomerCount: number | null;
  LastOrderDate: Date | null;
};

/**
 * Bản sao inline của usp_GetPartnerMonthlyRevenue (kèm vw_PaidOrders), dùng khi
 * DB chưa chạy db/all-stored-procedures.sql cho phiên bản này.
 */
const FALLBACK_QUERY = `
  WITH PaidOrders AS (
    -- Inline của db/views/vw_PaidOrders.sql: đơn IsPaid = 1,
    -- Amount = doanh thu thực thu (đơn nâng cấp chỉ tính phần chênh lệch đã trả).
    SELECT
      o.OrderID, o.OrderDate, o.UserName, o.CouponCode,
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
    SELECT cp.CouponID, MAX(so.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN PaidOrders so ON so.CouponCode = cp.CouponCode
    WHERE cp.IsUsed = 1
      AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    GROUP BY cp.CouponID
  ),
  MonthlyByPartner AS (
    SELECT
      cp.PartnerId,
      ISNULL(SUM(o.Amount), 0)   AS Revenue,
      COUNT(o.OrderID)           AS OrderCount,
      COUNT(DISTINCT o.UserName) AS CustomerCount,
      MAX(o.OrderDate)           AS LastOrderDate
    FROM Coupons cp
    INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
    INNER JOIN PaidOrders o     ON o.OrderID    = poi.OrderID
    WHERE cp.IsUsed = 1
      AND o.OrderDate >= @MonthStart
      AND o.OrderDate <  @MonthEnd
    GROUP BY cp.PartnerId
  )
  SELECT
    p.PartnerId,
    i.UserName, i.Email, i.Name, i.PhoneNumber,
    p.IsActive,
    p.PartnerType,
    p.CreatedDate,
    ISNULL(m.Revenue, 0)       AS Revenue,
    ISNULL(m.OrderCount, 0)    AS OrderCount,
    ISNULL(m.CustomerCount, 0) AS CustomerCount,
    m.LastOrderDate
  FROM Partners p
  INNER JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i ON p.UserName = i.UserName
  LEFT  JOIN MonthlyByPartner m                       ON m.PartnerId = p.PartnerId
  WHERE (@PartnerId IS NULL OR p.PartnerId = @PartnerId)
  ORDER BY ISNULL(m.Revenue, 0) DESC, p.PartnerId;
`;

function mapRow(r: MonthlyRevenueRow): MonthlyPartnerRevenue {
  const partnerType = normalizePartnerType(r.PartnerType);
  const revenue = r.Revenue ?? 0;

  return {
    partnerId: r.PartnerId,
    username: r.UserName,
    email: r.Email,
    name: r.Name ?? null,
    phone: r.PhoneNumber ?? null,
    isActive: r.IsActive === true || r.IsActive === 1,
    partnerType,
    partnerTypeLabel: PARTNER_TYPE_LABELS[partnerType],
    revenue,
    orderCount: r.OrderCount ?? 0,
    customerCount: r.CustomerCount ?? 0,
    lastOrderAt: r.LastOrderDate ?? null,
    remuneration: calcMonthlyRemuneration(revenue, partnerType),
  };
}

/** Cộng dồn một tập dòng bất kỳ — dùng lại được sau khi lọc ở phía trang. */
export function sumMonthlyTotals(rows: MonthlyPartnerRevenue[]): MonthlyRevenueTotals {
  return rows.reduce<MonthlyRevenueTotals>(
    (acc, row) => ({
      partnerCount: acc.partnerCount + 1,
      revenue: acc.revenue + row.revenue,
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
      baseSalary: 0,
      commission: 0,
      performanceBonus: 0,
      remuneration: 0,
      orderCount: 0,
      customerCount: 0,
    },
  );
}

/**
 * Doanh thu + hoa hồng của cộng tác viên trong 1 tháng dương lịch.
 *
 * Doanh thu quy về tháng theo OrderDate của đơn đã thanh toán — cùng mốc với
 * dashboard, nên số liệu hai nơi khớp nhau.
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
  const empty: MonthlyRevenueReport = {
    month: normalizedMonth,
    start,
    end,
    rows: [],
    totals: sumMonthlyTotals([]),
  };

  try {
    const pool = await getPool();
    const buildRequest = () =>
      pool
        .request()
        .input("MonthStart", sql.DateTime, start)
        .input("MonthEnd", sql.DateTime, end)
        .input("PartnerId", sql.Int, partnerId);

    let recordset: MonthlyRevenueRow[];
    try {
      const res = await buildRequest().execute<MonthlyRevenueRow>("usp_GetPartnerMonthlyRevenue");
      recordset = res.recordset;
    } catch (err) {
      console.warn(
        "[getMonthlyRevenueReport] usp_GetPartnerMonthlyRevenue không khả dụng, dùng query inline",
        err,
      );
      const res = await buildRequest().query<MonthlyRevenueRow>(FALLBACK_QUERY);
      recordset = res.recordset;
    }

    const rows = recordset.map(mapRow);
    return { month: normalizedMonth, start, end, rows, totals: sumMonthlyTotals(rows) };
  } catch (err) {
    console.error("[getMonthlyRevenueReport]", err);
    return empty;
  }
}
