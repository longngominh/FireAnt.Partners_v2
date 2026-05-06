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

  const offset = (page - 1) * pageSize;
  const pool = await getPool();

  const partnerClause =
    numPartnerId !== null && !isNaN(numPartnerId)
      ? "cp.PartnerId = @partnerId"
      : "1=1";

  const searchClause =
    q.trim()
      ? "(o.UserName LIKE @q OR ISNULL(u.Email,'') LIKE @q OR ISNULL(u.PhoneNumber,'') LIKE @q)"
      : "1=1";

  const req = pool
    .request()
    .input("offset",   sql.Int,          offset)
    .input("pageSize", sql.Int,          pageSize)
    .input("q",        sql.NVarChar(200), q.trim() ? `%${q.trim()}%` : null);

  if (numPartnerId !== null && !isNaN(numPartnerId)) {
    req.input("partnerId", sql.Int, numPartnerId);
  }

  const dataRes = await req.query<CustomerRow>(`
    SELECT
      o.UserName,
      u.Email,
      u.PhoneNumber,
      SUM(pkg.Amount)    AS TotalSpent,
      COUNT(o.OrderID)   AS OrderCount,
      MIN(o.OrderDate)   AS FirstOrderAt,
      MAX(o.OrderDate)   AS LastOrderAt,
      (SELECT TOP 1 so2.StartDate FROM [EStocks_Data].[dbo].[service_Orders] so2
         WHERE so2.UserName = o.UserName AND so2.IsPaid = 1 ORDER BY so2.OrderDate DESC) AS MemberStartDate,
      (SELECT TOP 1 so2.EndDate   FROM [EStocks_Data].[dbo].[service_Orders] so2
         WHERE so2.UserName = o.UserName AND so2.IsPaid = 1 ORDER BY so2.OrderDate DESC) AS MemberEndDate,
      (SELECT TOP 1 pkg2.PackageName
         FROM [EStocks_Data].[dbo].[service_Orders] so2
         LEFT JOIN [EStocks_Data].[dbo].[service_Packages] pkg2 ON so2.PackageID = pkg2.PackageID
         WHERE so2.UserName = o.UserName AND so2.IsPaid = 1 ORDER BY so2.OrderDate DESC) AS LatestPackage,
      pu.Name AS PartnerName
    FROM  Coupons cp
    INNER JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
    LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
    LEFT  JOIN [NEWFA].[FireAnt_Identity].[dbo].[AspNetUsers] u  ON u.UserName  = o.UserName
    LEFT  JOIN Partners p                                         ON p.PartnerId = cp.PartnerId
    LEFT  JOIN [NEWFA].[FireAnt_Identity].[dbo].[AspNetUsers] pu ON pu.Id       = p.UserId
    WHERE cp.IsUsed = 1
      AND ${partnerClause}
      AND ${searchClause}
    GROUP BY o.UserName, u.Email, u.PhoneNumber, pu.Name
    ORDER BY MAX(o.OrderDate) DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);

  // Count
  const countReq = pool
    .request()
    .input("q2", sql.NVarChar(200), q.trim() ? `%${q.trim()}%` : null);

  if (numPartnerId !== null && !isNaN(numPartnerId)) {
    countReq.input("partnerId2", sql.Int, numPartnerId);
  }

  const countPartnerClause =
    numPartnerId !== null && !isNaN(numPartnerId)
      ? "cp.PartnerId = @partnerId2"
      : "1=1";

  const countSearchClause =
    q.trim()
      ? "o.UserName LIKE @q2"
      : "1=1";

  type CountRow = { Total: number };
  const countRes = await countReq.query<CountRow>(`
    SELECT COUNT(DISTINCT o.UserName) AS Total
    FROM  Coupons cp
    INNER JOIN [EStocks_Data].[dbo].[service_Orders] o ON o.CouponCode = cp.CouponCode
    WHERE cp.IsUsed = 1
      AND ${countPartnerClause}
      AND ${countSearchClause}
  `);

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
