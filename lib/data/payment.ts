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
    partnerId: 0,
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

    const validPartnerId = numPartnerId !== null && !isNaN(numPartnerId) ? numPartnerId : null;
    const offset = (page - 1) * pageSize;
    const qParam = q.trim() ? `%${q.trim()}%` : null;

    const pool = await getPool();

    const dataRes = await pool
      .request()
      .input("PartnerId", sql.Int,           validPartnerId)
      .input("Status",    sql.NVarChar(20),   status)
      .input("Q",         sql.NVarChar(200),  qParam)
      .input("Offset",    sql.Int,            offset)
      .input("PageSize",  sql.Int,            pageSize)
      .execute<CouponRow>("usp_ListCoupons");

    type CountRow = { Total: number };
    const countRes = await pool
      .request()
      .input("PartnerId", sql.Int,          validPartnerId)
      .input("Status",    sql.NVarChar(20),  status)
      .input("Q",         sql.NVarChar(200), qParam)
      .execute<CountRow>("usp_CountCoupons");

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
      .input("CouponCode", sql.NVarChar(50), code)
      .execute<CouponRow>("usp_GetCouponByCode");
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
  const res = await pool
    .request()
    .input("PartnerId",   sql.Int,               numPartnerId)
    .input("CouponCode",  sql.NVarChar(50),       input.code)
    .input("PaymentLink", sql.NVarChar(sql.MAX),  input.paymentLink)
    .input("UserName",    sql.NVarChar(256),      input.userName ?? null)
    .input("Note",        sql.NVarChar(sql.MAX),  input.note ?? null)
    .execute<InsertRow>("usp_CreateCoupon");

  const newId = res.recordset[0]?.CouponID;
  if (!newId) throw new Error("INSERT Coupons thất bại — không lấy được CouponID.");

  return { id: newId, code: input.code };
}
