import { getPool, sql } from "@/lib/db/sql";

export type CouponStatus = "PENDING" | "PAID" | "EXPIRED" | "USED";

export type Coupon = {
  id: number;
  code: string;
  partnerId: number;
  paymentLink: string;
  isPaid: boolean;
  isUsed: boolean;
  createdAt: Date;
  expiresAt: Date;
  orderId: number | null;
  orderDate: Date | null;
  orderAmount: number;
  customerName: string | null;
  packageName: string | null;
  status: CouponStatus;
  userName: string | null;
  note: string | null;
};

export type CouponListFilter = {
  partnerId?: string | number | null;
  status?: CouponStatus | "ALL";
  q?: string;
  page?: number;
  pageSize?: number;
};

export type CouponListResult = {
  rows: Coupon[];
  total: number;
  page: number;
  pageSize: number;
};

type CouponRow = {
  CouponID: number;
  CouponCode: string;
  PaymentLink: string | null;
  IsUsed: boolean;
  IsPaid: boolean;
  CreatedDate: Date;
  ExpireDate: Date;
  OrderId: number | null;
  OrderDate: Date | null;
  OrderAmount: number;
  CustomerName: string | null;
  PackageName: string | null;
  UserName: string | null;
  Note: string | null;
};

function deriveStatus(r: CouponRow): CouponStatus {
  if (r.IsPaid) return "PAID";
  if (r.OrderId !== null) return "USED";
  if (r.ExpireDate < new Date()) return "EXPIRED";
  return "PENDING";
}

function mapCoupon(r: CouponRow): Coupon {
  return {
    id: r.CouponID,
    code: r.CouponCode,
    partnerId: 0, // filled below if needed
    paymentLink: r.PaymentLink ?? "",
    isPaid: r.IsPaid,
    isUsed: r.IsUsed,
    createdAt: r.CreatedDate,
    expiresAt: r.ExpireDate,
    orderId: r.OrderId,
    orderDate: r.OrderDate,
    orderAmount: r.OrderAmount,
    customerName: r.CustomerName ? decodeURIComponent(r.CustomerName) : null,
    packageName: r.PackageName ?? null,
    status: deriveStatus(r),
    userName: r.UserName ?? null,
    note: r.Note ?? null,
  };
}

