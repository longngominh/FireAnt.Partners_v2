import { getPool, sql } from "@/lib/db/sql";
import { hasStaffModel } from "@/lib/data/staff-model";
import { monthRange, toMonthKey, type MonthKey } from "@/lib/utils/month";

/**
 * Phân loại doanh số qua link CTV theo loại đơn — căn cứ của chính sách xếp hạng
 * (chỉ "new" = khách mua gói hội viên lần đầu được tính thù lao theo hạng).
 *
 *   new      — gói hội viên, tài khoản CHƯA từng có đơn hội viên đã thanh toán nào
 *              trước đơn này ở bất kỳ kênh nào (đơn hội viên đã thanh toán đầu tiên).
 *   renewal  — gói hội viên, khách đã từng mua hội viên trước đó.
 *   upgrade  — đơn nâng cấp hội viên kiểu mới (chỉ tính phần chênh lệch đã trả).
 *   course   — khóa học (ServiceID 39).
 *   other    — gói khác (nếu có).
 *
 * Cách chọn đơn giữ nguyên như usp_GetPartnerMonthlyRevenue: mỗi coupon IsUsed = 1
 * lấy đơn đã thanh toán mới nhất, quy về tháng theo OrderDate, Amount = thực thu theo
 * vw_PaidOrders — tổng 5 loại khớp doanh số của usp_GetPartnerMonthlyRevenue.
 *
 * Người bán (SellerPartnerId) là chủ link; người hưởng doanh số (PartnerId) là đối tác
 * mà người bán đang được ghi nhận lúc phát sinh đơn (PartnerStaffMemberships), còn
 * không thì chính người bán. Nhờ vậy doanh số nhân viên chỉ cộng cho đối tác trong thời
 * gian được ghi nhận; đơn ngoài khoảng đó nằm ở dòng của chính nhân viên (không ai trả).
 */

export const ORDER_KINDS = ["new", "renewal", "upgrade", "course", "other"] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

export const ORDER_KIND_LABELS: Record<OrderKind, string> = {
  new: "Khách mới",
  renewal: "Gia hạn",
  upgrade: "Nâng cấp",
  course: "Khóa học",
  other: "Khác",
};

/** ServiceID gói hội viên: 33 Thiết yếu, 34 Chuyên nghiệp, 35 Cao cấp. */
const MEMBERSHIP_SERVICE_IDS = "33, 34, 35";
/** Các PackageID hội viên đang bán (usp_ListPackages) — phòng khi ServiceID của gói khác nhóm. */
const MEMBERSHIP_PACKAGE_IDS = "55, 43, 44, 45, 95, 96, 97, 98, 57, 49, 50, 51";

export type KindTotals = { revenue: number; orders: number; customers: number };

export type RevenueBreakdown = Record<OrderKind, KindTotals> & {
  total: KindTotals;
  lastOrderAt: Date | null;
};

export type PartnerMonthBreakdown = {
  partnerId: number;
  month: MonthKey;
  breakdown: RevenueBreakdown;
};

export function emptyBreakdown(): RevenueBreakdown {
  const zero = (): KindTotals => ({ revenue: 0, orders: 0, customers: 0 });
  return {
    new: zero(),
    renewal: zero(),
    upgrade: zero(),
    course: zero(),
    other: zero(),
    total: zero(),
    lastOrderAt: null,
  };
}

/** Doanh số không thuộc diện tính thù lao hạng (gia hạn + nâng cấp + khóa học + khác). */
export function otherRevenue(b: RevenueBreakdown): number {
  return b.renewal.revenue + b.upgrade.revenue + b.course.revenue + b.other.revenue;
}

/**
 * Căn cứ tính phí/thù lao của một breakdown cho calcPartnerRemuneration: phụ lục tính trên DS khách
 * mới; chính sách Thường và NVKD tính trên toàn bộ DS trừ khóa học. Khóa học FireAnt Academy được
 * thanh toán riêng ở phần Quản lý khóa học (Admin), không tính ở trang Partner.
 */
export function remunerationBase(b: RevenueBreakdown): { total: number; newCustomer: number } {
  return { total: b.total.revenue - b.course.revenue, newCustomer: b.new.revenue };
}

