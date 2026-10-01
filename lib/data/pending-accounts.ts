import { getPool, sql } from "@/lib/db/sql";

/**
 * Đơn CTV bán ĐÃ THU TIỀN nhưng email khách CHƯA CÓ tài khoản FireAnt.
 *
 * /payment/create cho phép bán cho email chưa tồn tại ("thu tiền trước, tạo tài khoản sau").
 * Quyền lợi ghi theo UserName nên khách chỉ nhận được gói khi đăng ký đúng email đó —
 * danh sách này để CTV đeo bám cho tới lúc khách đăng ký. Dòng tự biến mất khi khách
 * đăng ký (điều kiện tính trực tiếp trên AspNetUsers, không có cờ lưu sẵn để lệch).
 *
 * SQL: db/stored-procedures/usp_ListPaidOrdersWithoutAccount.sql
 */
export type PendingAccountOrder = {
  orderId: number;
  orderDate: Date;
  userName: string;
  amount: number;
  packageName: string | null;
  serviceId: number | null;
  endDate: Date | null;
  couponCode: string;
  partnerId: number;
  partnerName: string | null;
  partnerEmail: string | null;
  note: string | null;
  /** Số CTV nhập lúc tạo link — điền sẵn khi tạo tài khoản hộ khách */
  customerPhone: string | null;
};

export type PendingAccountFilter = {
  partnerId?: string | number | null;
  q?: string;
  page?: number;
  pageSize?: number;
};

export type PendingAccountResult = {
  rows: PendingAccountOrder[];
  total: number;
  page: number;
  pageSize: number;
};

type PendingRow = {
  OrderID: number;
  OrderDate: Date;
  UserName: string;
  Amount: number;
  PackageName: string | null;
  ServiceID: number | null;
  EndDate: Date | null;
  CouponID: number;
  CouponCode: string;
  PartnerId: number;
  Note: string | null;
  CreatedDate: Date;
  CustomerPhone?: string | null;
  PartnerName: string | null;
  PartnerEmail: string | null;
};

function mapRow(r: PendingRow): PendingAccountOrder {
  return {
    orderId: r.OrderID,
    orderDate: r.OrderDate,
    userName: r.UserName,
    amount: r.Amount ?? 0,
    packageName: r.PackageName ?? null,
    serviceId: r.ServiceID ?? null,
    endDate: r.EndDate ?? null,
    couponCode: r.CouponCode,
    partnerId: r.PartnerId,
    partnerName: r.PartnerName ?? null,
    partnerEmail: r.PartnerEmail ?? null,
    note: r.Note ?? null,
    customerPhone: r.CustomerPhone ?? null,
  };
}

export async function listPaidOrdersWithoutAccount(
  filter: PendingAccountFilter = {},
): Promise<PendingAccountResult> {
  const { partnerId = null, q = "", page = 1, pageSize = 20 } = filter;

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

    // Một lần gọi cho cả trang lẫn tổng số: tập ứng viên (và lượt join sang linked server
    // NEWFA) chỉ dựng một lần thay vì hai. Xem chú thích hiệu năng trong
    // db/stored-procedures/usp_ListPaidOrdersWithoutAccount.sql.
    const dataRes = await pool
      .request()
      .input("PartnerId", sql.Int, validPartnerId)
      .input("Q", sql.NVarChar(200), qParam)
      .input("Offset", sql.Int, offset)
      .input("PageSize", sql.Int, pageSize)
      .output("Total", sql.Int)
      .execute<PendingRow>("usp_ListPaidOrdersWithoutAccount");

    return {
      rows: dataRes.recordset.map(mapRow),
      total: (dataRes.output.Total as number | null) ?? 0,
      page,
      pageSize,
    };
  } catch (err) {
    console.error("[listPaidOrdersWithoutAccount]", err);
    return { rows: [], total: 0, page, pageSize };
  }
}

/**
 * Số đơn đang chờ khách đăng ký tài khoản — badge trên /payment.
 * Gọi proc đếm riêng (không kèm danh sách) vì chỗ đó không cần dòng nào.
 */
export async function countPaidOrdersWithoutAccount(
  partnerId?: string | number | null,
): Promise<number> {
  try {
    const numPartnerId =
      partnerId !== null && partnerId !== undefined
        ? typeof partnerId === "string"
          ? parseInt(partnerId, 10)
          : partnerId
        : null;

    const validPartnerId = numPartnerId !== null && !isNaN(numPartnerId) ? numPartnerId : null;

    const pool = await getPool();
    const res = await pool
      .request()
      .input("PartnerId", sql.Int, validPartnerId)
      .input("Q", sql.NVarChar(200), null)
      .execute<{ Total: number }>("usp_CountPaidOrdersWithoutAccount");

    return res.recordset[0]?.Total ?? 0;
  } catch (err) {
    console.error("[countPaidOrdersWithoutAccount]", err);
    return 0;
  }
}
