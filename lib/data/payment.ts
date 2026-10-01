import { getPool, sql } from "@/lib/db/sql";
import { SOURCE_MAX_LENGTH, SOURCE_NONE, normalizeSource } from "@/lib/payment/source";

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
  /** Nguồn khách CTV gắn khi tạo link */
  source: string | null;
  /** Mã khuyến mại đã áp vào đơn của link */
  voucherCode: string | null;
  /** Khoản giảm của mã lúc tạo link (0 với mã tặng ngày) */
  discountAmount: number | null;
};

export type CouponListFilter = {
  partnerId?: string | number | null;
  status?: CouponStatus | "ALL";
  q?: string;
  /** Tên nguồn, hoặc SOURCE_NONE = link chưa gắn nguồn; bỏ trống = mọi nguồn */
  source?: string | null;
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
  Source: string | null;
  VoucherCode: string | null;
  DiscountAmount: number | null;
};

/**
 * Giá trị @Source cho các proc lọc theo nguồn: NULL = mọi nguồn, N'' = chưa gắn nguồn.
 * Dùng chung cho /payment và /customers.
 */
export function sourceFilterParam(source: string | null | undefined): string | null {
  if (!source) return null;
  if (source === SOURCE_NONE) return "";
  return normalizeSource(source)?.slice(0, SOURCE_MAX_LENGTH) ?? null;
}

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
    source: r.Source ?? null,
    voucherCode: r.VoucherCode ?? null,
    discountAmount: r.DiscountAmount ?? null,
  };
}

export async function listCoupons(filter: CouponListFilter = {}): Promise<CouponListResult> {
  const { partnerId = null, status = "ALL", q = "", source = null, page = 1, pageSize = 20 } = filter;
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
    const sourceParam = sourceFilterParam(source);

    const pool = await getPool();

    const dataReq = pool
      .request()
      .input("PartnerId", sql.Int,           validPartnerId)
      .input("Status",    sql.NVarChar(20),   status)
      .input("Q",         sql.NVarChar(200),  qParam)
      .input("Offset",    sql.Int,            offset)
      .input("PageSize",  sql.Int,            pageSize);

    type CountRow = { Total: number };
    const countReq = pool
      .request()
      .input("PartnerId", sql.Int,          validPartnerId)
      .input("Status",    sql.NVarChar(20),  status)
      .input("Q",         sql.NVarChar(200), qParam);

    // @Source chỉ gửi khi đang lọc, để proc bản trước (chưa chạy lại
    // db/all-stored-procedures.sql) vẫn trả được danh sách.
    if (sourceParam !== null) {
      dataReq.input("Source", sql.NVarChar(50), sourceParam);
      countReq.input("Source", sql.NVarChar(50), sourceParam);
    }

    const dataRes = await dataReq.execute<CouponRow>("usp_ListCoupons");
    const countRes = await countReq.execute<CountRow>("usp_CountCoupons");

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
  packageId?: number | null;
  userName?: string | null;
  note?: string | null;
  source?: string | null;
  voucherCode?: string | null;
  discountAmount?: number | null;
};

export async function createCoupon(input: CreateCouponInput): Promise<{ id: number; code: string }> {
  const numPartnerId =
    typeof input.partnerId === "string"
      ? parseInt(input.partnerId, 10)
      : input.partnerId;

  if (isNaN(numPartnerId)) throw new Error("PartnerId không hợp lệ.");

  const pool = await getPool();

  type InsertRow = { CouponID: number };
  const req = pool
    .request()
    .input("PartnerId",   sql.Int,               numPartnerId)
    .input("CouponCode",  sql.NVarChar(50),       input.code)
    .input("PaymentLink", sql.NVarChar(sql.MAX),  input.paymentLink)
    .input("UserName",    sql.NVarChar(256),      input.userName ?? null)
    .input("Note",        sql.NVarChar(sql.MAX),  input.note ?? null);

  // Chỉ gửi khi có giá trị: link không có nguồn/mã vẫn tạo được với proc bản trước.
  if (input.source) req.input("Source", sql.NVarChar(50), input.source);
  if (input.voucherCode) {
    req.input("VoucherCode", sql.NVarChar(20), input.voucherCode);
    req.input("DiscountAmount", sql.Decimal(18, 2), input.discountAmount ?? 0);
  }

  const res = await req.execute<InsertRow>("usp_CreateCoupon");

  const newId = res.recordset[0]?.CouponID;
  if (!newId) throw new Error("INSERT Coupons thất bại — không lấy được CouponID.");

  if (input.packageId !== null && input.packageId !== undefined) {
    await pool
      .request()
      .input("CouponID", sql.Int, newId)
      .input("PackageId", sql.Int, input.packageId)
      .query("UPDATE Coupons SET PackageId = @PackageId WHERE CouponID = @CouponID");
  }

  return { id: newId, code: input.code };
}

/**
 * Các nguồn khách đối tác đã gắn cho link (mới dùng gần nhất trước) — gợi ý ở trang tạo
 * link và danh sách cho ô lọc. partnerId null = mọi đối tác (admin).
 */
export async function listCouponSources(partnerId: string | number | null): Promise<string[]> {
  const numPartnerId =
    partnerId === null ? null : typeof partnerId === "string" ? parseInt(partnerId, 10) : partnerId;

  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("PartnerId", sql.Int, numPartnerId !== null && !isNaN(numPartnerId) ? numPartnerId : null)
      .execute<{ Source: string | null }>("usp_ListCouponSources");
    return res.recordset.map((r) => r.Source?.trim() ?? "").filter(Boolean);
  } catch (err) {
    console.error("[listCouponSources]", err);
    return [];
  }
}
