import { getPool, sql } from "@/lib/db/sql";

export type Customer = {
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
};

export type CustomerListFilter = {
  partnerId?: string | number | null;
  q?: string;
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
  PartnerName: string | null;
};

export async function listCustomers(filter: CustomerListFilter = {}): Promise<CustomerListResult> {
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

    const dataRes = await pool
      .request()
      .input("PartnerId", sql.Int,          validPartnerId)
      .input("Q",         sql.NVarChar(200), qParam)
      .input("Offset",    sql.Int,           offset)
      .input("PageSize",  sql.Int,           pageSize)
      .execute<CustomerRow>("usp_ListCustomers");

    type CountRow = { Total: number };
    const countRes = await pool
      .request()
      .input("PartnerId", sql.Int,          validPartnerId)
      .input("Q",         sql.NVarChar(200), qParam)
      .execute<CountRow>("usp_CountCustomers");

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
      partnerName: r.PartnerName ?? null,
    }));

    return {
      rows,
      total: countRes.recordset[0]?.Total ?? 0,
      page,
      pageSize,
    };
  } catch (err) {
    console.error("[listCustomers]", err);
    return { rows: [], total: 0, page: filter.page ?? 1, pageSize: filter.pageSize ?? 20 };
  }
}