/**
 * @PartnerId lọc theo người hưởng (đối tác: gồm cả đơn của nhân viên trong thời gian ghi
 * nhận); @SellerId lọc theo người bán. withStaff = false khi CSDL chưa có migration.
 */
function classifiedCte(withStaff: boolean): string {
  const staffSellers = withStaff
    ? "OR cp.PartnerId IN (SELECT ms.StaffPartnerId FROM PartnerStaffMemberships ms WHERE ms.PartnerId = @PartnerId)"
    : "";
  const attributed = withStaff ? "COALESCE(att.PartnerId, pbc.PartnerId)" : "pbc.PartnerId";
  const attribution = withStaff
    ? `OUTER APPLY (
      SELECT TOP 1 m.PartnerId
      FROM PartnerStaffMemberships m
      WHERE m.StaffPartnerId = pbc.PartnerId
        AND o.OrderDate >= m.StartDate
        AND (m.EndDate IS NULL OR o.OrderDate < m.EndDate)
      ORDER BY m.StartDate DESC
    ) att`
    : "";
  return `
  WITH PaidByCoupon AS (
    SELECT cp.CouponID, cp.PartnerId, MAX(o.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN [EStocks_Data].[dbo].[service_Orders] o
      ON o.CouponCode = cp.CouponCode AND o.IsPaid = 1
    WHERE cp.IsUsed = 1
      AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId ${staffSellers})
      AND (@SellerId IS NULL OR cp.PartnerId = @SellerId)
    GROUP BY cp.CouponID, cp.PartnerId
  ),
  Orders AS (
    -- Số tiền, giá niêm yết, gói lấy từ vw_PaidOrders (giá theo lịch sử giá gói; đơn mua rồi
    -- nâng cấp kiểu cũ vẫn tính giá mua ban đầu) để khớp usp_GetPartnerMonthlyRevenue.
    -- Chỉ đơn nâng cấp kiểu mới (service_Orders.UpgradeAmount) là loại "nâng cấp"; đơn mua
    -- được nâng cấp về sau vẫn là khách mới / gia hạn.
    SELECT
      ${attributed} AS PartnerId,
      pbc.PartnerId AS SellerPartnerId,
      v.OrderID, v.OrderDate, v.UserName, v.CouponCode, v.PackageID,
      v.ServiceID, v.PackageName, v.ListAmount,
      CASE WHEN o.UpgradeAmount IS NOT NULL THEN 1 ELSE 0 END AS IsUpgrade,
      v.Amount
    FROM PaidByCoupon pbc
    INNER JOIN vw_PaidOrders v ON v.OrderID = pbc.OrderID
    INNER JOIN [EStocks_Data].[dbo].[service_Orders] o ON o.OrderID = pbc.OrderID
    ${attribution}
    WHERE v.OrderDate >= @Start
      AND v.OrderDate <  @End
  ),
  FirstMembership AS (
    -- Đơn hội viên đã thanh toán đầu tiên của mỗi khách, mọi kênh (không chỉ qua CTV).
    SELECT m.UserName, MIN(m.OrderID) AS FirstOrderID
    FROM [EStocks_Data].[dbo].[service_Orders] m
    INNER JOIN [EStocks_Data].[dbo].[service_Packages] mp ON mp.PackageID = m.PackageID
    WHERE m.IsPaid = 1
      AND (mp.ServiceID IN (${MEMBERSHIP_SERVICE_IDS}) OR m.PackageID IN (${MEMBERSHIP_PACKAGE_IDS}))
      AND m.UserName IN (SELECT UserName FROM Orders)
    GROUP BY m.UserName
  ),
  Classified AS (
    SELECT
      o.*,
      CASE
        WHEN o.ServiceID = 39 THEN 'course'
        WHEN o.ServiceID IN (${MEMBERSHIP_SERVICE_IDS}) OR o.PackageID IN (${MEMBERSHIP_PACKAGE_IDS}) THEN
          CASE
            WHEN o.IsUpgrade = 1 THEN 'upgrade'
            WHEN fm.FirstOrderID = o.OrderID THEN 'new'
            ELSE 'renewal'
          END
        ELSE 'other'
      END AS Kind
    FROM Orders o
    LEFT JOIN FirstMembership fm ON fm.UserName = o.UserName
  )
`;
}

