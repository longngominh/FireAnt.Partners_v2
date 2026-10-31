import { getPool, sql } from "@/lib/db/sql";
import { listScope } from "@/lib/data/scope";
import { sourceFilterParam } from "@/lib/data/payment";

export type Customer = {
  /** Người bán (chủ link) — đối tác hoặc nhân viên của đối tác. */
  partnerId: number | null;
  username: string;
  email: string | null;
  phone: string | null;
  totalSpent: number;
  orderCount: number;
  firstOrderAt: Date;
  lastOrderAt: Date;
  memberStartDate: Date | null;
  memberEndDate: Date | null;
  latestPackage: string | null;
  partnerName: string | null;
  /** Nguồn gắn trên link của đơn sớm nhất có gắn nguồn — kênh đưa khách về */
  source: string | null;
};

export type CustomerListFilter = {
  partnerId?: string | number | null;
  /** Đối tác: gồm cả khách mua qua link của nhân viên trong thời gian được ghi nhận. */
  teamOf?: number | null;
  q?: string;
  /** Tên nguồn, hoặc SOURCE_NONE = khách chưa gắn nguồn; bỏ trống = mọi nguồn */
  source?: string | null;
  page?: number;
  pageSize?: number;
};

export type CustomerListResult = {
  rows: Customer[];
  total: number;
  page: number;
  pageSize: number;
};

type CustomerRow = {
  UserName: string;
  Email: string | null;
  PhoneNumber: string | null;
  TotalSpent: number;
  OrderCount: number;
  FirstOrderAt: Date;
  LastOrderAt: Date;
  MemberStartDate: Date | null;
  MemberEndDate: Date | null;
  LatestPackage: string | null;
  PartnerId?: number | null;
  PartnerName: string | null;
  Source: string | null;
};

export async function listCustomers(filter: CustomerListFilter = {}): Promise<CustomerListResult> {
  const { partnerId = null, teamOf = null, q = "", source = null, page = 1, pageSize = 20 } = filter;
  try {
    const numPartnerId =
      partnerId !== null && partnerId !== undefined
        ? typeof partnerId === "string"
          ? parseInt(partnerId, 10)
          : partnerId
        : null;

    const scope = await listScope(
      numPartnerId !== null && !isNaN(numPartnerId) ? numPartnerId : null,
      teamOf,
    );
    const validPartnerId = scope.partnerId;
    const offset = (page - 1) * pageSize;
    const qParam = q.trim() ? `%${q.trim()}%` : null;

    const pool = await getPool();

    // Một lần gọi cho cả trang lẫn tổng số: tập ứng viên (và lượt join sang linked server
    // NEWFA) chỉ dựng một lần. Xem chú thích hiệu năng trong
    // db/stored-procedures/usp_ListCustomers.sql.
    const req = pool
      .request()
      .input("PartnerId", sql.Int,          validPartnerId)
      .input("Q",         sql.NVarChar(200), qParam)
      .input("Offset",    sql.Int,           offset)
      .input("PageSize",  sql.Int,           pageSize)
      .output("Total",    sql.Int);

    // Chỉ gửi @Source khi đang lọc — proc bản trước vẫn chạy được (xem listCoupons).
    const sourceParam = sourceFilterParam(source);
    if (sourceParam !== null) req.input("Source", sql.NVarChar(50), sourceParam);
    if (scope.teamOf !== null) req.input("TeamOf", sql.Int, scope.teamOf);

    const dataRes = await req.execute<CustomerRow>("usp_ListCustomers");

    const rows: Customer[] = dataRes.recordset.map((r) => ({
      username: r.UserName,
      email: r.Email ?? null,
      phone: r.PhoneNumber ?? null,
      totalSpent: r.TotalSpent,
      orderCount: r.OrderCount,
      firstOrderAt: r.FirstOrderAt,
      lastOrderAt: r.LastOrderAt,
      memberStartDate: r.MemberStartDate ?? null,
      memberEndDate: r.MemberEndDate ?? null,
      latestPackage: r.LatestPackage ?? null,
      partnerId: r.PartnerId ?? null,
      partnerName: r.PartnerName ?? null,
      source: r.Source ?? null,
    }));

    return {
      rows,
      total: (dataRes.output.Total as number | null) ?? 0,
      page,
      pageSize,
    };
  } catch (err) {
    console.error("[listCustomers]", err);
    return { rows: [], total: 0, page: filter.page ?? 1, pageSize: filter.pageSize ?? 20 };
  }
}