export async function listCoupons(filter: CouponListFilter = {}): Promise<CouponListResult> {
  const { partnerId = null, status = "ALL", q = "", page = 1, pageSize = 20 } = filter;
  try {
  const numPartnerId =
    partnerId !== null && partnerId !== undefined
      ? typeof partnerId === "string"
        ? parseInt(partnerId, 10)
        : partnerId
      : null;

  const offset = (page - 1) * pageSize;
  const pool = await getPool();

  // IsUsed=1 trên Coupons được set sau khi đơn hàng thanh toán thành công → là nguồn chính
  const statusClause =
    status === "ALL"
      ? "1=1"
      : status === "PAID"
        ? "cp.IsUsed = 1"
        : status === "USED"
          ? "o.OrderID IS NOT NULL AND cp.IsUsed = 0"  // đơn đã tạo, chưa thanh toán xong
          : status === "EXPIRED"
            ? "cp.IsUsed = 0 AND cp.ExpireDate < GETDATE()"
            : "cp.IsUsed = 0 AND o.OrderID IS NULL AND cp.ExpireDate >= GETDATE()"; // PENDING

  const req = pool
    .request()
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, pageSize)
    .input("q", sql.NVarChar(200), q.trim() ? `%${q.trim()}%` : null);

  const partnerClause =
    numPartnerId !== null && !isNaN(numPartnerId)
      ? "cp.PartnerId = @partnerId"
      : "1=1";

  if (numPartnerId !== null && !isNaN(numPartnerId)) {
    req.input("partnerId", sql.Int, numPartnerId);
  }

  const searchClause =
    q.trim()
      ? "(cp.CouponCode LIKE @q OR ISNULL(o.UserName,'') LIKE @q OR cp.PaymentLink LIKE @q)"
      : "1=1";

  const dataRes = await req.query<CouponRow>(`
    SELECT
      cp.CouponID,
      cp.CouponCode,
      cp.PaymentLink,
      cp.IsUsed,
      cp.IsUsed                                                            AS IsPaid,
      cp.CreatedDate,
      cp.ExpireDate,
      o.OrderID                                                            AS OrderId,
      o.OrderDate,
      ISNULL(pkg.Amount, 0)  AS OrderAmount,
      COALESCE(
        o.UserName,
        CASE WHEN CHARINDEX('userName=', cp.PaymentLink) > 0 THEN
          SUBSTRING(
            cp.PaymentLink,
            CHARINDEX('userName=', cp.PaymentLink) + 9,
            CHARINDEX('&', cp.PaymentLink + '&', CHARINDEX('userName=', cp.PaymentLink) + 9)
              - (CHARINDEX('userName=', cp.PaymentLink) + 9)
          )
        ELSE NULL END
      )                      AS CustomerName,
      pkg.PackageName,
      cp.UserName,
      cp.Note
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
    WHERE ${partnerClause}
      AND ${statusClause}
      AND ${searchClause}
    ORDER BY cp.CreatedDate DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);

  const countReq = pool
    .request()
    .input("q2", sql.NVarChar(200), q.trim() ? `%${q.trim()}%` : null);

  const countPartnerClause =
    numPartnerId !== null && !isNaN(numPartnerId)
      ? "cp.PartnerId = @partnerId2"
      : "1=1";

  if (numPartnerId !== null && !isNaN(numPartnerId)) {
    countReq.input("partnerId2", sql.Int, numPartnerId);
  }

  const countSearchClause =
    q.trim() ? "(cp.CouponCode LIKE @q2 OR ISNULL(cp.UserName,'') LIKE @q2)" : "1=1";

  type CountRow = { Total: number };
  const countRes = await countReq.query<CountRow>(`
    SELECT COUNT(*) AS Total
    FROM  Coupons cp
    LEFT JOIN [EStocks_Data].[dbo].[service_Orders] o ON o.CouponCode = cp.CouponCode
    WHERE ${countPartnerClause}
      AND ${statusClause}
      AND ${countSearchClause}
  `);

  return {
    rows: dataRes.recordset.map(mapCoupon),
    total: countRes.recordset[0]?.Total ?? 0,
    page,
    pageSize,
  };
  } catch (err) {
    console.error("[listCoupons]", err);
    return { rows: [], total: 0, page: filter.page ?? 1, pageSize: filter.pageSize ?? 20 };
  }
}

export async function getCouponByCode(code: string): Promise<Coupon | null> {
  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("code", sql.NVarChar(50), code)
      .query<CouponRow>(`
        SELECT
          cp.CouponID,
          cp.CouponCode,
          cp.PaymentLink,
          cp.IsUsed,
          cp.IsUsed                                                  AS IsPaid,
          cp.CreatedDate,
          cp.ExpireDate,
          o.OrderID                                                  AS OrderId,
          o.OrderDate,
          ISNULL(pkg.Amount, 0)  AS OrderAmount,
          COALESCE(
            o.UserName,
            CASE WHEN CHARINDEX('userName=', cp.PaymentLink) > 0 THEN
              SUBSTRING(
                cp.PaymentLink,
                CHARINDEX('userName=', cp.PaymentLink) + 9,
                CHARINDEX('&', cp.PaymentLink + '&', CHARINDEX('userName=', cp.PaymentLink) + 9)
                  - (CHARINDEX('userName=', cp.PaymentLink) + 9)
              )
            ELSE NULL END
          )                      AS CustomerName,
          pkg.PackageName,
          cp.UserName,
          cp.Note
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
        WHERE cp.CouponCode = @code
      `);
    return res.recordset[0] ? mapCoupon(res.recordset[0]) : null;
  } catch (err) {
    console.error("[getCouponByCode]", err);
    return null;
  }
}

/** Dùng cho /p/[code] redirect route. */
export async function getCouponByShortCode(shortCode: string): Promise<Coupon | null> {
  return getCouponByCode(shortCode);
}

export type CreateCouponInput = {
  partnerId: number | string;
  code: string;
  paymentLink: string;
  userName?: string | null;
  note?: string | null;
};

export async function createCoupon(input: CreateCouponInput): Promise<{ id: number; code: string }> {
  const numPartnerId =
    typeof input.partnerId === "string"
      ? parseInt(input.partnerId, 10)
      : input.partnerId;

  if (isNaN(numPartnerId)) throw new Error("PartnerId không hợp lệ.");

  const pool = await getPool();

  type InsertRow = { CouponID: number };
  try {
    const res = await pool
      .request()
      .input("partnerId",    sql.Int,               numPartnerId)
      .input("couponCode",   sql.NVarChar(50),       input.code)
      .input("paymentLink",  sql.NVarChar(sql.MAX),  input.paymentLink)
      .input("userName",     sql.NVarChar(256),      input.userName ?? null)
      .input("note",         sql.NVarChar(sql.MAX),  input.note ?? null)
      .query<InsertRow>(`
        INSERT INTO Coupons (PartnerId, CouponTypeId, CouponCode, IsUsed, CreatedDate, ExpireDate, PaymentLink, UserName, Note)
        VALUES (@partnerId, 1, @couponCode, 0, GETDATE(), DATEADD(day, 14, GETDATE()), @paymentLink, @userName, @note);
        SELECT SCOPE_IDENTITY() AS CouponID;
      `);

    const newId = res.recordset[0]?.CouponID;
    if (!newId) throw new Error("INSERT Coupons thất bại — không lấy được CouponID.");

    return { id: newId, code: input.code };
  } catch (err) {
    throw err;
  }
}