type AggregateRow = {
  PartnerId: number;
  SellerPartnerId: number | null;
  Month: string;
  Kind: string | null;
  IsTotal: number;
  OrderCount: number;
  Revenue: number | null;
  CustomerCount: number;
  LastOrderDate: Date | null;
};

function isOrderKind(value: unknown): value is OrderKind {
  return ORDER_KINDS.includes(value as OrderKind);
}

export type SellerMonthBreakdown = PartnerMonthBreakdown & {
  /** Người bán (chủ link). Khi không gom theo người bán thì bằng partnerId. */
  sellerId: number;
};

async function queryBreakdowns(params: {
  start: Date;
  end: Date;
  partnerId: number | null;
  sellerId: number | null;
  bySeller: boolean;
}): Promise<SellerMonthBreakdown[]> {
  const { start, end, partnerId, sellerId, bySeller } = params;
  const withStaff = await hasStaffModel();
  const sellerCol = bySeller ? "SellerPartnerId" : "CAST(NULL AS INT)";
  const sellerGroup = bySeller ? ", SellerPartnerId" : "";
  const pool = await getPool();
  const res = await pool
    .request()
    .input("Start", sql.DateTime, start)
    .input("End", sql.DateTime, end)
    .input("PartnerId", sql.Int, partnerId)
    .input("SellerId", sql.Int, sellerId)
    .query<AggregateRow>(`
      ${classifiedCte(withStaff)}
      SELECT
        PartnerId,
        ${sellerCol}                     AS SellerPartnerId,
        CONVERT(char(7), OrderDate, 120) AS Month,
        Kind,
        GROUPING(Kind)                   AS IsTotal,
        COUNT(*)                         AS OrderCount,
        ISNULL(SUM(Amount), 0)           AS Revenue,
        COUNT(DISTINCT UserName)         AS CustomerCount,
        MAX(OrderDate)                   AS LastOrderDate
      FROM Classified
      WHERE (@PartnerId IS NULL OR PartnerId = @PartnerId)
      GROUP BY GROUPING SETS (
        (PartnerId${sellerGroup}, CONVERT(char(7), OrderDate, 120), Kind),
        (PartnerId${sellerGroup}, CONVERT(char(7), OrderDate, 120))
      );
    `);

  const byKey = new Map<string, SellerMonthBreakdown>();
  for (const row of res.recordset) {
    const seller = row.SellerPartnerId ?? row.PartnerId;
    const key = `${row.PartnerId}|${bySeller ? seller : ""}|${row.Month}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { partnerId: row.PartnerId, sellerId: seller, month: row.Month, breakdown: emptyBreakdown() };
      byKey.set(key, entry);
    }
    const totals: KindTotals = {
      revenue: row.Revenue ?? 0,
      orders: row.OrderCount ?? 0,
      customers: row.CustomerCount ?? 0,
    };
    if (row.IsTotal === 1) {
      entry.breakdown.total = totals;
      entry.breakdown.lastOrderAt = row.LastOrderDate ?? null;
    } else if (isOrderKind(row.Kind)) {
      entry.breakdown[row.Kind] = totals;
    }
  }
  return Array.from(byKey.values());
}

/**
 * Doanh số theo (người hưởng, tháng, loại đơn) trong khoảng [start, end). Một truy vấn cho
 * mọi đối tác (partnerId null) — đủ nhẹ vì Coupons chỉ vài nghìn dòng. Doanh số của nhân
 * viên trong thời gian được ghi nhận đã cộng vào đối tác.
 */
export async function getRevenueBreakdowns(params: {
  start: Date;
  end: Date;
  partnerId?: number | null;
}): Promise<PartnerMonthBreakdown[]> {
  try {
    return await queryBreakdowns({
      start: params.start,
      end: params.end,
      partnerId: params.partnerId ?? null,
      sellerId: null,
      bySeller: false,
    });
  } catch (err) {
    console.error("[getRevenueBreakdowns]", err);
    return [];
  }
}

/**
 * Doanh số tính cho một đối tác, tách theo người bán: chính đối tác (trực tiếp) và từng
 * nhân viên trong thời gian được ghi nhận.
 */
export async function getSellerBreakdowns(params: {
  start: Date;
  end: Date;
  /** null = mọi đối tác. */
  partnerId: number | null;
}): Promise<SellerMonthBreakdown[]> {
  try {
    return await queryBreakdowns({ ...params, sellerId: null, bySeller: true });
  } catch (err) {
    console.error("[getSellerBreakdowns]", err);
    return [];
  }
}

/** Doanh số do chính một người bán tạo ra (trang Doanh số của nhân viên), theo tháng. */
export async function getOwnSalesBreakdowns(params: {
  start: Date;
  end: Date;
  sellerId: number;
}): Promise<SellerMonthBreakdown[]> {
  try {
    const rows = await queryBreakdowns({
      start: params.start,
      end: params.end,
      partnerId: null,
      sellerId: params.sellerId,
      bySeller: true,
    });
    // Người bán từng đổi đối tác thì đơn tính cho nhiều đối tác: gộp lại theo tháng.
    const byMonth = new Map<string, SellerMonthBreakdown>();
    for (const row of rows) {
      const existing = byMonth.get(row.month);
      if (existing) {
        existing.breakdown = mergeBreakdowns(existing.breakdown, row.breakdown);
      } else {
        byMonth.set(row.month, { ...row, partnerId: row.sellerId });
      }
    }
    return Array.from(byMonth.values());
  } catch (err) {
    console.error("[getOwnSalesBreakdowns]", err);
    return [];
  }
}

export function mergeBreakdowns(a: RevenueBreakdown, b: RevenueBreakdown): RevenueBreakdown {
  const add = (x: KindTotals, y: KindTotals): KindTotals => ({
    revenue: x.revenue + y.revenue,
    orders: x.orders + y.orders,
    // Khách có thể trùng giữa hai nhóm: tổng số khách là cận trên, chỉ dùng để hiển thị.
    customers: x.customers + y.customers,
  });
  const latest = [a.lastOrderAt, b.lastOrderAt]
    .filter((d): d is Date => d instanceof Date)
    .sort((x, y) => y.getTime() - x.getTime())[0];
  return {
    new: add(a.new, b.new),
    renewal: add(a.renewal, b.renewal),
    upgrade: add(a.upgrade, b.upgrade),
    course: add(a.course, b.course),
    other: add(a.other, b.other),
    total: add(a.total, b.total),
    lastOrderAt: latest ?? null,
  };
}

/** Breakdown của một tháng, tra theo partnerId (CTV không có đơn → không có trong map). */
export async function getMonthBreakdownMap(
  month: MonthKey,
  partnerId: number | null = null,
): Promise<Map<number, RevenueBreakdown>> {
  const { start, end } = monthRange(month);
  const rows = await getRevenueBreakdowns({ start, end, partnerId });
  return new Map(rows.filter((r) => r.month === month).map((r) => [r.partnerId, r.breakdown]));
}

export type ClassifiedOrder = {
  /** Người hưởng doanh số (đối tác). */
  partnerId: number;
  /** Người bán (chủ link): đối tác hoặc nhân viên. */
  sellerId: number;
  orderId: number;
  orderDate: Date;
  month: MonthKey;
  couponCode: string | null;
  customerUserName: string | null;
  packageName: string | null;
  serviceId: number | null;
  listAmount: number;
  amount: number;
  kind: OrderKind;
};

type OrderRow = {
  PartnerId: number;
  SellerPartnerId: number | null;
  OrderID: number;
  OrderDate: Date;
  CouponCode: string | null;
  UserName: string | null;
  PackageName: string | null;
  ServiceID: number | null;
  ListAmount: number | null;
  Amount: number | null;
  Kind: string;
};

/**
 * Từng đơn đã thanh toán (đã phân loại) trong khoảng thời gian — dùng cho bảng kê đơn hàng
 * của giấy đề nghị và giao dịch gần đây. partnerId lọc theo người hưởng, sellerId theo người
 * bán; `top` giới hạn số đơn mới nhất.
 */
export async function listClassifiedOrders(params: {
  start: Date;
  end: Date;
  partnerId?: number | null;
  sellerId?: number | null;
  top?: number | null;
}): Promise<ClassifiedOrder[]> {
  const { start, end, partnerId = null, sellerId = null, top = null } = params;
  try {
    const withStaff = await hasStaffModel();
    const pool = await getPool();
    const res = await pool
      .request()
      .input("Start", sql.DateTime, start)
      .input("End", sql.DateTime, end)
      .input("PartnerId", sql.Int, partnerId)
      .input("SellerId", sql.Int, sellerId)
      .input("Top", sql.Int, top ?? 100000)
      .query<OrderRow>(`
        ${classifiedCte(withStaff)}
        SELECT TOP (@Top)
          PartnerId, SellerPartnerId, OrderID, OrderDate, CouponCode, UserName, PackageName,
          ServiceID, ListAmount, Amount, Kind
        FROM Classified
        WHERE (@PartnerId IS NULL OR PartnerId = @PartnerId)
        ORDER BY OrderDate DESC, OrderID DESC;
      `);
    return res.recordset.map((r) => ({
      partnerId: r.PartnerId,
      sellerId: r.SellerPartnerId ?? r.PartnerId,
      orderId: r.OrderID,
      orderDate: r.OrderDate,
      month: toMonthKey(r.OrderDate),
      couponCode: r.CouponCode ?? null,
      customerUserName: r.UserName ?? null,
      packageName: r.PackageName ?? null,
      serviceId: r.ServiceID ?? null,
      listAmount: r.ListAmount ?? 0,
      amount: r.Amount ?? 0,
      kind: isOrderKind(r.Kind) ? r.Kind : "other",
    }));
  } catch (err) {
    console.error("[listClassifiedOrders]", err);
    return [];
  }
}

/**
 * Link chờ thanh toán còn hạn của khách CHƯA từng mua hội viên — doanh số khách mới
 * có thể về thêm trong tháng nếu khách thanh toán.
 */
export async function getPendingNewCustomerPotential(
  partnerId: number,
): Promise<{ links: number; revenue: number }> {
  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .query<{ Links: number; Revenue: number | null }>(`
        SELECT
          COUNT(*) AS Links,
          SUM(ISNULL(pkg.Amount, 0) - ISNULL(cp.DiscountAmount, 0)) AS Revenue
        FROM Coupons cp
        LEFT JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = cp.PackageId
        WHERE cp.PartnerId = @PartnerId
          AND cp.IsUsed = 0
          AND cp.ExpireDate >= GETDATE()
          AND cp.UserName IS NOT NULL
          AND (pkg.ServiceID IN (${MEMBERSHIP_SERVICE_IDS}) OR cp.PackageId IN (${MEMBERSHIP_PACKAGE_IDS}))
          AND NOT EXISTS (
            SELECT 1
            FROM [EStocks_Data].[dbo].[service_Orders] m
            INNER JOIN [EStocks_Data].[dbo].[service_Packages] mp ON mp.PackageID = m.PackageID
            WHERE m.UserName = cp.UserName
              AND m.IsPaid = 1
              AND (mp.ServiceID IN (${MEMBERSHIP_SERVICE_IDS}) OR m.PackageID IN (${MEMBERSHIP_PACKAGE_IDS}))
          );
      `);
    const row = res.recordset[0];
    return { links: row?.Links ?? 0, revenue: row?.Revenue ?? 0 };
  } catch (err) {
    console.error("[getPendingNewCustomerPotential]", err);
    return { links: 0, revenue: 0 };
  }
}

/**
 * Khách của một email đã từng mua gói hội viên chưa — để trang tạo link báo trước
 * đơn sẽ là "khách mới" (tính hạng) hay "gia hạn".
 */
export async function hasPaidMembership(userName: string): Promise<boolean> {
  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("UserName", sql.NVarChar(256), userName)
      .query<{ Found: number }>(`
        SELECT TOP 1 1 AS Found
        FROM [EStocks_Data].[dbo].[service_Orders] m
        INNER JOIN [EStocks_Data].[dbo].[service_Packages] mp ON mp.PackageID = m.PackageID
        WHERE m.UserName = @UserName
          AND m.IsPaid = 1
          AND (mp.ServiceID IN (${MEMBERSHIP_SERVICE_IDS}) OR m.PackageID IN (${MEMBERSHIP_PACKAGE_IDS}));
      `);
    return res.recordset.length > 0;
  } catch (err) {
    console.error("[hasPaidMembership]", err);
    return false;
  }
}
